import { beforeEach, describe, expect, it } from "vitest";
import { seal, unseal } from "./secret-box";

describe("secret box", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "a".repeat(40);
  });

  it("round-trips a value without storing it in clear", () => {
    const sealed = seal("abcd efgh ijkl mnop");
    expect(sealed).not.toContain("abcd");
    expect(unseal(sealed)).toBe("abcd efgh ijkl mnop");
  });

  it("uses a fresh IV each time", () => {
    expect(seal("x")).not.toBe(seal("x"));
  });

  it("returns null when the secret changed or the value is damaged", () => {
    const sealed = seal("secret");
    process.env.SESSION_SECRET = "b".repeat(40);
    expect(unseal(sealed)).toBeNull();
    expect(unseal("garbage")).toBeNull();
  });
});
