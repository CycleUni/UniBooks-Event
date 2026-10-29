import { Hono, type Context } from 'hono';
import { and, asc, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { createDb, events, eventPrizes, eventLotteryEntries, type EventPrize } from '../db';
import { authenticateRequest, type AuthUser } from '../lib/auth';
import { mainFetch } from '../lib/main-site';
import { findRegion } from '../lib/regions';
import { MAX_IMAGE_BYTES, isMediaUrl, isValidMediaUrl, mediaUrl, newMediaKey, sniffImage, contentTypeOf } from '../lib/media';

type AppEnv = {
  Bindings: CloudflareEnv;
  Variables: { user?: Promise<AuthUser | null> };
};
type C = Context<AppEnv>;

export const api = new Hono<AppEnv>();

class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 500 | 502,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

api.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ success: false, error: err.code, ...err.extra }, err.status);
  }
  // Internal details stay in the log, not in the response. Spelled out: the
  // log keeps only a stack otherwise, and drizzle puts D1's own message in `cause`.
  const cause = (err as { cause?: unknown }).cause;
  console.error('[event api]', err.message, cause instanceof Error ? `cause: ${cause.message}` : '', err.stack);
  return c.json({ success: false, error: 'internal_error' }, 500);
});

// Cookie-authenticated writes must come from this site's own pages. SameSite=Lax
// already keeps the session cookie off cross-site POSTs; this also covers
// same-site hosts (other unibooks.app subdomains) and old browsers.
api.use('*', async (c, next) => {
  const method = c.req.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = c.req.header('Origin');
    if (!origin || origin !== new URL(c.req.url).origin) throw new HttpError(403, 'bad_origin');
  }
  await next();
});

/**
 * Who is signed in, asked of the main site at most once per request and only
 * by the routes that need to know: public pages never cost the main site a call.
 */
function currentUser(c: C): Promise<AuthUser | null> {
  let user = c.get('user');
  if (!user) {
    user = authenticateRequest(c.req.raw, c.env).catch((err) => {
      console.error('[event api] main site /auth/me failed', err);
      throw new HttpError(502, 'main_site_unavailable');
    });
    c.set('user', user);
  }
  return user;
}

async function requireStaff(c: C): Promise<AuthUser> {
  const user = await currentUser(c);
  if (!user) throw new HttpError(401, 'unauthorized');
  if (!user.isStaff) throw new HttpError(403, 'forbidden');
  return user;
}

async function readJson(c: C): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'invalid_body');
}

/** A trimmed string of at most `max` characters; undefined when absent. */
function str(body: Record<string, unknown>, field: string, max: number): string | undefined {
  const v = body[field];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.trim().length > max) throw new HttpError(400, 'invalid_field', { field });
  return v.trim();
}

/** An integer in [min, max]; undefined when absent. */
function int(body: Record<string, unknown>, field: string, min: number, max: number): number | undefined {
  const v = body[field];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new HttpError(400, 'invalid_field', { field });
  }
  return v;
}

/** A boolean (1/0 also accepted) as 1/0; undefined when absent. */
function flag(body: Record<string, unknown>, field: string): 0 | 1 | undefined {
  const v = body[field];
  if (v === undefined) return undefined;
  if (v === true || v === 1) return 1;
  if (v === false || v === 0) return 0;
  throw new HttpError(400, 'invalid_field', { field });
}

/**
 * A region code (either case) that the main site's database has, upper-case;
 * undefined when absent.
 */
async function region(c: C, body: Record<string, unknown>, field: string): Promise<string | undefined> {
  const v = body[field];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !/^[a-z]{2}$/i.test(v)) throw new HttpError(400, 'invalid_field', { field });
  let known;
  try {
    known = await findRegion(c.env, c.req.raw, v);
  } catch (err) {
    console.error('[event api] main site regions failed', err);
    throw new HttpError(502, 'main_site_unavailable');
  }
  if (!known) throw new HttpError(400, 'invalid_field', { field });
  return known.code.toUpperCase();
}

