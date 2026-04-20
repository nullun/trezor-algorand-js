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

  it("rejects a chunk missing the report magic", async () => {
    const pair = new MockTransportPair();
    const bad = new Uint8Array(64);
    bad[0] = 0x00;
    await pair.host.write(bad);
    await expect(readMessage(pair.device)).rejects.toThrow(/report magic/);
  });
});
