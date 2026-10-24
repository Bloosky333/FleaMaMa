# FleaMaMa

Flea Market Manager — a tool to manage spot rentals for a yearly flea market (brocante):
contacts, bookings per year, payments, priority-based assignment, and a visual map of
taken/free spots. Replaces an old FileMaker database.

- Specification: [docs/SPEC.md](docs/SPEC.md)
- UI language: French. Code: English.

## Status

**Milestone 1 (done)** — foundations:

- Organiser accounts (first-run setup, login, add organisers).
- **Plan**: upload a photo/scan of the paper plan (rotate, contrast, auto-resize in the browser).
- **Spot editor** on the plan: *Placer des numéros* (click where each number is written, the next
  number auto-increments), *Rangée* (create N spots along a street in two clicks), select / move /
  rotate / resize, multi-select (Shift+click) to set street/side/length in bulk, go to a number.
- **Emplacements**: list with street filter, length exceptions, residents.
- **Exposants**: list/search (name, phone in any format, email, city), create/edit with
  duplicate detection, resident links (with suggestions from the address), booking history.
- Full database schema for the next milestones (editions, tariffs, bookings, payments,
  magic links, email outbox, import batches).

**Milestone 2 (done)** — history import (*Reprise historique*):

- One "reprise" per year; rows are kept as a draft and **saved automatically**.
- Spreadsheet-like grid: type with the keyboard (Enter = next line), or **paste rows from Excel /
  Google Sheets / CSV**.
- **Photos of the FileMaker screen** are read by Claude (vision + structured output); unsure cells
  are highlighted in yellow and the photo is shown next to the rows it produced.
- Live checks: unknown spot numbers, a spot used twice, a spot already taken that year, missing name.
- Existing exhibitors are recognised (same phone/email, or name + address) and linked instead of
  duplicated; the organiser can override per line or ignore a line.
- **Validate** creates the contacts and the year's bookings (with the paid flag);
  **Annuler l’import** undoes it cleanly so it can be corrected and validated again.

**Milestone 3 (done)** — editions, priorities and invitations:

- **Paramètres**: create the year's edition (prices and payment text copied from the last one),
  market date, priority deadline, early-bird date, payment/refund dates, prices per spot
  (private/pro × early-bird/normal), email signature, batch size and daily cap, test email.
  Email texts are editable (*Modifier les textes des emails*) with placeholders.
- **Priorités**: computes who has a priority (last year's exhibitors, residents), groups each
  person's spots into one offer, lists **conflicts** for the organiser to settle, then prepares
  the offers. Bulk invitations / reminders are sent **only when the organiser clicks**; per offer:
  confirm by phone, "ne vient pas", extend, withdraw, or get the personal link (for SMS).
  Overdue offers expire automatically and free their spots.
- **Exhibitor page** (`/r/…`, personal link, no account): confirm all or some spots, see the
  price (early-bird applied), update contact details, leave a message, or decline. A
  confirmation email with amount, reference and payment instructions goes out immediately.
- **Emails**: every email goes through an outbox sent in small batches with a rolling 24 h cap
  (default 20 per batch, 300/24 h); Gmail refusals pause sending and show a warning.

**Milestone 4 (done)** — map, bookings and payments:

- **Carte**: the plan coloured by status — free, priority to prepare, priority conflict,
  offer waiting, booked unpaid, booked and paid, inactive — with counts in the legend (click to
  hide a category) and a search box (name, number, street) that highlights matches.
  **Hover** a spot: who booked it, phone, paid/due; or, when free, who had it last year, the
  residents and pending priorities. **Click**: record the payment in one click, open the booking,
  or **assign** free spots (Shift+click for several) to an exhibitor found by name/phone/email,
  with an optional confirmation email.
- **Réservations**: list with filters (status, payment), totals (expected / received / to collect),
  one-click "Liquide / Virement", bulk "mark paid", **payment reminders** sent on demand, and an
  **Excel export** (CSV).
- **Booking page**: payments and refunds (amount, method, date, reference), cancel (with the refund
  deadline shown), resend the confirmation, emails sent.

**Next**: open requests on the public map (phase 2), market-day tools (check-in, walk-ins,
printable lists).

## Tech

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · Drizzle ORM · Postgres ·
react-konva (plan editor) · Vitest.

## Local development

Requirements: Node.js 22+, a Postgres 15+ database.

```bash
cp .env.example .env          # then edit DATABASE_URL and SESSION_SECRET
npm install
npm run db:migrate            # create the tables
npm run dev                   # http://localhost:3000 → first visit asks to create the first organiser
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run db:generate` | Create a new SQL migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |

## Deployment (free tier: Supabase + Vercel)

1. **Database** — create a project on [supabase.com](https://supabase.com) (region: EU, e.g.
   Frankfurt). In *Project Settings → Database → Connection string*, copy the **Transaction pooler**
   URI (port `6543`) and put your database password in it.
2. **Migrations** — from your computer: `DATABASE_URL="<that URI>" npm run db:migrate`.
3. **App** — import the GitHub repository in [vercel.com](https://vercel.com) and set the
   environment variables:
   - `DATABASE_URL` — the pooler URI above
   - `SESSION_SECRET` — a long random string (`openssl rand -base64 32`)
   - `ANTHROPIC_API_KEY` — optional, enables reading photos of the old software
     ([console.anthropic.com](https://console.anthropic.com); a few cents per photo)
   - `APP_URL` — the public address of the app (used in the links sent by email)
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM_NAME` — see *Emails with Gmail* below
   - `CRON_SECRET` — a long random string protecting the email sending job
4. Open the Vercel URL: the first visit asks to create the first organiser account.

### Emails with Gmail

1. On the Google account that will send the emails, turn on **2-Step Verification**.
2. Create an **app password** (Google Account → Security → App passwords), name it "FleaMaMa".
3. Set `GMAIL_USER` (the Gmail address), `GMAIL_APP_PASSWORD` (the 16 letters, without spaces) and
   `EMAIL_FROM_NAME` (e.g. "Brocante de Limal") in Vercel, then redeploy.
4. In the app: *Paramètres → M’envoyer un email de test*.

Replies from exhibitors arrive directly in that Gmail inbox.

### Sending emails in batches (scheduled job)

Emails wait in an outbox and leave in small batches to respect Gmail's limits. The job is the
GitHub Actions workflow `.github/workflows/outbox.yml`, which calls `/api/outbox/process` every
10 minutes (Vercel's free plan only allows one scheduled job per day). To enable it, in the GitHub
repository settings:

- *Secrets and variables → Actions → Secrets*: `APP_URL` and `CRON_SECRET` (same values as in Vercel);
- *Variables*: `OUTBOX_ENABLED` = `true`.

The *Emails* page also has a "send a batch now" button, and confirmation emails are sent right away.
For local development, `EMAIL_TRANSPORT=log` prints emails instead of sending them.

Note: free Supabase projects pause after a week without activity; opening the app wakes them up
(the first request can take a few seconds).

## Project layout

```
src/
  app/
    admin/            back-office pages (plan, emplacements, exposants, organisateurs)
    api/plan/image    serves the plan image
    login, setup      authentication pages
  components/         shared UI components
  db/                 Drizzle schema and client
  lib/                domain helpers (spots, contacts, auth) + unit tests
drizzle/              SQL migrations
docs/SPEC.md          functional & technical specification
```
