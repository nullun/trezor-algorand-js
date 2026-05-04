import { describe, expect, it } from "vitest";
import { readMessage, writeMessage } from "../src/core/framing.js";
import { MockTransportPair } from "./mockTransport.js";

describe("v1 wire framing", () => {
  it("round-trips a message smaller than one chunk", async () => {
    const pair = new MockTransportPair();
    const payload = new Uint8Array([1, 2, 3, 4]);
    await writeMessage(pair.host, { type: 123, payload });
    const read = await readMessage(pair.device);
    expect(read.type).toBe(123);
    expect([...read.payload]).toEqual([1, 2, 3, 4]);
  });

  it("round-trips a message spanning multiple chunks", async () => {
    const pair = new MockTransportPair();
    const payload = new Uint8Array(500);
    for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;
    await writeMessage(pair.host, { type: 610, payload });
    const read = await readMessage(pair.device);
    expect(read.type).toBe(610);
    expect(read.payload.length).toBe(500);
    for (let i = 0; i < 500; i++) expect(read.payload[i]).toBe(i & 0xff);
  });

  it("round-trips a payload sized exactly to the chunk boundary", async () => {
    const pair = new MockTransportPair();
    // bodySize per chunk = 63; first chunk's body holds 8 header bytes + 55
    // payload bytes. Set payload so total fills N chunks with no remainder.
    const payload = new Uint8Array(63 * 4 - 8);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 31) & 0xff;
    await writeMessage(pair.host, { type: 42, payload });
    const read = await readMessage(pair.device);
    expect(read.type).toBe(42);
    expect(read.payload.length).toBe(payload.length);
    for (let i = 0; i < payload.length; i++) {
      expect(read.payload[i]).toBe(payload[i]);
    }
  });

  it("round-trips an empty payload", async () => {
    const pair = new MockTransportPair();
    await writeMessage(pair.host, { type: 9, payload: new Uint8Array(0) });
    const read = await readMessage(pair.device);
    expect(read.type).toBe(9);
    expect(read.payload.length).toBe(0);
  });

  it("rejects a chunk missing the report magic", async () => {
    const pair = new MockTransportPair();
    const bad = new Uint8Array(64);
    bad[0] = 0x00;
    await pair.host.write(bad);
    await expect(readMessage(pair.device)).rejects.toThrow(/report magic/);
  });
});
