# UniBooks Event System

On-site lucky draw for UniBooks events, run by staff on a laptop that doubles as the audience display.

## Architecture

- **Framework**: Astro 5 (Cloudflare Workers) with a Hono API at `/event/api`.
- **Location**: mounted under `/event` on the main site's origin (`unibooks.app`), so the browser sends the main site's session cookie here too.
- **Database**: its own D1 database, `unibooks-event` (events, prizes, draws). It never reads the main site's tables; members appear only as ids plus the name and masked email saved with a draw.
- **Images**: its own R2 bucket, `unibooks-event-assets` (binding `MEDIA`). Staff upload covers and prize images (`POST /event/api/uploads`, the file as the body: JPEG, PNG, WebP, GIF or AVIF read from the bytes, at most 5 MB); as on the main site they are read from the bucket's public custom domain, `R2_PUBLIC_URL` in `wrangler.jsonc` (`https://event-assets.unibooks.app/events/<uuid>.<ext>`), so a view costs no Worker request and the CDN caches it. `astro dev` ignores that setting and this Worker serves the local simulator's images at `/event/media/events/<uuid>.<ext>`. Image fields still accept any http(s) URL.
- **No secrets**: the main site keeps its keys. This Worker asks it, through the `MAIN` service binding and with the visitor's own cookie:
  - who is signed in: `GET /api/v1/auth/me` (staff and admins may use the admin pages);
  - whose member pass was scanned: `POST /api/v1/auth/member-token/verify` (staff only), which checks the signature and the account and returns the member id, the pass's time step, a display name, a masked email and whether the member has a school verification.
  - who a member ID belongs to, when staff add a participant by hand: `GET /api/v1/auth/members/:id` (staff only), same fields without the step.
- **Regions**: the main site's, from its database (`GET /api/v1/core/regions`), with the languages each region is offered in. Each event belongs to one; the public pages live under `/event/<region>` (rendered on request, so a region added to the main site works without a rebuild), and the chosen region and language are the main site's own `localStorage` keys (`region`, `lang`), shared on this origin. The footer's region and language menus (`public/prefs.js`) copy the main site's: a language the region does not offer gives way to its default. A first visit to `/event` with nothing saved picks the region as the main site does: a Taipei or Hong Kong timezone, else the main site's `GET /api/v1/core/geo` (the visitor's IP, waiting at most 800 ms), and saves it for both sites.
- **Sign-in**: `public/session.js` signs admin pages in through the main site and never loops between `/event` and `/login`: it renews the session at most once a minute, sends to sign-in at most once a minute, and shows a problem card instead of redirecting again.
- **i18n**: `zh-TW`, `zh-HK`, `en`.

## Pages

- `/event` and `/event/events/detail?id=` — public list of active events and their prizes.
- `/event/admin` — staff dashboard; create and edit events and prizes, see draw records. Reached from the main site's account page (管理 → 活動, staff only), which is where the header's account link goes; the header has no admin link.
- `/event/admin/events/scanner?id=` — the draw screen for a big display: the camera scans continuously on one side, the prize wheel spins to the result the server drew, the prize list shows live stock, and the result card shows the participant's name and masked email. Scanning (`src/scripts/qr-scanner.ts`) follows the main site's barcode scanner: no resolution or frame-rate constraints, the whole visible frame decoded at the camera's resolution, at most 10 decodes a second, the browser's BarcodeDetector or else ZXing WebAssembly served from this site.

## Draw rules (enforced by this database)

- One draw per scanned code: unique `(event_id, user_id, token_step)`, so a camera that keeps seeing the same QR cannot draw twice.
- At most `max_draws_per_user` draws per member: conditional insert.
- A limited prize is only given while stock lasts: conditional decrement; the draw is repeated among the remaining prizes if it ran out meanwhile.
- A prize someone has won cannot be deleted (409 `prize_has_winners`), so no record loses its prize; set its quantity to 0 to stop giving it out.
- Optional: the member must have a school verification on the main site in the event's region.

## Participants

Everyone who drew in an event is a participant. Staff can also add someone by hand — by scanning their member pass or by the member ID under its QR code — without a draw, which uses none of their draws. Each participant's records can be edited one by one: change the prize a record gave (stock follows; a prize with none left is refused) or delete a record (its prize goes back in stock). Removing a participant deletes all their records in the event in one transaction and lets them draw again. The admin list shows each event's participant count.

## Region permissions

As on the main site: an admin manages every region; other staff manage only the regions the main site grants them (`staff_managed_regions`, returned as `managed_regions` by `/api/v1/auth/me`). The admin pages list, open and accept events only in those regions — anything else answers 404 (or 403 `region_forbidden` when creating or moving an event there) — and the footer region menu on admin pages offers only those regions.

## Database setup

```bash
npx wrangler d1 create unibooks-event        # once
npx wrangler r2 bucket create unibooks-event-assets   # once
npx wrangler d1 migrations apply unibooks-event --local
npx wrangler d1 migrations apply unibooks-event --remote
```

Then give the bucket its public custom domain, `event-assets.unibooks.app` (Cloudflare dashboard → R2 → `unibooks-event-assets` → Settings → Custom Domains), matching `R2_PUBLIC_URL`. Leave the r2.dev URL off.

## Routing on unibooks.app

Route `unibooks.app/event*` to this Worker with a Workers route (more specific than the main site's), or with a router Worker using service bindings. The main site needs no change.

## Development

Local development runs like production: one origin. `astro dev` serves `/event` and passes every other path (sign-in, the main site's pages and API) to the main site's dev server.

```bash
npm install
cp .env.example .env             # where the main site's dev server runs
npx wrangler d1 migrations apply unibooks-event --local
# start the main site's dev server (port 8787), then:
npm run dev
```

Open http://localhost:4321/event/admin and sign in with a staff account of the main site's local database (`npm run user:create -- <email> --role staff` in the main site's `server/`). In `astro dev`, `window.__simulateScan(text)` on the draw page feeds a scanned code without a camera.

```bash
npm run build
```

`npm run preview` runs the built Worker in `wrangler dev`; copy `.dev.vars.example` to `.dev.vars` first, so images come from the local bucket rather than the public domain.

## Deployment

```bash
npm run deploy
```

The main site's Worker must be deployed as `unibooks` for the `MAIN` service binding.