/**
 * An uploaded image's URL or another http(s) image URL, or null to clear it;
 * undefined when absent. A URL in this system's image space must name a key it wrote.
 */
function imageUrl(c: C, body: Record<string, unknown>, field: string): string | null | undefined {
  const v = body[field];
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v === 'string' && isMediaUrl(c.env, v)) {
    if (isValidMediaUrl(c.env, v)) return v;
    throw new HttpError(400, 'invalid_field', { field });
  }
  if (typeof v === 'string' && v.length <= 2048) {
    try {
      const u = new URL(v);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {
      // fall through
    }
  }
  throw new HttpError(400, 'invalid_field', { field });
}


/** A uniform integer in [0, n), from the platform CSPRNG. */
function randomBelow(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

function pickWeighted(prizes: EventPrize[]): EventPrize {
  const total = prizes.reduce((sum, p) => sum + p.probabilityWeight, 0);
  let r = randomBelow(total);
  for (const p of prizes) {
    if (r < p.probabilityWeight) return p;
    r -= p.probabilityWeight;
  }
  return prizes[prizes.length - 1];
}

async function findEvent(c: C, eventId: string) {
  const [event] = await createDb(c.env.DB).select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new HttpError(404, 'event_not_found');
  return event;
}

/** Whether this staff member manages the region: an admin manages all of them. */
function manages(user: AuthUser, regionCode: string): boolean {
  return user.managedRegions === null || user.managedRegions.includes(regionCode);
}

/**
 * An event the signed-in staff member may manage. One in a region they do not
 * manage answers 404, as the main site's admin does for objects out of scope.
 */
async function findManagedEvent(c: C, eventId: string) {
  const user = await requireStaff(c);
  const event = await findEvent(c, eventId);
  if (!manages(user, event.regionCode)) throw new HttpError(404, 'event_not_found');
  return event;
}

/** A region the staff member may put an event in: 403 region_forbidden otherwise. */
function assertManages(user: AuthUser, regionCode: string): void {
  if (!manages(user, regionCode)) throw new HttpError(403, 'region_forbidden');
}

// 401 when nobody is signed in, so a page can tell that from the main site being down (502).
api.get('/me', async (c) => {
  const user = await currentUser(c);
  return c.json({ success: !!user, user }, user ? 200 : 401);
});

// --- Events --------------------------------------------------------------

/**
 * How long a browser may reuse a public event answer. Short, since the
 * remaining prizes change during a draw; a reload inside it stays in the browser.
 */
const PUBLIC_MAX_AGE = 30;

// Public: the active events, of one region when ?region= is given.
api.get('/events', async (c) => {
  // A filter only: an unknown region simply has no events.
  const query = c.req.query('region');
  if (query !== undefined && !/^[a-z]{2}$/i.test(query)) throw new HttpError(400, 'invalid_field', { field: 'region' });
  const regionCode = query?.toUpperCase();
  const rows = await createDb(c.env.DB)
    .select({
      id: events.id,
      title: events.title,
      description: events.description,
      coverImageUrl: events.coverImageUrl,
      regionCode: events.regionCode,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(regionCode ? and(eq(events.isActive, 1), eq(events.regionCode, regionCode)) : eq(events.isActive, 1))
    .orderBy(desc(events.createdAt));
  // The same for everyone (only active events): see PUBLIC_MAX_AGE.
  c.header('Cache-Control', `public, max-age=${PUBLIC_MAX_AGE}`);
  return c.json({ success: true, events: rows });
});

// The events of the regions this staff member manages (all of them for an admin).
api.get('/admin/events', async (c) => {
  const user = await requireStaff(c);
  if (user.managedRegions?.length === 0) return c.json({ success: true, events: [] });
  const rows = await createDb(c.env.DB)
    .select({
      ...getTableColumns(events),
      // Spelled out: inside a subquery Drizzle would leave the outer `id` unqualified.
      participantCount: sql<number>`(SELECT COUNT(DISTINCT ele.user_id) FROM event_lottery_entries ele WHERE ele.event_id = "events"."id")`,
    })
    .from(events)
    .where(user.managedRegions ? inArray(events.regionCode, user.managedRegions) : undefined)
    .orderBy(desc(events.createdAt));
  return c.json({ success: true, events: rows });
});

api.post('/events', async (c) => {
  const user = await requireStaff(c);
  const body = await readJson(c);
  const title = str(body, 'title', 120);
  if (!title) throw new HttpError(400, 'title_required');
  const regionCode = await region(c, body, 'regionCode');
  if (!regionCode) throw new HttpError(400, 'invalid_field', { field: 'regionCode' });
  assertManages(user, regionCode);

  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  await createDb(c.env.DB)
    .insert(events)
    .values({
      id: eventId,
      title,
      description: str(body, 'description', 2000) ?? '',
      coverImageUrl: imageUrl(c, body, 'coverImageUrl') ?? null,
      organizerId: user.id,
      regionCode,
      maxDrawsPerUser: int(body, 'maxDrawsPerUser', 1, 100) ?? 1,
      requireEduVerification: flag(body, 'requireEduVerification') ?? 1,
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    });
  return c.json({ success: true, eventId }, 201);
});

// Public for an active event (its page); staff also see inactive ones and the draw weights.
api.get('/events/:id', async (c) => {
  const user = await currentUser(c);
  const event = await findEvent(c, c.req.param('id'));
  // The staff view (inactive events, draw weights) for staff of the event's region; the public one otherwise.
  const staffView = !!user?.isStaff && manages(user, event.regionCode);
  if (!event.isActive && !staffView) throw new HttpError(404, 'event_not_found');

  const prizes = await createDb(c.env.DB)
    .select()
    .from(eventPrizes)
    .where(eq(eventPrizes.eventId, event.id))
    .orderBy(asc(eventPrizes.sortOrder), asc(eventPrizes.createdAt));

  if (staffView) {
    c.header('Cache-Control', 'no-store');
    return c.json({ success: true, event, prizes });
  }
  // The public view, the same for everyone. The admin pages ask with cache: 'no-store'.
  c.header('Cache-Control', `public, max-age=${PUBLIC_MAX_AGE}`);
  const { organizerId: _o, ...publicEvent } = event;
  return c.json({
    success: true,
    event: publicEvent,
    prizes: prizes.map(({ probabilityWeight: _w, ...p }) => p),
  });
});

api.put('/events/:id', async (c) => {
  const event = await findManagedEvent(c, c.req.param('id'));
  const body = await readJson(c);
  const title = str(body, 'title', 120);
  if (title === '') throw new HttpError(400, 'title_required');
  const cover = imageUrl(c, body, 'coverImageUrl');
  const regionCode = await region(c, body, 'regionCode');
  if (regionCode) assertManages(await requireStaff(c), regionCode);

  await createDb(c.env.DB)
    .update(events)
    .set({
      title: title ?? event.title,
      description: str(body, 'description', 2000) ?? event.description,
      coverImageUrl: cover === undefined ? event.coverImageUrl : cover,
      regionCode: regionCode ?? event.regionCode,
      maxDrawsPerUser: int(body, 'maxDrawsPerUser', 1, 100) ?? event.maxDrawsPerUser,
      requireEduVerification: flag(body, 'requireEduVerification') ?? event.requireEduVerification,
      isActive: flag(body, 'isActive') ?? event.isActive,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(events.id, event.id));
  return c.json({ success: true });
});

// --- Prizes --------------------------------------------------------------

const MAX_QUANTITY = 100_000;

api.post('/events/:id/prizes', async (c) => {
  const event = await findManagedEvent(c, c.req.param('id'));
  const body = await readJson(c);
  const name = str(body, 'name', 120);
  if (!name) throw new HttpError(400, 'prize_name_required');
  const quantity = int(body, 'totalQuantity', -1, MAX_QUANTITY) ?? -1;

  const prizeId = crypto.randomUUID();
  await createDb(c.env.DB)
    .insert(eventPrizes)
    .values({
      id: prizeId,
      eventId: event.id,
      name,
      description: str(body, 'description', 500) ?? '',
      imageUrl: imageUrl(c, body, 'imageUrl') ?? null,
      probabilityWeight: int(body, 'probabilityWeight', 1, 1_000_000) ?? 1,
      totalQuantity: quantity,
      remainingQuantity: quantity,
      sortOrder: int(body, 'sortOrder', -1000, 1000) ?? 0,
      createdAt: new Date().toISOString(),
    });
  return c.json({ success: true, prizeId }, 201);
});

async function findPrize(c: C): Promise<EventPrize> {
  const [prize] = await createDb(c.env.DB)
    .select()
    .from(eventPrizes)
    .where(and(eq(eventPrizes.id, c.req.param('prizeId')!), eq(eventPrizes.eventId, c.req.param('id')!)))
    .limit(1);
  if (!prize) throw new HttpError(404, 'prize_not_found');
  return prize;
}

api.put('/events/:id/prizes/:prizeId', async (c) => {
  await findManagedEvent(c, c.req.param('id')!);
  const prize = await findPrize(c);
  const body = await readJson(c);
  const name = str(body, 'name', 120);
  if (name === '') throw new HttpError(400, 'prize_name_required');
  const total = int(body, 'totalQuantity', -1, MAX_QUANTITY);
  const remaining = int(body, 'remainingQuantity', -1, MAX_QUANTITY);
  const image = imageUrl(c, body, 'imageUrl');

  const nextTotal = total ?? prize.totalQuantity;
  // Changing the total moves the stock by as much, unless a stock is given; it never exceeds the total.
  const given = remaining ?? (total === undefined ? prize.remainingQuantity : prize.remainingQuantity + nextTotal - prize.totalQuantity);
  const nextRemaining = nextTotal === -1 ? -1 : Math.min(nextTotal, Math.max(0, given === -1 ? nextTotal : given));

  await createDb(c.env.DB)
    .update(eventPrizes)
    .set({
      name: name ?? prize.name,
      description: str(body, 'description', 500) ?? prize.description,
      imageUrl: image === undefined ? prize.imageUrl : image,
      probabilityWeight: int(body, 'probabilityWeight', 1, 1_000_000) ?? prize.probabilityWeight,
      totalQuantity: nextTotal,
      remainingQuantity: nextRemaining,
      sortOrder: int(body, 'sortOrder', -1000, 1000) ?? prize.sortOrder,
    })
    .where(eq(eventPrizes.id, prize.id));
  return c.json({ success: true });
});

/**
 * Delete a prize nobody has won. Once someone has, deleting it would leave
 * their record with no prize (prize_id is set null), so it is refused: set its
 * stock to 0 to stop handing it out, or change those records first.
 */
api.delete('/events/:id/prizes/:prizeId', async (c) => {
  await findManagedEvent(c, c.req.param('id')!);
  const prize = await findPrize(c);
  const won = await c.env.DB.prepare('SELECT 1 FROM event_lottery_entries WHERE prize_id = ? LIMIT 1').bind(prize.id).first();
  if (won) throw new HttpError(409, 'prize_has_winners');
  await createDb(c.env.DB).delete(eventPrizes).where(eq(eventPrizes.id, prize.id));
  return c.json({ success: true });
});

// --- Images --------------------------------------------------------------

/**
 * Upload an image (the request body is the file). Staff only. The format is
 * read from the bytes; the stored copy gets a fresh name, so nothing about the
 * original file name reaches the URL.
 */
api.post('/uploads', async (c) => {
  await requireStaff(c);
  if (!c.env.MEDIA) throw new Error('The MEDIA bucket binding is not configured');
  const declared = Number(c.req.header('Content-Length') ?? '0');
  if (declared > MAX_IMAGE_BYTES) throw new HttpError(413, 'image_too_large', { maxBytes: MAX_IMAGE_BYTES });
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength === 0) throw new HttpError(400, 'invalid_image');
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new HttpError(413, 'image_too_large', { maxBytes: MAX_IMAGE_BYTES });
  const ext = sniffImage(bytes);
  if (!ext) throw new HttpError(415, 'unsupported_image_type');

  const key = newMediaKey(ext);
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: contentTypeOf(key) } });
  return c.json({ success: true, url: mediaUrl(c.env, key) }, 201);
});

