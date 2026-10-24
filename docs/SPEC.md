# FleaMaMa — Functional & Technical Specification (v0.2)

> Flea Market Manager: replaces an old FileMaker database used to manage the rental of
> spots (emplacements) at a yearly brocante.

Status: **v0.2 — ready for MVP**. Decisions marked ✅ come from the Q&A sessions
(see [§11 Decisions log](#11-decisions-log)).

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
| **Organiser (admin)** | The friend + 1–4 trusted helpers, **all admins** ✅ | Full back-office (incl. market-day check-in), login by email |
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

- ✅ The organiser **uploads a plan image** as the map background. The existing plan is
  an **A4 hand-drawn sheet with the spot numbers written on it** ✅: it is scanned or
  photographed and uploaded (the upload screen offers crop/rotate/contrast so a phone
  photo works). No dependency on Google Maps.
- Because the plan is hand-drawn (not to scale), the drawn shape is **only a visual
  marker**; the real spot length is a data field, not computed from the drawing.
- Spots are drawn on top of the image as **rotatable rectangles** (or polygons), in image
  coordinates. Since the numbers are already on the plan, the fastest way is the
  **"click the numbers" tool**: type/confirm a number, click where it sits on the plan,
  a default-size rectangle is placed there, adjust if needed, next number auto-increments.
- **Bulk tool**: draw a line along a street side, enter "N spots starting at number X",
  the app generates N contiguous rectangles numbered automatically. Then tweak
  exceptions (different length, skipped numbers, `12bis`, etc.).
- A4 hand drawing will be small on screen for 100–400 spots: the map supports zoom/pan,
  and labels are rendered by the app on top of the scan (readable at any zoom).
- Nice-to-have: AI detection of the handwritten numbers on the scan to pre-place spots,
  which the organiser then validates.
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
- **Early-bird deadline** ✅ (different price if booked before) — **independent from
  the priority deadline** ✅ (probably a different date).
- Payment deadline (for reminders).
- Refund / cancellation deadline.
- Tariff grid (see 4.4).
- Payment instructions text (free text for now, e.g. "à régler en liquide ou par
  virement"), email templates. Bank details (IBAN) are optional and not required for v1 ✅.
- Opening date of the public phase.

### 4.4 Tariffs ✅

Price **per spot**, chosen by category and booking date:

| Category | Before early-bird date | After |
|---|---|---|
| Private (particulier) | € a | € b |
| Professional | € c | € d |

- Booking date = date the booking was confirmed (priority confirmation or request
  submission).
- **Residents pay the normal price** ✅ (no resident tariff).
- **No association / free category** ✅.
- **Same price per spot whatever its length** ✅ (longer/shorter exceptions don't change
  the price).
- Organiser can always override the amount (discount, free spot…) with a reason.

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
   - the contact(s) who rented it last edition ✅ — they are offered **the same spots**
     (all of them if they had several) and **may confirm fewer**; released spots become
     free ✅,
   - the contact(s) linked as resident of that spot ✅ — a resident may claim **every spot
     facing their house** ✅ (address auto-match suggests, the organiser validates ✅).
     Resident priority is **permanent**: it applies every year, even if they didn't book
     last year ✅. The booking must be **in the resident's own name** — it cannot be
     handed to a relative or friend ✅.
3. Spots with more than one candidate are flagged as **conflicts**; the organiser decides
   who gets the offer ✅ (the app shows all history to help: years attended, paid/no-show
   last year, notes). No automatic rule.
4. Unpaid / no-show last year does **not** automatically remove priority ✅ — it's shown
   as a warning, the organiser judges.

**Phase 1 — Priority window**
5. **When the organiser decides** ✅ (button "Envoyer les invitations", nothing automatic),
   the app emails each priority holder (renewals and residents) an **invitation with a
   magic link** ✅: "Votre emplacement n°42 vous est réservé jusqu'au 01/05.
   Confirmez-le." He can send all at once, a selection (e.g. one street), or re-send to
   those who haven't answered. Sending goes through the batch queue (§4.7).
6. Via the link the exhibitor can: confirm all or only some of the offered spots,
   update contact details, ask for an additional adjacent spot, decline, or write a
   message.
7. On confirmation → booking confirmed, email with **amount, booking reference and
   payment instructions** ✅.
8. At the deadline, unconfirmed offers become **EXPIRED** and their spots become free.
   The organiser can still manually extend an individual offer.

**Phase 2 — Open booking**
9. **Request on the map** ✅: the public page shows the plan with free spots (no
   personal data); a free spot that already has pending requests shows it
   ("2 demandes en cours") ✅. The exhibitor selects the spot(s) they want as **1st choice**, and can
   add **2nd / 3rd choices**, then fills in contact details, private/pro (+ VAT number)
   and a message. A magic link is emailed to follow the request.
10. **Several people may request the same spot** ✅ — requests are not locked. The
    organiser sees, per spot, the list of requests (ordered by submission time) and
    **confirms** one; the others are automatically moved to their next choice, or back to
    the queue if none is left. A request covering several spots is accepted or refused
    as a whole (adjacency preserved), unless the organiser edits it.
11. The organiser can also assign a different spot than requested; the **assignment
    helper** suggests free spots close to the requested ones (same street, adjacent when
    several are needed). The exhibitor gets an email to accept the alternative.
12. If nothing fits → waiting list; freed spots can be offered to the next in line.

**Constraints**
- One exhibitor may hold **several spots, ideally adjacent; spots are never split or
  merged** ✅.
- A spot belongs to at most one active booking per edition.

### 4.6 Payments ✅ (manual in v1)

- Methods: **bank transfer** and **cash** (on the day or before).
- Each booking gets a short unique **reference** (e.g. `B2027-042`) to put in the
  transfer communication. Belgian structured communication (`+++123/4567/89012+++`) and
  IBAN handling are deferred ✅ (account likely belongs to the association).
- Organiser records payments manually (amount, date, method). Partial payments allowed;
  status = unpaid / partial / paid / refunded.
- Bulk "mark as paid" from a list view.
- **Cancellation & refund** ✅: each edition has a **refund deadline**. A booking
  cancelled before it is refundable (organiser records the refund: amount, date, method);
  after it, cancellation keeps the payment. The organiser can always override.
- **Rain / bad weather**: nothing special ✅ — bookings and payments stay as they are, no
  automatic refund.
- Later: import a bank CSV/CODA export and auto-match on the booking reference.

### 4.7 Emails ✅

Templated, editable in French, sent from the app:

| # | Email | Trigger |
|---|---|---|
| 1 | **Priority invitation** (Phase 1) with magic link and deadline | Organiser, bulk |
| 2 | **Reminder** of the priority deadline (to those who haven't answered) | Organiser, bulk |
| 3 | **Booking confirmation + payment instructions** (amount, reference, instructions) | Automatic, single |
| 4 | **Unpaid reminder** | Organiser, bulk |
| 5 | Request received / accepted / alternative proposed / waitlisted (Phase 2) | Automatic, single |
| 6 | "Practical info" mailing before the market (arrival time, map) | Organiser, bulk |

Rule: **bulk emails are never sent automatically** ✅ — the organiser chooses when, and
to whom (the app pre-selects the relevant recipients, e.g. "14 offres non confirmées").
Only single transactional emails caused by an exhibitor's or organiser's action (#3, #5)
go out on their own. All sent emails are logged on the contact (date, template, status).

**Sending via Gmail with batching** ✅

- Through the organiser's **Gmail account via SMTP** (Google app password, 2-step
  verification required). Replies land directly in his Gmail.
- Gmail limits (personal account): ~**500 recipients per rolling 24 h**, and bursts can
  trigger temporary blocks. So every email goes through an **outbox queue**:
  - one recipient per email (personalised, no CC/BCC lists);
  - sent in **small batches** (default: 20 emails, then a pause of a few minutes;
    configurable);
  - a **daily cap** below Gmail's limit (default **300/24 h**) to leave room for the
    organiser's own emails and the single transactional emails;
  - when the cap is reached, the rest waits and resumes automatically when quota frees
    up (rolling 24 h count);
  - transactional emails (#3, #5) get **priority** over bulk ones in the queue;
  - a Gmail error (quota, temporary block) **pauses** the queue and alerts the organiser;
    failed emails are retried a limited number of times, then flagged.
- **Outbox screen**: queued / sent / failed per campaign, progress ("212 / 380 envoyés,
  suite estimée demain 10h"), pause / resume / cancel, re-send failed.
- Before a big send the app shows the estimate ("380 emails ≈ 2 jours avec la limite
  actuelle").
- The queue is processed by a scheduled job (e.g. every few minutes), not by the
  organiser's browser, so he can close the app.
- If Gmail becomes too limiting, the sending layer can be switched to a transactional
  service (Brevo/Resend) without changing the rest of the app.

### 4.8 Market day ✅

- **Mobile check-in**: list or map filtered by street; tap a spot → mark present /
  no-show, record cash payment.
- **Walk-ins**: assign a free spot to someone turning up, create the contact on the fly,
  collect cash.
- **Printable PDFs**: map with spot numbers and names, list per street (spot, name,
  phone, paid?), for helpers without a phone.
- Mobile reception is fine on site ✅ → online-only, no offline mode.
- No placement rules by type of goods ✅.

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
              payment_deadline, refund_deadline, public_opening_date,
              payment_instructions, iban?, status)
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
              amount_override_reason, reference, offer_expires_at,
              requested_at, confirmed_at, presence, notes, import_batch_id)
BookingSpot  (booking_id, spot_id)            -- unique (edition_id, spot_id) when active
SpotRequest  (id, booking_id, choice_rank[1|2|3], spot_ids[], status)  -- Phase 2 choices
Payment      (id, booking_id, amount (negative = refund), method[cash|transfer],
              paid_at, reference, recorded_by)
MagicLink    (token_hash, contact_id, booking_id, expires_at)
EmailCampaign(id, edition_id, template, created_by, created_at, status[running|paused|done])
EmailOutbox  (id, campaign_id?, contact_id, booking_id, template, priority, status
              [queued|sending|sent|failed], attempts, last_error, scheduled_at, sent_at)
ImportBatch  (id, created_at, source[photo|manual|csv], status)
AuditLog     (who, when, entity, change)
```

## 6. Technical stack ✅

Constraint: free / near-free cloud hosting ✅, public pages for exhibitors.

| Concern | Proposal | Why |
|---|---|---|
| App | **Next.js** (React, TypeScript), one app for back-office + public pages | Single deploy, good DX |
| Hosting | **Vercel** free tier | Zero ops |
| DB / auth / files | **Supabase** (Postgres, email magic-link auth, storage for plan & photos) | Free tier is plenty for 400 spots; real SQL; easy backups |
| Map editor | SVG/Canvas over the plan image (**react-konva**) | Rotatable rectangles, zoom/pan, works on mobile |
| Emails | **Gmail SMTP** (nodemailer) + outbox table + scheduled job (Vercel/Supabase cron) ✅ | Organiser already uses Gmail; free; batching respects Gmail limits |
| AI extraction | Claude vision API, called server-side only from the import screen | Only used once a year, a few cents per batch |
| PDF | Server-side render (e.g. `@react-pdf/renderer`) | Printable map & lists |
| UI | Tailwind + shadcn/ui, mobile-first for check-in | |

Note: Supabase free projects pause after a week of inactivity — acceptable (wakes on
access) or mitigated by a small cron ping; to confirm.

**Implementation notes (milestone 1)** — choices made while building, to keep the app
portable and simple:

- The database is accessed with **Drizzle ORM** over a plain Postgres connection
  (`DATABASE_URL`). Supabase is used *only* as a managed Postgres; any Postgres works,
  so the data is never locked into one provider.
- The **plan image is stored in the database** (a single A4 scan, a few MB) rather than
  in a separate file storage — one less service to configure, included in DB backups.
- **Organisers log in with email + password** (signed session cookie). Simpler than
  email magic links for 1–5 people and works before Gmail sending is configured.
  Magic links remain the plan for **exhibitors**.
- UI built with hand-written Tailwind components (no shadcn generator needed).
- History import (milestone 2): photos are read with Claude (`claude-opus-5-5`, vision +
  structured output, server-side fallback on refusal). Extracted rows are never saved
  directly: they land in the review grid and are only written as contacts/bookings when
  the organiser validates. A validated import can be undone (bookings removed, contacts
  it created removed unless used elsewhere). Historical bookings use status `historical`
  with the old system's paid flag kept as information.

## 7. Non-functional requirements

- **GDPR**: personal data of private individuals; privacy notice on the public form,
  consent checkbox, ability to export/delete a contact. **No retention limit for now** ✅
  (to revisit). EU region hosting.
- **Usability**: organiser is not technical → plain French, few clicks, undo where
  possible, everything editable by hand.
- **Mobile**: check-in and exhibitor pages must work well on phones.
- **Backups**: automatic daily DB backup + manual export button.
- **Security**: admin behind login; magic links single-purpose, expiring, hashed.

## 8. MVP scope & roadmap (proposal)

**MVP (needed before next season's priority phase)**
1. Plan upload + spot editor ("click the numbers" + bulk tool).
2. Contacts + bookings + manual payments.
3. History import (manual grid first, AI photo extraction right after).
4. Priority computation, conflicts screen, Phase 1 invitations with magic links.
5. Map with status colours and tooltips.
6. Emails: invitation, confirmation + payment instructions, reminders.

**v1**
7. Public "request on the map" with 1st/2nd/3rd choices, arbitration screen,
   assignment helper, waiting list (Phase 2).
8. Market-day check-in, walk-ins, printable PDFs.
9. Dashboard, exports.

**Later**
- Bank statement import & auto-matching; online payment (Payconiq/Stripe).
- Dutch/English UI.

## 9. Key screens

1. **Tableau de bord** — counters, upcoming deadlines, to-do (conflicts, unpaid…).
2. **Plan** — map, filters, side panel; edit mode for spots.
3. **Exposants** — searchable list, contact page with history.
4. **Réservations** — list per edition with status/payment filters, bulk actions.
5. **Priorités** — candidate per spot, conflicts to resolve, "send invitations".
6. **Demandes** — Phase 2 requests per spot (competing requests), confirm/redirect,
   assignment helper.
7. **Paiements** — record & reconcile.
8. **Jour J** — mobile check-in.
9. **Import** — photos/grid/review.
10. **Paramètres** — edition dates, tariffs, payment instructions, email templates,
    Gmail settings, users.
11. **Public**: map with free spots + request form; personal booking page (magic link).

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
| D16 | Phase 2: exhibitors request spots on the map (1st/2nd/3rd choice), organiser confirms; competing requests allowed | Q&A 7, 8 |
| D17 | Renewal: same spots offered, exhibitor may confirm fewer | Q&A 7 |
| D18 | Residents may claim all spots facing their house, at normal price | Q&A 7 |
| D19 | Online-only market-day check-in | Q&A 7 |
| D20 | Refunds allowed before a per-edition deadline | Q&A 8 |
| D21 | All organisers are admins (no volunteer role) | Q&A 8 |
| D22 | No placement rules by type of goods | Q&A 8 |
| D23 | No association tariff; price per spot independent of length | Q&A 9 |
| D24 | Resident priority is permanent; booking only in the resident's name | Q&A 9 |
| D25 | Rain: no special handling, bookings and payments unchanged | Q&A 9 |
| D26 | No data retention limit for now | Q&A 9 |
| D27 | Emails via the organiser's Gmail (SMTP) | Q&A 9 |
| D28 | Paper plan exists → scanned/photographed and uploaded | Q&A 9 |
| D29 | Bank details & structured communication deferred; simple booking reference | Q&A 9 |
| D30 | Public map shows pending request count on free spots | Q&A 9 |
| D31 | Tech stack approved (§6) | Q&A 10 |
| D32 | Plan = A4 hand-drawn sheet with numbers; shapes are visual only | Q&A 10 |
| D33 | Bulk emails only when the organiser decides; Gmail batching + daily cap | Q&A 10 |
| D34 | Early-bird deadline independent from priority deadline | Q&A 10 |

## 12. Open questions

None blocking. To revisit later: data retention period, bank details / structured
communication, Dutch UI, online payment.
