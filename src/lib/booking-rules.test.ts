import { describe, expect, it } from "vitest";
import { endOfDayBrussels, formatDateFr, todayBrussels } from "./dates";
import { estimateDelay, isQuotaError } from "./email/schedule";
import { DEFAULT_TEMPLATES, renderTemplate } from "./email/templates";
import { amountDue, formatEuros, parseEuros, pricePerSpot, tariffGrid } from "./pricing";
import { mainReason, planOffers } from "./priorities";

describe("dates", () => {
  it("computes Brussels end of day in winter and summer", () => {
    expect(endOfDayBrussels("2027-01-15").toISOString()).toBe("2027-01-15T22:59:59.999Z");
    expect(endOfDayBrussels("2027-05-01").toISOString()).toBe("2027-05-01T21:59:59.999Z");
  });
  it("uses the Brussels calendar day", () => {
    expect(todayBrussels(new Date("2027-05-01T22:30:00Z"))).toBe("2027-05-02");
  });
  it("formats in French", () => {
    expect(formatDateFr("2027-05-01")).toBe("1er mai 2027");
    expect(formatDateFr("2027-05-01", true)).toBe("samedi 1er mai 2027");
    expect(formatDateFr("2027-06-13", true)).toBe("dimanche 13 juin 2027");
  });
});

describe("pricing", () => {
  const grid = tariffGrid([
    { kind: "private", earlyBird: true, pricePerSpotCents: 1000 },
    { kind: "private", earlyBird: false, pricePerSpotCents: 1200 },
    { kind: "pro", earlyBird: false, pricePerSpotCents: 2000 },
  ]);
  it("applies the early-bird price up to the deadline included", () => {
    expect(pricePerSpot(grid, "private", "2027-03-31", "2027-03-31")).toBe(1000);
    expect(pricePerSpot(grid, "private", "2027-04-01", "2027-03-31")).toBe(1200);
  });
  it("falls back to the normal price without early-bird price", () =>
    expect(pricePerSpot(grid, "pro", "2027-01-01", "2027-03-31")).toBe(2000));
  it("multiplies by the number of spots", () =>
    expect(amountDue(grid, "private", 3, "2027-05-01", null)).toBe(3600));
  it("is null without a price", () =>
    expect(amountDue(tariffGrid([]), "pro", 1, "2027-01-01", null)).toBeNull());
  it("parses and formats euros", () => {
    expect(parseEuros("12,50 €")).toBe(1250);
    expect(parseEuros("")).toBeNull();
    expect(parseEuros("abc")).toBeNull();
    expect(formatEuros(1250).replace(/\s/g, " ")).toBe("12,50 €");
  });
});

describe("planOffers", () => {
  const none = { heldSpotIds: new Set<number>(), contactsWithBooking: new Set<number>() };

  it("groups a renter's spots into one offer", () => {
    const { offers, conflicts } = planOffers(
      [
        { spotId: 41, contactId: 1, reason: "last_year" },
        { spotId: 42, contactId: 1, reason: "last_year" },
      ],
      none,
    );
    expect(offers).toEqual([{ contactId: 1, spotIds: [41, 42], reasons: ["last_year"] }]);
    expect(conflicts).toEqual([]);
  });

  it("merges reasons when the renter is also the resident", () => {
    const { offers } = planOffers(
      [
        { spotId: 5, contactId: 1, reason: "last_year" },
        { spotId: 5, contactId: 1, reason: "resident" },
      ],
      none,
    );
    expect(offers[0].reasons).toEqual(["last_year", "resident"]);
    expect(mainReason(offers[0].reasons)).toBe("resident");
  });

  it("turns a spot claimed by two people into a conflict, the rest is still offered", () => {
    const { offers, conflicts } = planOffers(
      [
        { spotId: 7, contactId: 1, reason: "last_year" },
        { spotId: 8, contactId: 1, reason: "last_year" },
        { spotId: 7, contactId: 2, reason: "resident" },
      ],
      none,
    );
    expect(conflicts).toEqual([
      {
        spotId: 7,
        claims: [
          { contactId: 1, reasons: ["last_year"] },
          { contactId: 2, reasons: ["resident"] },
        ],
      },
    ]);
    expect(offers).toEqual([{ contactId: 1, spotIds: [8], reasons: ["last_year"] }]);
  });

  it("skips held/inactive spots and contacts that already have a booking", () => {
    const { offers, conflicts } = planOffers(
      [
        { spotId: 1, contactId: 1, reason: "last_year" },
        { spotId: 2, contactId: 2, reason: "last_year" },
        { spotId: 3, contactId: 3, reason: "resident" },
      ],
      { heldSpotIds: new Set([1]), contactsWithBooking: new Set([2]), inactiveSpotIds: new Set([3]) },
    );
    expect(offers).toEqual([]);
    expect(conflicts).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("fills placeholders and keeps unknown ones visible", () => {
    const out = renderTemplate(
      { subject: "N°{{emplacements}}", body: "{{prenom}} {{inconnu}}" },
      {
        emplacements: "12, 13",
        prenom: "Marie",
      },
    );
    expect(out).toEqual({ subject: "N°12, 13", body: "Marie {{inconnu}}" });
  });
  it("has every default template render without leftovers given all variables", () => {
    const vars = Object.fromEntries(
      [
        "prenom",
        "nom",
        "annee",
        "date_brocante",
        "emplacements",
        "date_limite",
        "lien",
        "montant",
        "reference",
        "emplacement_s",
        "instructions_paiement",
        "organisateur",
        "raison",
      ].map((k) => [k, "x"]),
    );
    for (const t of Object.values(DEFAULT_TEMPLATES)) {
      const out = renderTemplate(t, vars);
      expect(out.subject + out.body).not.toMatch(/\{\{/);
    }
  });
});

describe("outbox pacing", () => {
  it("estimates the delay to empty the queue", () => {
    expect(estimateDelay(0, 0, 20, 300)).toBe("");
    expect(estimateDelay(15, 0, 20, 300)).toBe("dans les prochaines minutes");
    expect(estimateDelay(100, 0, 20, 300)).toBe("≈ 50 min");
    expect(estimateDelay(380, 0, 20, 300)).toBe("≈ 2 jours (limite de 300 emails par 24 h)");
  });
  it("recognises Gmail quota errors", () => {
    expect(isQuotaError({ responseCode: 550, response: "550 5.4.5 Daily user sending limit exceeded" })).toBe(
      true,
    );
    expect(isQuotaError({ responseCode: 421 })).toBe(true);
    expect(isQuotaError({ responseCode: 550, response: "550 5.1.1 The email account does not exist" })).toBe(
      false,
    );
  });
});