// --- Draw ----------------------------------------------------------------

interface MemberPass {
  user_id: string;
  step: number;
  display_name: string;
  email_masked: string;
  is_verified: boolean;
  verified_regions: string[];
}

/** The main site's error codes for a member pass, as this API names them. */
const PASS_ERRORS: Record<string, [400 | 401 | 403 | 429, string]> = {
  'auth.errMemberTokenInvalid': [400, 'invalid_token'],
  'auth.errMemberTokenExpired': [400, 'token_expired'],
  'auth.errMemberNotFound': [400, 'user_not_eligible'],
  'common.errValidation': [400, 'invalid_token'],
  'auth.errNotLoggedIn': [401, 'unauthorized'],
  'admin.errForbiddenAction': [403, 'forbidden'],
};

/**
 * Asks the main site whose pass this is, as the signed-in staff member: the
 * main site holds the key, checks the signature and the account, and returns
 * no more than a draw needs.
 */
async function verifyMemberPass(c: C, token: string): Promise<MemberPass> {
  const res = await mainFetch(c.env, c.req.raw, '/api/v1/auth/member-token/verify', { method: 'POST', body: { token } });
  if (res.ok) return (await res.json()) as MemberPass;
  if (res.status === 429) throw new HttpError(429, 'rate_limited');
  const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? '';
  const known = PASS_ERRORS[code];
  if (known) throw new HttpError(known[0], known[1]);
  console.error('[event api] member pass check failed', res.status, code);
  throw new HttpError(502, 'main_site_unavailable');
}


