import { describe, expect, it } from "vitest";
import { Reader, Writer } from "../src/core/protobuf.js";
import {
  decodeAlgorandAddress,
  decodeAlgorandDataSignature,
  decodeAlgorandFalconAddress,
  decodeAlgorandPublicKey,
  decodeAlgorandTxRequest,
  decodeAlgorandTxSignature,
  decodeFailure,
  decodeFeatures,
  encodeAlgorandGetAddress,
  encodeAlgorandGetFalconAddress,
  encodeAlgorandGetPublicKey,
  encodeAlgorandSignData,
  encodeAlgorandSignTx,
  encodeAlgorandTxAck,
} from "../src/core/messages.js";

describe("protobuf primitives", () => {
  it("round-trips varints at boundaries", () => {
    const w = new Writer();
    for (const v of [0, 1, 127, 128, 16383, 16384, 0xffffffff]) {
      w.writeUint32(1, v);
    }
    const r = new Reader(w.bytes());
    const got: number[] = [];
    while (!r.done) {
      const { field } = r.readTag();
      expect(field).toBe(1);
      got.push(r.readUint32());
    }
    expect(got).toEqual([0, 1, 127, 128, 16383, 16384, 0xffffffff]);
  });

  it("round-trips bytes and strings", () => {
    const w = new Writer();
    w.writeBytes(2, new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    w.writeString(3, "hello");
    const r = new Reader(w.bytes());
    r.readTag();
    expect([...r.readBytes()]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    r.readTag();
    expect(r.readString()).toBe("hello");
  });
});

describe("algorand message encode/decode", () => {
  it("encodes GetPublicKey with repeated address_n and show_display", () => {
    const bytes = encodeAlgorandGetPublicKey([44 | 0x80000000, 283 | 0x80000000, 0 | 0x80000000], true);
    // decode back as generic reader
    const r = new Reader(bytes);
    const addrN: number[] = [];
    let showDisplay = false;
    while (!r.done) {
      const { field } = r.readTag();
      if (field === 1) addrN.push(r.readUint32());
      else if (field === 2) showDisplay = r.readUint32() !== 0;
    }
    expect(addrN).toEqual([0x8000002c, 0x8000011b, 0x80000000]);
    expect(showDisplay).toBe(true);
  });

  it("encodes SignTx with group size/index and decodes TxSignature group", () => {
    const payload = encodeAlgorandSignTx([1, 2], new Uint8Array([1, 2, 3]), 3, 0, 0);
    expect(payload.length).toBeGreaterThan(0);

    // Build a synthetic group signature response with 3 signatures, middle empty.
    const w = new Writer();
    w.writeBytes(1, new Uint8Array(64));
    w.writeBytes(2, new Uint8Array(64).fill(0xaa));
    w.writeBytes(2, new Uint8Array(0));
    w.writeBytes(2, new Uint8Array(64).fill(0xbb));
    const sig = decodeAlgorandTxSignature(w.bytes());
    expect(sig.groupSignatures.length).toBe(3);
    expect(sig.groupSignatures[1]!.length).toBe(0);
    expect(sig.groupSignatures[2]![0]).toBe(0xbb);
  });

  it("decodes simple fixtures", () => {
    // AlgorandPublicKey: field 1, length-delimited, 32 bytes
    const pubkeyBytes = new Uint8Array(32).fill(7);
    const w = new Writer();
    w.writeBytes(1, pubkeyBytes);
    expect([...decodeAlgorandPublicKey(w.bytes())]).toEqual([...pubkeyBytes]);

    const w2 = new Writer();
    w2.writeString(1, "ABCDEFGHIJ");
    expect(decodeAlgorandAddress(w2.bytes())).toBe("ABCDEFGHIJ");

    const w3 = new Writer();
    w3.writeBytes(1, new Uint8Array(64).fill(9));
    expect([...decodeAlgorandDataSignature(w3.bytes())].length).toBe(64);
  });

  it("decodes Failure with code + message", () => {
    const w = new Writer();
    w.writeUint32(1, 4); // ActionCancelled
    w.writeString(2, "Cancelled by user");
    const f = decodeFailure(w.bytes());
    expect(f.code).toBe(4);
    expect(f.message).toBe("Cancelled by user");
  });

  it("decodes Features with packed and non-packed capabilities", () => {
    // non-packed
    const w = new Writer();
    w.writeUint32(2, 2);
    w.writeUint32(3, 8);
    w.writeUint32(4, 1);
    w.writeUint32(30, 1);
    w.writeUint32(30, 25);
    const f = decodeFeatures(w.bytes());
    expect(f.majorVersion).toBe(2);
    expect(f.capabilities).toEqual([1, 25]);

    // packed (length-delimited varints)
    const packedInner = new Writer();
    packedInner.writeVarint(1);
    packedInner.writeVarint(25);
    const w2 = new Writer();
    w2.writeUint32(2, 2);
    w2.writeUint32(3, 8);
    w2.writeUint32(4, 1);
    w2.writeBytes(30, packedInner.bytes());
    const f2 = decodeFeatures(w2.bytes());
    expect(f2.capabilities).toEqual([1, 25]);
  });

  it("encodes SignData with authData and requestId", () => {
    const bytes = encodeAlgorandSignData(
      [1],
      new Uint8Array([1, 2, 3]),
      "example.com",
      new Uint8Array(37).fill(5),
      "rid-1",
    );
    const r = new Reader(bytes);
    const fields: Record<number, unknown> = {};
    while (!r.done) {
      const { field, wireType } = r.readTag();
      if (field === 1) fields[1] = ((fields[1] as number[]) ?? []).concat([r.readUint32()]);
      else if (field === 2) fields[2] = r.readBytes();
      else if (field === 3) fields[3] = r.readString();
      else if (field === 4) fields[4] = r.readBytes();
      else if (field === 5) fields[5] = r.readString();
      else r.skip(wireType);
    }
    expect(fields[3]).toBe("example.com");
    expect(fields[5]).toBe("rid-1");
    expect((fields[4] as Uint8Array).length).toBe(37);
  });

  it("encodes TxAck and decodes TxRequest", () => {
    const ack = encodeAlgorandTxAck(new Uint8Array([9, 8, 7]));
    expect(ack.length).toBeGreaterThan(0);

    const w = new Writer();
    w.writeUint32(1, 3);
    expect(decodeAlgorandTxRequest(w.bytes()).groupIndex).toBe(3);
  });

  it("encodes GetAddress with chunkify flag only when set", () => {
    const withFlags = encodeAlgorandGetAddress([1], true, true);
    const withoutFlags = encodeAlgorandGetAddress([1], false, false);
    expect(withFlags.length).toBeGreaterThan(withoutFlags.length);
  });

  it("encodes GetFalconAddress with the same shape as GetAddress", () => {
    const path = [44 | 0x80000000, 283 | 0x80000000, 0 | 0x80000000];
    expect([...encodeAlgorandGetFalconAddress(path, false, false)]).toEqual([
      ...encodeAlgorandGetAddress(path, false, false),
    ]);
    expect([...encodeAlgorandGetFalconAddress(path, true, true)]).toEqual([
      ...encodeAlgorandGetAddress(path, true, true),
    ]);
  });

  it("decodes AlgorandFalconAddress with all four fields", () => {
    const w = new Writer();
    w.writeString(1, "FALCONLOGICSIGADDRESS".padEnd(58, "A"));
    w.writeBytes(2, new Uint8Array(1793).fill(0xab));
    w.writeUint32(3, 7);
    w.writeUint32(4, 12);
    const out = decodeAlgorandFalconAddress(w.bytes());
    expect(out.address.length).toBe(58);
    expect(out.publicKey.length).toBe(1793);
    expect(out.publicKey[0]).toBe(0xab);
    expect(out.counter).toBe(7);
    expect(out.tealVersion).toBe(12);
  });

  it("decodes AlgorandFalconAddress with only required fields", () => {
    const w = new Writer();
    w.writeString(1, "X".repeat(58));
    w.writeBytes(2, new Uint8Array(1793));
    const out = decodeAlgorandFalconAddress(w.bytes());
    expect(out.counter).toBeUndefined();
    expect(out.tealVersion).toBeUndefined();
  });
});
