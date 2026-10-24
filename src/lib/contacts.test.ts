import { describe, expect, it } from "vitest";
import {
  addressKey,
  displayName,
  duplicateReason,
  formatPhone,
  normalizePhone,
  normalizeText,
} from "./contacts";

const base = {
  firstName: "Marie",
  lastName: "Dupont",
  email: "",
  phone: "",
  street: "",
  houseNumber: "",
  postcode: "",
};

describe("normalizePhone", () => {
  it.each([
    ["0475 12 34 56", "+32475123456"],
    ["0475/12.34.56", "+32475123456"],
    ["0032 2 123 45 67", "+3221234567"],
    ["+32 475 12 34 56", "+32475123456"],
    ["", ""],
    ["pas de tel", "pas de tel"],
  ])("%s → %s", (input, expected) => expect(normalizePhone(input)).toBe(expected));
});

describe("formatPhone", () => {
  it("formats mobiles and landlines", () => {
    expect(formatPhone("+32475123456")).toBe("0475 12 34 56");
    expect(formatPhone("+3221234567")).toBe("02 123 45 67");
    expect(formatPhone("+3281123456")).toBe("081 12 34 56");
    expect(formatPhone("+33612345678")).toBe("+33612345678");
  });
});

describe("normalizeText", () => {
  it("strips accents, case and punctuation", () =>
    expect(normalizeText("  Hélène-Marie  D'Août ")).toBe("helene marie d aout"));
});

describe("duplicateReason", () => {
  it("matches on email", () => {
    const m = duplicateReason({ ...base, email: "A@B.be" }, { ...base, lastName: "X", email: "a@b.be " });
    expect(m?.reason).toBe("même email");
  });
  it("matches on phone in different formats", () => {
    expect(
      duplicateReason({ ...base, phone: "0475 12 34 56" }, { ...base, lastName: "Y", phone: "+32475123456" }),
    ).not.toBeNull();
  });
  it("matches on accent-insensitive full name", () => {
    expect(duplicateReason({ ...base, lastName: "Dupré" }, { ...base, lastName: "DUPRE" })?.reason).toBe(
      "même nom",
    );
  });
  it("ignores a shared first name only", () => {
    expect(duplicateReason(base, { ...base, lastName: "Martin" })).toBeNull();
  });
});

describe("addressKey", () => {
  it("matches a spot's facing address to a contact address", () => {
    expect(addressKey("Rue Haute, 12")).toBe(addressKey("rue  haute", "12"));
    expect(addressKey("Rue Haute 12")).not.toBe(addressKey("Rue Haute", "120"));
  });
});

describe("displayName", () => {
  it("formats person and company", () => {
    expect(displayName({ firstName: "Marie", lastName: "Dupont", company: "" })).toBe("DUPONT Marie");
    expect(displayName({ firstName: "", lastName: "", company: "Brocante SA" })).toBe("Brocante SA");
  });
});
