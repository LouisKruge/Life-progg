import { describe, expect, it } from "vitest";
import { parseMoney } from "../../src/client/lib/format";

describe("parseMoney", () => {
  it("parses South African and international money input to integer cents", () => {
    expect(parseMoney("6000")).toBe(600_000);
    expect(parseMoney("R 6 000")).toBe(600_000);
    expect(parseMoney("6 000,50")).toBe(600_050);
    expect(parseMoney("6,000.50")).toBe(600_050);
    expect(parseMoney("25 000")).toBe(2_500_000);
    expect(parseMoney("0.1")).toBe(10);
    expect(parseMoney("-150")).toBe(-15_000);
  });

  it("returns null for empty input and NaN for garbage", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("  ")).toBeNull();
    expect(parseMoney("abc")).toBeNaN();
    expect(parseMoney("12.345")).toBe(1_234_500); // three trailing digits = thousands separator
  });
});