/**
 * Scan a member pass and draw for its holder. Every limit is enforced by the
 * database, not by a read-then-write, so two scanners racing cannot exceed it:
 *  - one draw per scanned code (unique event/user/token_step),
 *  - at most max_draws_per_user draws (conditional insert),
 *  - a limited prize is only handed out while its stock lasts (conditional decrement).
 */
api.post('/events/:id/scan-and-draw', async (c) => {
  const operator = await requireStaff(c);
  const event = await findManagedEvent(c, c.req.param('id'));
  if (!event.isActive) throw new HttpError(400, 'event_inactive');

  const body = await readJson(c);
  if (typeof body.qrToken !== 'string') throw new HttpError(400, 'qr_token_required');
  const member = await verifyMemberPass(c, body.qrToken);
  const { user_id: userId, step } = member;
  const db = createDb(c.env.DB);

  // A school verification in the event's region (the main site's verifications are per region).
  if (event.requireEduVerification && !member.verified_regions.includes(event.regionCode)) {
    throw new HttpError(400, 'edu_verification_required');
  }

  // Claim a draw: the insert only happens while the member is under the limit.
  const entryId = crypto.randomUUID();
  let claimed: D1Result;
  try {
    claimed = await c.env.DB.prepare(
      `INSERT INTO event_lottery_entries (id, event_id, user_id, prize_id, is_winner, operator_id, token_step, scanned_at, user_name, user_email_masked)
       SELECT ?1, ?2, ?3, NULL, 0, ?4, ?5, ?6, ?8, ?9
       WHERE (SELECT COUNT(*) FROM event_lottery_entries WHERE event_id = ?2 AND user_id = ?3 AND is_manual = 0) < ?7`,
    )
      .bind(
        entryId,
        event.id,
        userId,
        operator.id,
        step,
        new Date().toISOString(),
        event.maxDrawsPerUser,
        member.display_name,
        member.email_masked,
      )
      .run();
  } catch (err) {
    if (String(err).includes('UNIQUE')) throw new HttpError(409, 'code_already_used');
    throw err;
  }
  if (!claimed.meta.changes) {
    throw new HttpError(400, 'max_draws_reached', { maxDraws: event.maxDrawsPerUser });
  }

  // Draw among the prizes in stock; a prize that ran out meanwhile is dropped and the draw repeated.
  let candidates = (await db.select().from(eventPrizes).where(eq(eventPrizes.eventId, event.id))).filter(
    (p) => p.remainingQuantity === -1 || p.remainingQuantity > 0,
  );
  let prize: EventPrize | null = null;
  while (candidates.length > 0) {
    const pick = pickWeighted(candidates);
    if (pick.remainingQuantity === -1) {
      prize = pick;
      break;
    }
    const taken = await c.env.DB.prepare(
      'UPDATE event_prizes SET remaining_quantity = remaining_quantity - 1 WHERE id = ? AND remaining_quantity > 0',
    )
      .bind(pick.id)
      .run();
    if (taken.meta.changes) {
      prize = pick;
      break;
    }
    candidates = candidates.filter((p) => p.id !== pick.id);
  }

  if (prize) {
    await db.update(eventLotteryEntries).set({ prizeId: prize.id, isWinner: 1 }).where(eq(eventLotteryEntries.id, entryId));
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(eventLotteryEntries)
    .where(
      and(eq(eventLotteryEntries.eventId, event.id), eq(eventLotteryEntries.userId, userId), eq(eventLotteryEntries.isManual, 0)),
    );

  return c.json({
    success: true,
    isWinner: prize !== null,
    prize: prize && { id: prize.id, name: prize.name, description: prize.description, imageUrl: prize.imageUrl },
    // What a public screen may show: no full email.
    user: { name: member.display_name, emailMasked: member.email_masked },
    drawCount: count,
    maxDraws: event.maxDrawsPerUser,
  });
});

api.get('/events/:id/entries', async (c) => {
  const event = await findManagedEvent(c, c.req.param('id'));
  const entries = await createDb(c.env.DB)
    .select({
      id: eventLotteryEntries.id,
      userId: eventLotteryEntries.userId,
      prizeId: eventLotteryEntries.prizeId,
      isWinner: eventLotteryEntries.isWinner,
      scannedAt: eventLotteryEntries.scannedAt,
      userName: eventLotteryEntries.userName,
      userEmailMasked: eventLotteryEntries.userEmailMasked,
      prizeName: eventPrizes.name,
    })
    .from(eventLotteryEntries)
    .leftJoin(eventPrizes, eq(eventLotteryEntries.prizeId, eventPrizes.id))
    .where(eq(eventLotteryEntries.eventId, event.id))
    .orderBy(desc(eventLotteryEntries.scannedAt))
    .limit(100);
  return c.json({ success: true, entries });
});

// --- Participants --------------------------------------------------------

interface MemberForStaff {
  user_id: string;
  display_name: string;
  email_masked: string;
}

interface EntryRow {
  id: string;
  userId: string;
  userName: string;
  userEmailMasked: string;
  prizeId: string | null;
  prizeName: string | null;
  isManual: number;
  scannedAt: string;
}

/**
 * Everyone in an event (drew, or added by hand), one row each, newest first,
 * with each of their records (draws, and the entry of someone added by hand)
 * and the prizes they won.
 */
api.get('/events/:id/participants', async (c) => {
  const event = await findManagedEvent(c, c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    `SELECT e.id, e.user_id AS userId, e.user_name AS userName, e.user_email_masked AS userEmailMasked,
            e.prize_id AS prizeId, p.name AS prizeName, e.is_manual AS isManual, e.scanned_at AS scannedAt
       FROM event_lottery_entries e
       LEFT JOIN event_prizes p ON p.id = e.prize_id
      WHERE e.event_id = ?
      ORDER BY e.scanned_at DESC`,
  )
    .bind(event.id)
    .all<EntryRow>();

  const byUser = new Map<string, { userId: string; userName: string; userEmailMasked: string; draws: number; addedByStaff: boolean; prizes: string[]; lastAt: string; entries: object[] }>();
  for (const e of results) {
    let p = byUser.get(e.userId);
    if (!p) {
      p = { userId: e.userId, userName: e.userName, userEmailMasked: e.userEmailMasked, draws: 0, addedByStaff: false, prizes: [], lastAt: e.scannedAt, entries: [] };
      byUser.set(e.userId, p);
    }
    if (e.isManual) p.addedByStaff = true;
    else p.draws += 1;
    if (e.prizeName) p.prizes.push(e.prizeName);
    p.entries.push({ id: e.id, prizeId: e.prizeId, prizeName: e.prizeName, isManual: !!e.isManual, scannedAt: e.scannedAt });
  }
  const participants = [...byUser.values()];
  return c.json({ success: true, count: participants.length, participants });
});

/** Who a member ID belongs to, asked of the main site. */
async function memberById(c: C, memberId: string): Promise<MemberForStaff> {
  const res = await mainFetch(c.env, c.req.raw, `/api/v1/auth/members/${memberId}`);
  if (res.status === 404) throw new HttpError(404, 'member_not_found');
  if (res.status === 429) throw new HttpError(429, 'rate_limited');
  if (!res.ok) {
    console.error('[event api] member lookup failed', res.status);
    throw new HttpError(502, 'main_site_unavailable');
  }
  return (await res.json()) as MemberForStaff;
}

/**
 * Add someone by hand: by scanning their member pass (`qrToken`), or by the
 * member ID their account page shows (`memberId`).
 */
api.post('/events/:id/participants', async (c) => {
  const operator = await requireStaff(c);
  const event = await findManagedEvent(c, c.req.param('id'));
  const body = await readJson(c);

  let member: MemberForStaff;
  if (typeof body.qrToken === 'string') {
    member = await verifyMemberPass(c, body.qrToken);
  } else {
    const memberId = typeof body.memberId === 'string' ? body.memberId.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(memberId)) {
      throw new HttpError(400, 'invalid_field', { field: 'memberId' });
    }
    member = await memberById(c, memberId);
  }

  const [existing] = await createDb(c.env.DB)
    .select({ id: eventLotteryEntries.id })
    .from(eventLotteryEntries)
    .where(and(eq(eventLotteryEntries.eventId, event.id), eq(eventLotteryEntries.userId, member.user_id)))
    .limit(1);
  if (existing) throw new HttpError(409, 'already_participant');

  const now = Date.now();
  await createDb(c.env.DB).insert(eventLotteryEntries).values({
    id: crypto.randomUUID(),
    eventId: event.id,
    userId: member.user_id,
    prizeId: null,
    isWinner: 0,
    operatorId: operator.id,
    userName: member.display_name,
    userEmailMasked: member.email_masked,
    // No draw: a negative step can never meet a scanned one.
    tokenStep: -now,
    isManual: 1,
    scannedAt: new Date(now).toISOString(),
  });
  return c.json(
    { success: true, participant: { userId: member.user_id, userName: member.display_name, userEmailMasked: member.email_masked } },
    201,
  );
});

