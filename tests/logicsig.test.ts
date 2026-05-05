import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEAL_VERSION,
  compileFalconLogicSig,
  formatFalconLogicSigTeal,
} from "../src/core/logicsig.js";

const FALCON_PUBKEY_SIZE = 1793;

function pubkey(fill = 0): Uint8Array {
  return new Uint8Array(FALCON_PUBKEY_SIZE).fill(fill);
}

describe("FALCON LogicSig assembly", () => {
  it("matches the firmware template byte layout for v12", () => {
    const program = compileFalconLogicSig({ publicKey: pubkey(0), counter: 0 });
    // 11-byte prefix + 1793-byte pubkey + 1-byte suffix
    expect(program.length).toBe(11 + FALCON_PUBKEY_SIZE + 1);
    expect([...program.slice(0, 11)]).toEqual([
      0x0c, 0x26, 0x01, 0x01, 0x00, 0x31, 0x17, 0x2d, 0x80, 0x81, 0x0e,
    ]);
    expect(program[program.length - 1]).toBe(0x85);
  });

  it("splices counter into the bytecblock slot at offset 4", () => {
    const program = compileFalconLogicSig({ publicKey: pubkey(0), counter: 0xab });
    expect(program[4]).toBe(0xab);
  });

  it("embeds the FALCON public key after the prefix", () => {
    const pk = new Uint8Array(FALCON_PUBKEY_SIZE);
    pk[0] = 0xde;
    pk[FALCON_PUBKEY_SIZE - 1] = 0xad;
    const program = compileFalconLogicSig({ publicKey: pk, counter: 0 });
    expect(program[11]).toBe(0xde);
    expect(program[11 + FALCON_PUBKEY_SIZE - 1]).toBe(0xad);
  });

  it("rejects wrong pubkey sizes", () => {
    expect(() =>
      compileFalconLogicSig({ publicKey: new Uint8Array(32), counter: 0 }),
    ).toThrow(/1793/);
  });

  it("rejects out-of-range counters", () => {
    expect(() =>
      compileFalconLogicSig({ publicKey: pubkey(), counter: 256 }),
    ).toThrow(/single byte/);
    expect(() =>
      compileFalconLogicSig({ publicKey: pubkey(), counter: -1 }),
    ).toThrow(/single byte/);
  });

  it("rejects unknown TEAL versions", () => {
    expect(() =>
      compileFalconLogicSig({ publicKey: pubkey(), counter: 0, tealVersion: 13 }),
    ).toThrow(/TEAL version/);
  });

  it("formats the verbose TEAL source with hex literals", () => {
    const pk = new Uint8Array(FALCON_PUBKEY_SIZE).fill(0xff);
    const teal = formatFalconLogicSigTeal({ publicKey: pk, counter: 0x42 });
    const lines = teal.split("\n");
    expect(lines[0]).toBe(`#pragma version ${DEFAULT_TEAL_VERSION}`);
    expect(lines[1]).toBe("bytecblock 0x42");
    expect(lines[2]).toBe("txn TxID");
    expect(lines[3]).toBe("arg 0");
    expect(lines[4]?.startsWith("pushbytes 0x")).toBe(true);
    // hex of 1793 bytes = 3586 chars
    expect(lines[4]!.length).toBe("pushbytes 0x".length + FALCON_PUBKEY_SIZE * 2);
    expect(lines[5]).toBe("falcon_verify");
  });
});
