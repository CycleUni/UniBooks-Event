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
- **Regions**: the main site's, from its database (`GET /api/v1/core/regions`), with the languages each region is offered in. Each event belongs to one; the public pages live under `/event/<region>` (rendered on request, so a region added to the main site works without a rebuild), and the chosen region and language are the main site's own `localStorage` keys (`region`, `lang`), shared on this origin. The footer's region and language menus (`public/prefs.js`) copy the main site's: a language the region does not offer gives way to its default. A signed-in member gets their account's saved language (`site_language`, when the region offers it), and a language picked here is saved back to the account (`PUT /api/v1/auth/me/site-language`), as on the main site; `/event` opens their account's region (`site_region`) first. A first visit to `/event` with nothing saved picks the region as the main site does: a Taipei or Hong Kong timezone, else the main site's `GET /api/v1/core/geo` (the visitor's IP, waiting at most 800 ms), and saves it for both sites.
- **Sign-in**: `public/session.js` signs admin pages in through the main site and never loops between `/event` and `/login`: it renews the session at most once a minute, sends to sign-in at most once a minute, and shows a problem card instead of redirecting again. Every page, public ones included, renews an expired access cookie when the main site's `ub_session` hint says the visitor is signed in, so the header shows them without a redirect.
- **i18n**: `zh-TW`, `zh-HK`, `en`.

## Pages

Every public page lives under a region, and draws and book drives are run from their own pages rather than a separate back office: someone allowed to sees the tools on the same page everyone else does. What belongs to a student organization rather than to one draw or drive is in the back office (後台管理, below). Old `/event/admin/...` links to the draws and drives (bookmarks) are sent to their new place in the visitor's last region (`src/pages/admin/[...path].astro`); a page for one event or drive moves itself on to that one's region (`src/scripts/region-path.ts`).

**Student organizations** (a school's student union and the like) are who besides UniBooks staff may use this system. Staff open each to draws, book drives or both (the main site's `organizations.features`); its admins then run what it was given. Who runs a draw is decided once on each side: `canManage` in `src/server/api.ts`, `src/scripts/draw-access.ts` for the pages.

- `/event/<region>` and `/event/<region>/<event id>` — a region's draws, and one draw with its prizes; one a student organization hosts says so (主辦：致理科技大學 學生會, the main site's public `/api/v1/orgs/names`). Whoever runs draws there also sees 新增活動 and the draws they run, public or not, each with its entrant count, 掃描 and 管理; a draw's page shows them its scanner and settings. Staff run the region's draws; an organization's admins the draws it hosts (`events.organization_id`), which stay in its region. The old `/event/<region>/events/detail?id=` links redirect there.
- `/event/<region>/new`, `/event/<region>/<event id>/edit` — create a draw, choosing its host (UniBooks, for staff, or an organization this account runs); edit it, its prizes and its participants.
- `/event/<region>/<event id>/scanner` — the draw screen for a big display: the camera scans continuously on one side, the prize wheel spins to the result the server drew, the prize list shows live stock, and the result card shows the participant's name and masked email. Scanning (`src/scripts/qr-scanner.ts`) follows the main site's barcode scanner: no resolution or frame-rate constraints, the whole visible frame decoded at the camera's resolution, at most 10 decodes a second, the browser's BarcodeDetector or else ZXing WebAssembly served from this site.

## Book drives (收書贈書)

Book drives are run by a school's student organization, such as its student union: books collected at the end of a term, given to students at the start of the next. Unlike the draws, their data lives on the main site, which owns accounts, schools, departments and the book catalogue: these pages call its API (`/api/v1/admin/organizations`, `/api/v1/orgs/*`) from the same origin with the visitor's own cookie (`/api/v1/drives/*` too), so the main site decides who may do what. This Worker's database and API are unchanged. The plan is the main site's `docs/plans/2026-11-25-book-drive.md`.