/**
 * A statement that takes one of a limited prize from stock, and fails (so the
 * batch around it rolls back) when there is none left: SQLite has no RAISE
 * outside triggers, so the out-of-stock branch evaluates json() on text that
 * is not JSON, which errors.
 */
function takeFromStock(db: D1Database, prizeId: string) {
  return db
    .prepare(
      `UPDATE event_prizes
          SET remaining_quantity = CASE WHEN remaining_quantity > 0 THEN remaining_quantity - 1 ELSE json('out of stock') END
        WHERE id = ? AND total_quantity <> -1`,
    )
    .bind(prizeId);
}

function returnToStock(db: D1Database, prizeId: string) {
  return db
    .prepare('UPDATE event_prizes SET remaining_quantity = MIN(total_quantity, remaining_quantity + 1) WHERE id = ? AND total_quantity <> -1')
    .bind(prizeId);
}

async function findEntry(c: C, eventId: string) {
  const [entry] = await createDb(c.env.DB)
    .select()
    .from(eventLotteryEntries)
    .where(and(eq(eventLotteryEntries.id, c.req.param('entryId')!), eq(eventLotteryEntries.eventId, eventId)))
    .limit(1);
  if (!entry) throw new HttpError(404, 'entry_not_found');
  return entry;
}

/**
 * Correct one record: the prize it gave (`prizeId`, or null for none). Stock
 * follows: the old prize goes back, the new one is taken, in one transaction.
 */
