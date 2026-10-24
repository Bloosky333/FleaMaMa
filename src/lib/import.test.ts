import { describe, expect, it } from "vitest";
import {
  emptyRowData,
  isEmptyRow,
  parseKind,
  parsePaid,
  parsePastedTable,
  parseSpotList,
  validateRows,
} from "./import";

describe("parseSpotList", () => {
  it.each([
    ["41", ["41"]],
    ["41-43", ["41", "42", "43"]],
    ["41 - 43, 45bis", ["41", "42", "43", "45bis"]],
    ["12 et 13", ["12", "13"]],
    ["12/13;14", ["12", "13", "14"]],
    ["12, 12", ["12"]],
    ["", []],
  ])("%s", (input, expected) => expect(parseSpotList(input)).toEqual({ labels: expected }));

  it("rejects absurd ranges", () => expect(parseSpotList("10-90").error).toBeDefined());
  it("rejects unreadable values", () => expect(parseSpotList("4?").error).toBeDefined());
});

describe("parsePaid", () => {
  it.each([
    ["oui", true],
    ["X", true],
    ["Payé", true],
    ["non", false],
    ["", null],
    ["peut-être", null],
  ])("%s → %s", (input, expected) => expect(parsePaid(input)).toBe(expected));
});

describe("parseKind", () => {
  it("detects professionals", () => {
    expect(parseKind("Pro")).toBe("pro");
    expect(parseKind("professionnel")).toBe("pro");
    expect(parseKind("")).toBe("private");
    expect(parseKind("particulier")).toBe("private");
  });
});

describe("parsePastedTable", () => {
  it("splits Excel (tab separated) data", () => {
    expect(parsePastedTable("12\tDupont\tMarie\r\n13\tMartin\tJean\r\n")).toEqual([
      ["12", "Dupont", "Marie"],
      ["13", "Martin", "Jean"],
    ]);
  });
  it("splits semicolon CSV and strips quotes", () => {
    expect(parsePastedTable('12;"Dupont";Marie')).toEqual([["12", "Dupont", "Marie"]]);
  });
  it("keeps single values", () => expect(parsePastedTable("Dupont")).toEqual([["Dupont"]]));
});

describe("validateRows", () => {
  const known = new Set(["1", "2", "3"]);
  const row = (spots: string, lastName = "Dupont") => ({ ...emptyRowData(), spots, lastName });

  it("accepts a clean row", () => expect(validateRows([row("1-2")], known)).toEqual([[]]));
  it("flags unknown and shared spots", () => {
    const [a, b] = validateRows([row("2, 9"), row("2", "Martin")], known);
    expect(a.map((i) => i.message)).toEqual([
      "Emplacement inconnu : 9",
      "Emplacement en double dans l’import : 2",
    ]);
    expect(b[0].level).toBe("error");
  });
  it("requires a name", () => expect(validateRows([row("1", "")], known)[0][0].message).toBe("Nom manquant"));
  it("warns when there is no spot", () =>
    expect(validateRows([row("")], known)[0]).toEqual([{ level: "warning", message: "Aucun emplacement" }]));
});

describe("isEmptyRow", () => {
  it("ignores whitespace", () => expect(isEmptyRow({ ...emptyRowData(), city: "  " })).toBe(true));
});