The header has two sections, 抽獎 (`/event/<region>`) and 收書贈書 (`/event/<region>/drives`). Who runs drives works on the same pages, each part shown only to those who may use it (the main site's `/api/v1/auth/me` lists the organizations an account runs and the drives it staffs as `organizations` and `staffed_drives`; `AuthUser.organizations` and `.staffedDrives` here):

- `/event/<region>/drives` — the region's drives; until the drive pages arrive it says what the section is for. Above that, the admins of an organization open to book drives see it, one at a time (picked at the top when there are several, remembered on the browser): its drives (新增活動 makes one, collecting at once); drive staff see the drives they work.
- `/event/<region>/drives/<drive id>` — one drive: its counts, the books collected (search by title, ISBN, shelf number or donor; correct one, withdraw a damaged one and put it back, delete one entered by mistake) and, for the organization's admins, its staff (added by email) and settings (name, details, stop or reopen collecting). Its staff see the same page without the staff and settings.
- `/event/<region>/drives/<drive id>/intake` — taking books in at the booth, one at a time: the ISBN (a USB barcode scanner types it and presses Enter, or the camera reads the EAN-13 barcode once the same valid code is seen twice, or it is typed; a book no catalogue knows, or one without an ISBN, is taken by its title), the donor's student number (which fills in their department and year from the roster, else their department from an earlier intake), who the book suits (the donor's department unless changed, and a year) and its condition. Each book gets the drive's next shelf number, shown large to write on it; the donor stays for their next book, and the books just taken in can be undone.
## Back office (後台管理)

`/event/admin`, in the account menu for staff and organizations' admins, opens on the first tab this person has (`src/components/AdminTabs.astro`):

- 學生組織 (`/event/admin/orgs`) — staff: the organizations of the region chosen in the footer, among their regions. A row opens to its admins (added by the account's email, shown masked), what it is open to (抽獎, 收書贈書; a switch saves at once) and its status; 新增組織 opens a dialog (new ones get book drives).
- 會員名冊 (`/event/admin/roster/<organization id>`; `/event/admin/roster` opens the one picked last) — for the organization's own admins (staff too only when they are one), switched at the top when they run several: search, add, edit and remove members (student number, name, department, year, membership end). 匯入名冊 walks through four steps in a dialog: choose a CSV file or paste cells from a spreadsheet (a template can be downloaded), confirm which column is which (matched from the headers), check every row's problems and choose to add and update or replace the whole roster (a new term's list), then done. Nothing is written before the last step. The department field is the region's list by college with "Other" for one it lacks (`src/scripts/department-select.ts`).

## Draw rules (enforced by this database)

- One draw per scanned code: unique `(event_id, user_id, token_step)`, so a camera that keeps seeing the same QR cannot draw twice.
- At most `max_draws_per_user` draws per member: conditional insert.
- A limited prize is only given while stock lasts: conditional decrement; the draw is repeated among the remaining prizes if it ran out meanwhile.
- A prize someone has won cannot be deleted (409 `prize_has_winners`), so no record loses its prize; set its quantity to 0 to stop giving it out.
- Optional: the member must have a school verification on the main site in the event's region.

## Deleting an event

Staff of the event's region can delete it from the bottom of its edit page (`DELETE /event/api/events/<id>`): the event, its prizes and all its draw records go in one transaction, and cannot be brought back. Uploaded images stay in the bucket. To stop a draw but keep its records, make the event inactive instead.

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

Open http://localhost:4321/event, sign in with a staff account of the main site's local database (`npm run user:create -- <email> --role staff` in the main site's `server/`), and the draws page shows the staff tools. In `astro dev`, `window.__simulateScan(text)` on the draw page feeds a scanned code without a camera.

```bash
npm run build
```

`npm run preview` runs the built Worker in `wrangler dev`; copy `.dev.vars.example` to `.dev.vars` first, so images come from the local bucket rather than the public domain.

## Deployment

```bash
npm run deploy
```

`npm run deploy` builds, applies the D1 migrations to the remote database, then deploys, like the main site's.

### Cloudflare Workers Builds

A push to `main` deploys through Workers Builds, whose commands are set in the dashboard, not read from this repo (Workers → `unibooks-event` → Settings → Build):

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npm run migrate:remote && npx wrangler deploy` |

The default deploy command, a bare `npx wrangler deploy`, only uploads the Worker: no migration ever runs, the database has no tables (not even `d1_migrations`), and every query fails with 500 while `/event/api/me` still works. Nothing in `wrangler.jsonc` can make a deploy apply migrations, so the dashboard setting is the only place for it. If a build then fails on the migration with a permission error, give the build's API token D1 edit access.

A migration is recorded by file name: once applied, editing that file changes nothing in production. Add a new numbered file instead.

The main site's Worker must be deployed as `unibooks` for the `MAIN` service binding.

## 授權

原始碼公開僅供檢視、學習與非商業的個人研究，採用 [PolyForm Strict License 1.0.0](LICENSE)，與 UniBooks 主專案相同。未經授權，不得散布、修改後發布、公開架設或商業使用。
