import { describe, expect, it } from "vitest";
import { compareLabels, nextLabel, parseLabel, rowLabels, rowShapes } from "./spots";

describe("parseLabel", () => {
  it("splits number and suffix", () => {
    expect(parseLabel("12bis")).toEqual({ num: 12, suffix: "bis" });
    expect(parseLabel(" 7 ")).toEqual({ num: 7, suffix: "" });
    expect(parseLabel("A3")).toEqual({ num: null, suffix: "A3" });
  });
});

describe("compareLabels", () => {
  it("sorts naturally", () => {
    const labels = ["10", "2", "10bis", "A", "1", "11"];
    expect(labels.sort(compareLabels)).toEqual(["1", "2", "10", "10bis", "11", "A"]);
  });
});

describe("nextLabel", () => {
  it("starts at 1", () => expect(nextLabel(undefined, [])).toBe("1"));
  it("increments and drops suffix", () => expect(nextLabel("12bis", [])).toBe("13"));
  it("skips used labels", () => expect(nextLabel("4", ["5", "6", "8"])).toBe("7"));
  it("falls back to 1 for non-numeric labels", () => expect(nextLabel("A", ["1"])).toBe("2"));
});

describe("rowLabels", () => {
  it("numbers sequentially", () => expect(rowLabels("12", 3)).toEqual(["12", "13", "14"]));
  it("keeps the suffix only on the first", () => expect(rowLabels("12bis", 2)).toEqual(["12bis", "13"]));
  it("rejects non-numeric start", () => expect(() => rowLabels("A", 2)).toThrow());
});

describe("rowShapes", () => {
  it("splits a horizontal segment into equal spots", () => {
    const shapes = rowShapes({ x: 0, y: 0 }, { x: 100, y: 0 }, 4, 10);
    expect(shapes).toHaveLength(4);
    expect(shapes.map((s) => s.x)).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(shapes.every((s) => s.width === 25 && s.height === 10 && s.rotation === 0)).toBe(true);
  });
  it("follows the segment angle", () => {
    const [s] = rowShapes({ x: 0, y: 0 }, { x: 0, y: 50 }, 1, 10);
    expect(s.rotation).toBe(90);
    expect(s.y).toBe(25);
  });
});