api.patch('/events/:id/entries/:entryId', async (c) => {
  const event = await findManagedEvent(c, c.req.param('id'));
  const entry = await findEntry(c, event.id);
  const body = await readJson(c);
  if (body.prizeId !== null && typeof body.prizeId !== 'string') throw new HttpError(400, 'invalid_field', { field: 'prizeId' });
  const prizeId = body.prizeId as string | null;
  if (prizeId === entry.prizeId) return c.json({ success: true });
  if (prizeId) {
    const [prize] = await createDb(c.env.DB)
      .select({ id: eventPrizes.id })
      .from(eventPrizes)
      .where(and(eq(eventPrizes.id, prizeId), eq(eventPrizes.eventId, event.id)))
      .limit(1);
    if (!prize) throw new HttpError(400, 'invalid_field', { field: 'prizeId' });
  }

  const db = c.env.DB;
  try {
    await db.batch([
      ...(prizeId ? [takeFromStock(db, prizeId)] : []),
      ...(entry.prizeId ? [returnToStock(db, entry.prizeId)] : []),
      db.prepare('UPDATE event_lottery_entries SET prize_id = ?, is_winner = ? WHERE id = ?').bind(prizeId, prizeId ? 1 : 0, entry.id),
    ]);
  } catch (err) {
    if (String(err).includes('malformed JSON')) throw new HttpError(409, 'out_of_stock');
    throw err;
  }
  return c.json({ success: true });
});

