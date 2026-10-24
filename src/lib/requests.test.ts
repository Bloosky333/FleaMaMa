import { describe, expect, it } from "vitest";
import { isPublicBookingOpen, suggestSpots } from "./requests";

describe("isPublicBookingOpen", () => {
  it("follows the status and the opening date", () => {
    expect(isPublicBookingOpen({ status: "open", publicOpeningDate: null }, "2027-01-01")).toBe(true);
    expect(isPublicBookingOpen({ status: "priority", publicOpeningDate: "2027-05-02" }, "2027-05-01")).toBe(
      false,
    );
    expect(isPublicBookingOpen({ status: "priority", publicOpeningDate: "2027-05-02" }, "2027-05-02")).toBe(
      true,
    );
    expect(isPublicBookingOpen({ status: "closed", publicOpeningDate: "2020-01-01" }, "2027-05-02")).toBe(
      false,
    );
  });
});

describe("suggestSpots", () => {
  const spot = (id: number, x: number, street = "Haute") => ({ id, label: String(id), street, x, y: 0 });
  const free = [spot(1, 0), spot(2, 10), spot(3, 20), spot(9, 25, "Basse"), spot(4, 100), spot(5, 110)];

  it("prefers the same street, closest first", () => {
    const groups = suggestSpots([spot(7, 30)], free, 1);
    expect(groups.map((g) => g[0].id)).toEqual([3, 2, 1]);
  });
  it("keeps groups of neighbouring spots", () => {
    const groups = suggestSpots([spot(7, 105)], free, 2, 2);
    expect(groups.map((g) => g.map((s) => s.id).sort())).toEqual([
      [4, 5],
      [2, 3],
    ]);
  });
  it("returns nothing when not enough free spots", () =>
    expect(suggestSpots([spot(7, 0)], [spot(1, 0)], 2)).toEqual([]));
});
