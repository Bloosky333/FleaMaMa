# FleaMaMa — Functional & Technical Specification (v0.1 draft)

> Flea Market Manager: replaces an old FileMaker database used to manage the rental of
> spots (emplacements) at a yearly brocante.

Status: **draft, under discussion**. Decisions marked ✅ come from the first Q&A session;
items marked ❓ are still open (see [§12 Open questions](#12-open-questions)).

---

## 1. Context & goals

The organiser runs **one flea market per year, on the same streets, with the same layout**
(100–400 spots). Today everything lives in an old FileMaker database whose data can't be
exported: contacts, which spot each exhibitor rented each year, and who has paid.

Goals:

1. **Track rentals**: who rented which spot(s) for which year, paid or not, contact details.
2. **Make assignment easy and fair**: apply priorities (resident in front of the spot,
   same spot as last year) with a deadline, then open the remaining spots to everyone.
3. **Visual map** of the market showing taken / free spots with details on hover.
4. **Let exhibitors book online** (request, confirm, get payment instructions) without
   creating an account.
5. **Rebuild the history quickly** from the old system, which can only be *looked at on
   screen*.

Non-goals for v1: online payment, multiple markets/locations, accounting.

## 2. Users & roles

| Role | Who | Access |
|---|---|---|
| **Organiser (admin)** | The friend + possibly 1–4 helpers | Full back-office, login by email |
| **Volunteer** ❓ | Helpers on market day | Check-in screen only (mobile) |
| **Exhibitor** | Private individuals & professionals | Public form + personal **magic link** (no password) ✅ |

UI language: **French only** ✅ (code and data model in English, translations kept in one
file so Dutch/English can be added later).

## 3. Core concepts & glossary

| FR (UI) | EN (code) | Meaning |
|---|---|---|
| Édition | `Edition` | One yearly occurrence of the market (e.g. "Brocante 2027") |
| Emplacement | `Spot` | A numbered physical spot; persists across editions |
| Exposant | `Contact` | A person or company that rents (or rented) spots |
| Réservation | `Booking` | Link between a contact, an edition and one or more spots |
| Paiement | `Payment` | Money received for a booking (cash or transfer) |
| Riverain | `Resident link` | A contact living in front of a given spot |
| Tarif | `Tariff` | Price category (private, professional, early-bird…) |

## 4. Functional requirements

### 4.1 Plan & spots (map)

- ✅ The organiser **uploads a plan image** (scanned plan, PDF converted to image, or a
  satellite screenshot) as the map background. No dependency on Google Maps.
- Spots are drawn on top of the image as **rotatable rectangles** (or polygons), in image
  coordinates.
- **Bulk tool**: draw a line along a street side, enter "N spots of 3 m starting at
  number X", the app generates N contiguous rectangles numbered automatically. Then tweak
  exceptions (different length, skipped numbers, `12bis`, etc.).
- Each spot has: number/label, street, side, **length (m)** (default = standard size, many
  exceptions ✅), facing address(es) (for residents), notes (e.g. "devant garage, accès à
  laisser"), active/inactive.
- The layout is shared across editions; a spot can be deactivated for one edition
  (works, new driveway…) without deleting its history.

**Map views** (same component, different colouring):

| Colour | Meaning |
|---|---|
| Green | Free |
| Light blue | Reserved for a priority holder (offer pending, before deadline) |
| Orange | Booked, **not paid** / partially paid |
| Dark blue | Booked & paid |
| Red outline | Conflict (several priority claims) |
| Grey | Inactive this year |

**Hover / tap tooltip** ✅:
- *Booked*: exhibitor name, phone, status, amount due / paid, number of spots in booking.
- *Free*: who rented it last year, resident(s) linked to it, current priority status
  ("riverain X — offre expirée le 01/05", "loué en 2026 par Y — pas encore confirmé").
- Click → side panel with full details and actions (assign, mark paid, release…).

Filters: by street, status, tariff, "has priority", search by name/spot number.

### 4.2 Contacts (exposants)

Fields ✅: last name, first name, company name, address (street, number, postcode,
city), phone, email, **type** (private / professional), **VAT/BCE number** (pros),
notes, "resident of spot(s)" links, GDPR consent date.

- Duplicate detection (same email / phone / fuzzy name+address) with merge tool —
  essential after the history import.
- Contact page shows the full rental history across years.

### 4.3 Editions & settings

Created by "rolling over" the previous edition (copies settings, keeps layout). Per
edition:

- Market date(s).
- **Priority deadline** ✅ (date after which unclaimed priority offers expire).
- **Early-bird deadline** ✅ (different price if booked before).
- Payment deadline (for reminders).
- Tariff grid (see 4.4).
- IBAN, payee name, email templates.
- Opening date of the public phase.

### 4.4 Tariffs ✅

Price **per spot**, chosen by category and booking date:

| Category | Before early-bird date | After |
|---|---|---|
| Private (particulier) | € a | € b |
| Professional | € c | € d |

- Booking date = date the booking was confirmed (priority confirmation or request
  submission).
- Organiser can always override the amount (free spot for an association, discount…)
  with a reason.
- ❓ Is there a resident tariff, an association/free tariff, or a price per extra metre?

### 4.5 Booking lifecycle (phased) ✅

```
                   ┌───────────── Phase 1: priority window ─────────────┐   ┌──── Phase 2: open ────┐
 (roll-over) ──▶ OFFERED ──confirm──▶ CONFIRMED ──payment──▶ PAID          REQUESTED ──assign──▶ CONFIRMED…
                    │                                                         │
                    ├─decline──▶ DECLINED (spot freed)                        └─reject/waitlist──▶ WAITLIST
                    └─deadline passed──▶ EXPIRED (spot freed)
 any state ──▶ CANCELLED (by organiser or exhibitor)
 market day: CONFIRMED/PAID ──▶ PRESENT | NO_SHOW
```

**Phase 0 — Preparation** (organiser)
1. Roll over the edition.
2. App computes **priority candidates** for every spot:
   - the contact(s) who rented it last edition ✅,
   - the contact(s) linked as resident of that spot ✅ (address auto-match suggests, the
     organiser validates ✅).
3. Spots with more than one candidate are flagged as **conflicts**; the organiser decides
   who gets the offer ✅ (the app shows all history to help: years attended, paid/no-show
   last year, notes). No automatic rule.
4. Unpaid / no-show last year does **not** automatically remove priority ✅ — it's shown
   as a warning, the organiser judges.

**Phase 1 — Priority window**
5. App emails each priority holder an **invitation with a magic link** ✅: "Votre
   emplacement n°42 vous est réservé jusqu'au 01/05. Confirmez-le."
6. Via the link the exhibitor can: confirm (optionally update contact details, ask for an
   additional adjacent spot), decline, or write a message.
7. On confirmation → booking confirmed, email with **amount + IBAN + structured
   communication** ✅.
8. At the deadline, unconfirmed offers become **EXPIRED** and their spots become free.
   The organiser can still manually extend an individual offer.

**Phase 2 — Open booking**
9. Public form (no account): contact details, private/pro, number of spots wanted,
   preferences (street, near someone, spot numbers they'd like), type of goods ❓.
10. Requests land in a queue (first come, first served by timestamp). The organiser
    assigns spots from the map; an **assignment helper** suggests free spots matching the
    preferences (same street, adjacent spots when several are requested). ❓ Should
    exhibitors instead pick a free spot themselves on the map?
11. If nothing fits → waiting list; freed spots can be offered to the next in line.

**Constraints**
- One exhibitor may hold **several spots, ideally adjacent; spots are never split or
  merged** ✅.
- A spot belongs to at most one active booking per edition.

### 4.6 Payments ✅ (manual in v1)

- Methods: **bank transfer** and **cash** (on the day or before).
- Each booking gets a unique **Belgian structured communication**
  (`+++123/4567/89012+++`) so transfers are easy to match.
- Organiser records payments manually (amount, date, method). Partial payments allowed;
  status = unpaid / partial / paid / refunded.
- Bulk "mark as paid" from a list view.
- v1.1 idea: import a bank CSV/CODA export and auto-match on the structured
  communication.

### 4.7 Emails ✅

Templated, editable in French, sent from the app:

1. **Priority invitation** (Phase 1) with magic link and deadline.
2. **Reminder** before the priority deadline (configurable, e.g. 7 days before).
3. **Booking confirmation + payment instructions** (amount, IBAN, structured comm.).
4. **Unpaid reminder** before the payment deadline.
5. Request received / request accepted / waitlisted (Phase 2).
6. Optional "practical info" mailing a few days before the market (arrival time, map).

All sent emails are logged on the contact (date, template, status).

### 4.8 Market day ✅

- **Mobile check-in**: list or map filtered by street; tap a spot → mark present /
  no-show, record cash payment.
- **Walk-ins**: assign a free spot to someone turning up, create the contact on the fly,
  collect cash.
- **Printable PDFs**: map with spot numbers and names, list per street (spot, name,
  phone, paid?), for volunteers without a phone.
- ❓ Offline support needed (bad mobile reception on the street)?

### 4.9 Dashboard & exports

- Counts: spots free / offered / booked / paid, revenue expected vs received, conflicts,
  expired offers, waiting list.
- Export to Excel/CSV: contacts, bookings per edition, payments.
- Full database backup export (JSON/CSV zip) — the friend must never be locked in again.

### 4.10 History import ("Reprise de l'historique") ✅

The old FileMaker can only be **read on screen** ✅, and we need **last year only** ✅
(enough for "same spot last year" priority + contacts). Two complementary paths feeding
the **same review grid** ✅:

**A. Photo + AI extraction**
1. Take phone photos of FileMaker screens (list view or record view).
2. Upload them in the import screen (several at once).
3. A vision LLM extracts rows: name, address, phone, email, spot number(s), paid?, notes.
4. Extracted rows appear in the review grid with the source photo beside them; low-
   confidence cells are highlighted.

**B. Fast manual grid**
- Spreadsheet-like, keyboard-only entry (Tab/Enter), autocomplete on existing contacts
  and on spot numbers, paste from Excel/Google Sheets supported.

**Review & commit**
- Each row is matched against existing contacts (dedup suggestions) and against the
  spot layout (unknown spot number → warning).
- Validate → creates contacts + bookings in the previous edition with status
  `HISTORICAL` (paid flag kept for information).
- Import is re-runnable: rows are tagged with an import batch so a bad batch can be
  rolled back.

Tip for the friend: in FileMaker, a list view sorted by spot number, zoomed so ~15–20
rows fit on screen, gives the best photos (straight, no glare).

## 5. Data model (first cut)

```
Edition      (id, year, market_date, priority_deadline, early_bird_deadline,
              payment_deadline, public_opening_date, iban, payee, status)
Plan         (id, image_url, width, height, scale_m_per_px?)
Spot         (id, plan_id, label, sort_key, street, side, length_m, shape (polygon json),
              facing_addresses[], notes, active)
SpotEditionState (spot_id, edition_id, inactive_reason)       -- per-year deactivation
Contact      (id, first_name, last_name, company, street, number, postcode, city,
              phone, email, kind[private|pro], vat_number, notes, gdpr_consent_at,
              merged_into_id)
ResidentLink (contact_id, spot_id, validated_by, validated_at)
Tariff       (id, edition_id, kind[private|pro], early_bird bool, price_per_spot)
Booking      (id, edition_id, contact_id, status, source[priority|request|walk_in|history],
              priority_reason[last_year|resident|manual], tariff_id, amount_due,
              amount_override_reason, structured_comm, offer_expires_at,
              requested_at, confirmed_at, preferences json, presence, notes,
              import_batch_id)
BookingSpot  (booking_id, spot_id)            -- unique (edition_id, spot_id) when active
Payment      (id, booking_id, amount, method[cash|transfer], paid_at, reference,
              recorded_by)
MagicLink    (token_hash, contact_id, booking_id, expires_at)
EmailLog     (id, contact_id, booking_id, template, sent_at, status)
ImportBatch  (id, created_at, source[photo|manual|csv], status)
AuditLog     (who, when, entity, change)
```

## 6. Technical proposal ❓ (to validate)

Constraint: free / near-free cloud hosting ✅, public pages for exhibitors.

| Concern | Proposal | Why |
|---|---|---|
| App | **Next.js** (React, TypeScript), one app for back-office + public pages | Single deploy, good DX |
| Hosting | **Vercel** free tier | Zero ops |
| DB / auth / files | **Supabase** (Postgres, email magic-link auth, storage for plan & photos) | Free tier is plenty for 400 spots; real SQL; easy backups |
| Map editor | SVG/Canvas over the plan image (**react-konva**) | Rotatable rectangles, zoom/pan, works on mobile |
| Emails | **Resend** or **Brevo** free tier | ~100–300 emails/day free, good deliverability |
| AI extraction | Claude vision API, called server-side only from the import screen | Only used once a year, a few cents per batch |
| PDF | Server-side render (e.g. `@react-pdf/renderer`) | Printable map & lists |
| UI | Tailwind + shadcn/ui, mobile-first for check-in | |

Note: Supabase free projects pause after a week of inactivity — acceptable (wakes on
access) or mitigated by a small cron ping; to confirm.

## 7. Non-functional requirements

- **GDPR**: personal data of private individuals; privacy notice on the public form,
  consent checkbox, ability to export/delete a contact, data kept only as long as needed
  (❓ retention period). EU region hosting.
- **Usability**: organiser is not technical → plain French, few clicks, undo where
  possible, everything editable by hand.
- **Mobile**: check-in and exhibitor pages must work well on phones.
- **Backups**: automatic daily DB backup + manual export button.
- **Security**: admin behind login; magic links single-purpose, expiring, hashed.

## 8. MVP scope & roadmap (proposal)

**MVP (needed before next season's priority phase)**
1. Plan upload + spot editor (bulk tool).
2. Contacts + bookings + manual payments.
3. History import (manual grid first, AI photo extraction right after).
4. Priority computation, conflicts screen, Phase 1 invitations with magic links.
5. Map with status colours and tooltips.
6. Emails: invitation, confirmation + payment instructions, reminders.

**v1**
7. Public request form + assignment helper + waiting list (Phase 2).
8. Market-day check-in, walk-ins, printable PDFs.
9. Dashboard, exports.

**Later**
- Bank statement import & auto-matching; online payment (Payconiq/Stripe).
- Dutch/English UI.
- Self-service spot picking on the map.

## 9. Key screens

1. **Tableau de bord** — counters, upcoming deadlines, to-do (conflicts, unpaid…).
2. **Plan** — map, filters, side panel; edit mode for spots.
3. **Exposants** — searchable list, contact page with history.
4. **Réservations** — list per edition with status/payment filters, bulk actions.
5. **Priorités** — candidate per spot, conflicts to resolve, "send invitations".
6. **Demandes** — Phase 2 queue with assignment helper.
7. **Paiements** — record & reconcile.
8. **Jour J** — mobile check-in.
9. **Import** — photos/grid/review.
10. **Paramètres** — edition dates, tariffs, IBAN, email templates, users.
11. **Public**: request form; personal booking page (magic link).

## 10. Assumptions

- One market per year, same layout year to year (with occasional spot deactivation).
- Priorities are only "resident" and "same spot last year"; conflicts are resolved by a
  human.
- Exhibitor data required: contact details + private/pro + VAT number; **no ID card
  number** collected for now.
- 100–400 spots, < 1 000 contacts: no performance concerns.

## 11. Decisions log

| # | Decision | Source |
|---|---|---|
| D1 | 1 event/year, same layout | Q&A 1 |
| D2 | Organisers + exhibitors online | Q&A 1 |
| D3 | Numbered spots, mostly same size, many exceptions; drawn on an uploaded plan image | Q&A 1, 5 |
| D4 | Payments by transfer & cash, recorded manually in v1 | Q&A 1 |
| D5 | Phased booking: priority window with cut-off, then open | Q&A 2 |
| D6 | Priorities: resident in front + same spot last year | Q&A 2 |
| D7 | Tariffs by category (private / pro) + early-bird date | Q&A 2, 6 |
| D8 | Priority conflicts resolved by organiser | Q&A 3 |
| D9 | History: last year only, from screen → photo+AI and manual grid | Q&A 3, 4 |
| D10 | French UI, free/near-free cloud | Q&A 4 |
| D11 | Residents: address auto-match + organiser validation | Q&A 4 |
| D12 | Emails: invitations, confirmation + payment info, unpaid reminders | Q&A 5 |
| D13 | Market day: mobile check-in, PDFs, walk-ins | Q&A 5 |
| D14 | Unpaid/no-show doesn't auto-remove priority | Q&A 5 |
| D15 | Exhibitor access by magic link; several (non-split) spots per exhibitor | Q&A 6 |

## 12. Open questions

1. **Phase 2**: organiser assigns from requests (current assumption) or exhibitors pick a
   free spot on the map themselves?
2. **Tariffs**: resident tariff? association/free? any per-metre price for longer spots?
   Is the price per spot identical whatever its length?
3. **Residents**: does a resident get the spot in front of their house *for free* or for
   themselves only (can they hand it to a relative)? Can a resident claim several spots
   (whole house front)?
4. **Last-year priority**: same exhibitor *and same spot* only, or "a spot" (organiser may
   move them)? If someone had 3 spots, do they keep all 3?
5. **Volunteers**: separate limited role needed, or everybody is admin?
6. **Market day connectivity**: is mobile reception reliable on the streets, or is offline
   check-in needed?
7. **Type of goods** (food, pro, second-hand…): needed for placement rules (e.g. food
   stands only on the square)?
8. **Cancellations & refunds**: policy? Refund after a deadline? Keep the money if no-show?
9. **Rain / cancelled market**: what happens to bookings and payments?
10. **Data retention**: how many years of contacts/history to keep (GDPR)?
11. **Email sender**: send from a domain the friend owns (better deliverability) or a
    generic one?
12. **Tech stack** in §6: OK? Any preference (e.g. the friend's existing Google account /
    Google Sheets as backup)?
13. **Plan image**: does a usable plan exist (municipal plan, hand drawing), or will we
    start from a satellite screenshot?
14. Is the **structured communication** for transfers OK for the friend's bank account
    (personal vs association account)?