/** Delete one record (a draw, or the entry of someone added by hand); its prize goes back in stock. */
api.delete('/events/:id/entries/:entryId', async (c) => {
  const event = await findManagedEvent(c, c.req.param('id'));
  const entry = await findEntry(c, event.id);
  const db = c.env.DB;
  await db.batch([
    ...(entry.prizeId ? [returnToStock(db, entry.prizeId)] : []),
    db.prepare('DELETE FROM event_lottery_entries WHERE id = ?').bind(entry.id),
  ]);
  return c.json({ success: true });
});

/** Remove someone from an event: their records go, prizes they won go back in stock, and they may draw again. */
api.delete('/events/:id/participants/:userId', async (c) => {
  const event = await findManagedEvent(c, c.req.param('id'));
  const userId = c.req.param('userId')!.toLowerCase();
  const { results: won } = await c.env.DB.prepare(
    `SELECT prize_id AS prizeId, COUNT(*) AS n FROM event_lottery_entries
      WHERE event_id = ? AND user_id = ? AND prize_id IS NOT NULL GROUP BY prize_id`,
  )
    .bind(event.id, userId)
    .all<{ prizeId: string; n: number }>();

  // One transaction: the stock and the records change together or not at all.
  const results = await c.env.DB.batch([
    ...won.map((w) =>
      c.env.DB.prepare(
        `UPDATE event_prizes SET remaining_quantity = MIN(total_quantity, remaining_quantity + ?)
          WHERE id = ? AND total_quantity <> -1`,
      ).bind(w.n, w.prizeId),
    ),
    c.env.DB.prepare('DELETE FROM event_lottery_entries WHERE event_id = ? AND user_id = ?').bind(event.id, userId),
  ]);
  if (!results[results.length - 1].meta.changes) throw new HttpError(404, 'participant_not_found');
  return c.json({ success: true });
});

export const rootApp = new Hono<AppEnv>();
rootApp.route('/event/api', api);
