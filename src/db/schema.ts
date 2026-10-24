import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Organisers (all admins, see spec §2)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Plan & spots (spec §4.1)
// ---------------------------------------------------------------------------

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  imageMime: text("image_mime").notNull(),
  imageData: bytea("image_data").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  /** Default size (in plan pixels) of a spot created with the "click the numbers" tool. */
  defaultSpotWidth: doublePrecision("default_spot_width").notNull().default(40),
  defaultSpotHeight: doublePrecision("default_spot_height").notNull().default(20),
  /** Default real length of a spot, in metres. */
  defaultSpotLengthM: doublePrecision("default_spot_length_m").notNull().default(3),
  createdAt: createdAt(),
});

export const spots = pgTable(
  "spots",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(),
    street: text("street").notNull().default(""),
    side: text("side").notNull().default(""),
    /** Real length in metres; null = plan default. Not derived from the drawing. */
    lengthM: doublePrecision("length_m"),
    // Shape on the plan image, in image pixels. (x, y) is the centre.
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    rotation: doublePrecision("rotation").notNull().default(0),
    facingAddresses: text("facing_addresses")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("spots_label_unique").on(sql`lower(${t.label})`)],
);

// ---------------------------------------------------------------------------
// Editions & tariffs (spec §4.3, §4.4)
// ---------------------------------------------------------------------------

export const editionStatus = pgEnum("edition_status", ["preparation", "priority", "open", "closed"]);

export const editions = pgTable("editions", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  marketDate: date("market_date"),
  priorityDeadline: date("priority_deadline"),
  earlyBirdDeadline: date("early_bird_deadline"),
  paymentDeadline: date("payment_deadline"),
  refundDeadline: date("refund_deadline"),
  publicOpeningDate: date("public_opening_date"),
  paymentInstructions: text("payment_instructions").notNull().default(""),
  iban: text("iban"),
  status: editionStatus("status").notNull().default("preparation"),
  createdAt: createdAt(),
});

export const spotEditionStates = pgTable(
  "spot_edition_states",
  {
    spotId: integer("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    editionId: integer("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    inactiveReason: text("inactive_reason").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.spotId, t.editionId] })],
);

export const contactKind = pgEnum("contact_kind", ["private", "pro"]);

export const tariffs = pgTable("tariffs", {
  id: serial("id").primaryKey(),
  editionId: integer("edition_id")
    .notNull()
    .references(() => editions.id, { onDelete: "cascade" }),
  kind: contactKind("kind").notNull(),
  earlyBird: boolean("early_bird").notNull(),
  pricePerSpotCents: integer("price_per_spot_cents").notNull(),
});

// ---------------------------------------------------------------------------
// Contacts (spec §4.2)
// ---------------------------------------------------------------------------

export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(), // photo | manual | csv
  status: text("status").notNull().default("draft"),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    company: text("company").notNull().default(""),
    street: text("street").notNull().default(""),
    houseNumber: text("house_number").notNull().default(""),
    postcode: text("postcode").notNull().default(""),
    city: text("city").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    kind: contactKind("kind").notNull().default("private"),
    vatNumber: text("vat_number").notNull().default(""),
    notes: text("notes").notNull().default(""),
    gdprConsentAt: timestamp("gdpr_consent_at", { withTimezone: true }),
    mergedIntoId: integer("merged_into_id"),
    importBatchId: integer("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contacts_last_name_idx").on(t.lastName), index("contacts_email_idx").on(t.email)],
);

export const residentLinks = pgTable(
  "resident_links",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    spotId: integer("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "cascade" }),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    validatedBy: integer("validated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.spotId] })],
);

// ---------------------------------------------------------------------------
// Bookings & payments (spec §4.5, §4.6)
// ---------------------------------------------------------------------------

export const bookingStatus = pgEnum("booking_status", [
  "offered",
  "requested",
  "confirmed",
  "declined",
  "expired",
  "waitlist",
  "cancelled",
  "historical",
]);
export const bookingSource = pgEnum("booking_source", ["priority", "request", "walk_in", "history"]);
export const priorityReason = pgEnum("priority_reason", ["last_year", "resident", "manual"]);
export const presence = pgEnum("presence", ["unknown", "present", "no_show"]);

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    editionId: integer("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    status: bookingStatus("status").notNull(),
    source: bookingSource("source").notNull(),
    priorityReason: priorityReason("priority_reason"),
    tariffId: integer("tariff_id").references(() => tariffs.id, { onDelete: "set null" }),
    amountDueCents: integer("amount_due_cents"),
    amountOverrideReason: text("amount_override_reason").notNull().default(""),
    reference: text("reference").notNull().unique(),
    offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    presence: presence("presence").notNull().default("unknown"),
    /** Paid flag as read from the old system (history import only). */
    historicalPaid: boolean("historical_paid"),
    notes: text("notes").notNull().default(""),
    importBatchId: integer("import_batch_id").references(() => importBatches.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("bookings_edition_idx").on(t.editionId), index("bookings_contact_idx").on(t.contactId)],
);

export const bookingSpots = pgTable(
  "booking_spots",
  {
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    spotId: integer("spot_id")
      .notNull()
      .references(() => spots.id, { onDelete: "restrict" }),
    editionId: integer("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    /** Set when the booking no longer holds the spot (declined, expired, cancelled, reduced). */
    released: boolean("released").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.bookingId, t.spotId] }),
    // A spot belongs to at most one active booking per edition.
    uniqueIndex("booking_spots_active_unique")
      .on(t.editionId, t.spotId)
      .where(sql`${t.released} = false`),
  ],
);

export const spotRequests = pgTable("spot_requests", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  choiceRank: integer("choice_rank").notNull(),
  spotIds: integer("spot_ids").array().notNull(),
  status: text("status").notNull().default("pending"),
});

export const paymentMethod = pgEnum("payment_method", ["cash", "transfer"]);

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id")
    .notNull()
    .references(() => bookings.id, { onDelete: "cascade" }),
  /** Negative amount = refund. */
  amountCents: integer("amount_cents").notNull(),
  method: paymentMethod("method").notNull(),
  paidAt: date("paid_at").notNull(),
  reference: text("reference").notNull().default(""),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Magic links & emails (spec §4.7)
// ---------------------------------------------------------------------------

export const magicLinks = pgTable("magic_links", {
  tokenHash: text("token_hash").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const emailCampaigns = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  editionId: integer("edition_id").references(() => editions.id, { onDelete: "cascade" }),
  template: text("template").notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("running"), // running | paused | done
  createdAt: createdAt(),
});

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").references(() => emailCampaigns.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    bookingId: integer("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    template: text("template").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** Lower = sent first. Transactional emails use 0, bulk 10. */
    priority: integer("priority").notNull().default(10),
    status: text("status").notNull().default("queued"), // queued | sending | sent | failed
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("email_outbox_queue_idx").on(t.status, t.priority, t.scheduledAt)],
);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  at: createdAt(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  action: text("action").notNull(),
  data: jsonb("data"),
});

export type Spot = typeof spots.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Plan = typeof plans.$inferSelect;
