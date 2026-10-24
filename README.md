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

**Next**: history import (manual grid + photo/AI), editions & tariffs, priorities and invitations,
Gmail outbox, map with booking status, public request page, market-day tools.

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
4. Open the Vercel URL: the first visit asks to create the first organiser account.

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
