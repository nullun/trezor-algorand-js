import { describe, expect, it } from "vitest";
import { defaultAlgorandPath, parsePath } from "../src/core/path.js";
import { InvalidPathError } from "../src/core/errors.js";

const HARDENED = 0x80000000;

describe("parsePath", () => {
  it("parses standard hardened paths", () => {
    expect(parsePath("m/44'/283'/0'/0/0")).toEqual([
      (44 | HARDENED) >>> 0,
      (283 | HARDENED) >>> 0,
      (0 | HARDENED) >>> 0,
      0,
      0,
    ]);
  });

  it("accepts the alternate 'h' hardened suffix", () => {
    expect(parsePath("m/44h/283h/0h")).toEqual([
      (44 | HARDENED) >>> 0,
      (283 | HARDENED) >>> 0,
      (0 | HARDENED) >>> 0,
    ]);
  });

  it("rejects hex segments", () => {
    expect(() => parsePath("m/0x10'/0/0")).toThrow(InvalidPathError);
  });

  it("rejects scientific notation", () => {
    expect(() => parsePath("m/1e2/0/0")).toThrow(InvalidPathError);
  });

  it("rejects empty segments", () => {
    expect(() => parsePath("m//0/0")).toThrow(InvalidPathError);
  });

  it("rejects a path without segments", () => {
    expect(() => parsePath("m")).toThrow(InvalidPathError);
    expect(() => parsePath("m/")).toThrow(InvalidPathError);
  });

  it("rejects paths not starting with m", () => {
    expect(() => parsePath("44'/283'/0'")).toThrow(InvalidPathError);
  });

  it("rejects values that overflow into the hardened bit", () => {
    expect(() => parsePath("m/2147483648")).toThrow(InvalidPathError);
  });
});

describe("defaultAlgorandPath", () => {
  it("returns the canonical Algorand five-segment path", () => {
    expect(defaultAlgorandPath(7)).toEqual([
      (44 | HARDENED) >>> 0,
      (283 | HARDENED) >>> 0,
      (7 | HARDENED) >>> 0,
      (0 | HARDENED) >>> 0,
      (0 | HARDENED) >>> 0,
    ]);
  });

  it("rejects negative or non-integer accounts", () => {
    expect(() => defaultAlgorandPath(-1)).toThrow(InvalidPathError);
    expect(() => defaultAlgorandPath(1.5)).toThrow(InvalidPathError);
  });
});
