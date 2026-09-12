import { describe, expect, it } from "vitest";
import { isSafeHttpUrl, normalizeOptionalUrl, parsePositiveIntId, validateIdArray } from "../src/worker/lib/validation";

describe("isSafeHttpUrl / normalizeOptionalUrl", () => {
  it("accepts http(s) URLs", () => {
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
    expect(isSafeHttpUrl("http://example.com/path?x=1")).toBe(true);
  });

  it("rejects javascript:/data:/vbscript: and other unsafe schemes", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
  });

  it("normalizeOptionalUrl passes undefined/empty through as null", () => {
    expect(normalizeOptionalUrl(undefined)).toBeNull();
    expect(normalizeOptionalUrl(null)).toBeNull();
    expect(normalizeOptionalUrl("")).toBeNull();
    expect(normalizeOptionalUrl("   ")).toBeNull();
  });

  it("normalizeOptionalUrl throws on an unsafe scheme instead of storing it", () => {
    expect(() => normalizeOptionalUrl("javascript:alert(document.cookie)")).toThrow();
  });

  it("normalizeOptionalUrl trims and returns a valid http(s) URL as-is", () => {
    expect(normalizeOptionalUrl("  https://example.com/video  ")).toBe("https://example.com/video");
  });
});

describe("parsePositiveIntId", () => {
  it("accepts clean positive integer strings", () => {
    expect(parsePositiveIntId("1")).toBe(1);
    expect(parsePositiveIntId("42")).toBe(42);
    expect(parsePositiveIntId("999999")).toBe(999999);
  });

  it("rejects non-numeric, zero, negative, decimal, and empty input", () => {
    expect(parsePositiveIntId("abc")).toBeNull();
    expect(parsePositiveIntId("0")).toBeNull();
    expect(parsePositiveIntId("-1")).toBeNull();
    expect(parsePositiveIntId("1.5")).toBeNull();
    expect(parsePositiveIntId("")).toBeNull();
    expect(parsePositiveIntId("  ")).toBeNull();
    expect(parsePositiveIntId(undefined)).toBeNull();
    expect(parsePositiveIntId(null)).toBeNull();
  });

  it("rejects values with leading/trailing garbage that Number() would otherwise coerce", () => {
    // Number("1e2") === 100, Number(" 1 ") === 1 — both must still be
    // rejected here since they aren't a clean decimal-digit string, which
    // is what actually reaches a D1 `.bind()` call as a route param.
    expect(parsePositiveIntId("1e2")).toBeNull();
    expect(parsePositiveIntId("0x10")).toBeNull();
    expect(parsePositiveIntId("1,000")).toBeNull();
  });
});

describe("validateIdArray", () => {
  it("accepts a non-empty array of positive integers", () => {
    expect(validateIdArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("rejects an empty array, a non-array, zero/negative/non-integer entries", () => {
    expect(validateIdArray([])).toBeNull();
    expect(validateIdArray(undefined)).toBeNull();
    expect(validateIdArray("not-an-array")).toBeNull();
    expect(validateIdArray([1, 0])).toBeNull();
    expect(validateIdArray([1, -2])).toBeNull();
    expect(validateIdArray([1, 2.5])).toBeNull();
    expect(validateIdArray([1, "2"])).toBeNull();
    expect(validateIdArray([1, null])).toBeNull();
  });

  it("enforces the maxLength cap", () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => i + 1);
    expect(validateIdArray(tooMany)).toBeNull();
    expect(validateIdArray(tooMany, 1000)).toEqual(tooMany);
  });
});
