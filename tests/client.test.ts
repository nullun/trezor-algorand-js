import { describe, expect, it } from "vitest";
import { TrezorAlgorandClient } from "../src/core/client.js";
import { MessageType } from "../src/core/messages.js";
import { ALGORAND_CAPABILITY } from "../src/types/index.js";
import { readMessage, writeMessage } from "../src/core/framing.js";
import { MockTransportPair } from "./mockTransport.js";
import { Writer } from "../src/core/protobuf.js";
import {
  UserRejectedError,
  CapabilityMissingError,
  ProtocolError,
  TrezorAlgorandError,
} from "../src/core/errors.js";

function featuresPayload(capabilities: number[], bootloaderMode = false): Uint8Array {
  const w = new Writer();
  w.writeUint32(2, 2);
  w.writeUint32(3, 8);
  w.writeUint32(4, 1);
  if (bootloaderMode) w.writeBool(5, true);
  for (const c of capabilities) w.writeUint32(30, c);
  return w.bytes();
}

async function respondInitialize(
  pair: MockTransportPair,
  capabilities: number[],
  bootloader = false,
): Promise<void> {
  const req = await readMessage(pair.device);
  if (req.type !== MessageType.Initialize) {
    throw new Error(`unexpected ${req.type}`);
  }
  await writeMessage(pair.device, {
    type: MessageType.Features,
    payload: featuresPayload(capabilities, bootloader),
  });
}

describe("TrezorAlgorandClient", () => {
  it("connects when Algorand capability is present", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [ALGORAND_CAPABILITY]);
    const client = await p;
    expect(client.cachedFeatures()?.capabilities).toContain(ALGORAND_CAPABILITY);
  });

  it("rejects when Algorand capability is missing", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [7]); // ethereum only
    await expect(p).rejects.toBeInstanceOf(CapabilityMissingError);
  });

  it("maps ActionCancelled failure to UserRejectedError", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [ALGORAND_CAPABILITY]);
    const client = await p;

    const getAddr = client.getAddress({ path: [1] });
    // consume request
    await readMessage(pair.device);
    const f = new Writer();
    f.writeUint32(1, 4);
    f.writeString(2, "User cancelled");
    await writeMessage(pair.device, {
      type: MessageType.Failure,
      payload: f.bytes(),
    });
    await expect(getAddr).rejects.toBeInstanceOf(UserRejectedError);
  });

  it("transparently acks ButtonRequest", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [ALGORAND_CAPABILITY]);
    const client = await p;

    const addrPromise = client.getAddress({ path: [1], showDisplay: true });
    await readMessage(pair.device); // AlgorandGetAddress
    // send ButtonRequest
    const br = new Writer();
    br.writeUint32(1, 10); // ButtonRequest_Address
    await writeMessage(pair.device, {
      type: MessageType.ButtonRequest,
      payload: br.bytes(),
    });
    // expect ButtonAck
    const ack = await readMessage(pair.device);
    expect(ack.type).toBe(MessageType.ButtonAck);
    // reply with address
    const ar = new Writer();
    ar.writeString(1, "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    await writeMessage(pair.device, {
      type: MessageType.AlgorandAddress,
      payload: ar.bytes(),
    });
    const addr = await addrPromise;
    expect(addr.length).toBe(58);
  });

  it("drives the TxRequest/TxAck loop for a group", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [ALGORAND_CAPABILITY]);
    const client = await p;

    const groupPromise = client.signTxGroup({
      path: [1],
      txs: [
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([3]),
      ],
    });

    // 1. SignTx
    const signTx = await readMessage(pair.device);
    expect(signTx.type).toBe(MessageType.AlgorandSignTx);
    // reply: TxRequest(index=1)
    const r1 = new Writer();
    r1.writeUint32(1, 1);
    await writeMessage(pair.device, {
      type: MessageType.AlgorandTxRequest,
      payload: r1.bytes(),
    });

    // 2. TxAck tx[1]
    const ack1 = await readMessage(pair.device);
    expect(ack1.type).toBe(MessageType.AlgorandTxAck);
    const r2 = new Writer();
    r2.writeUint32(1, 2);
    await writeMessage(pair.device, {
      type: MessageType.AlgorandTxRequest,
      payload: r2.bytes(),
    });

    // 3. TxAck tx[2]
    const ack2 = await readMessage(pair.device);
    expect(ack2.type).toBe(MessageType.AlgorandTxAck);
    // Final AlgorandTxSignature with 3 group sigs (middle empty)
    const w = new Writer();
    w.writeBytes(1, new Uint8Array(64));
    w.writeBytes(2, new Uint8Array(64).fill(0xaa));
    w.writeBytes(2, new Uint8Array(0));
    w.writeBytes(2, new Uint8Array(64).fill(0xbb));
    await writeMessage(pair.device, {
      type: MessageType.AlgorandTxSignature,
      payload: w.bytes(),
    });

    const sigs = await groupPromise;
    expect(sigs.length).toBe(3);
    expect(sigs[1]!.length).toBe(0);
    expect(sigs[0]![0]).toBe(0xaa);
    expect(sigs[2]![0]).toBe(0xbb);
  });

  it("rejects invalid group sizes", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [ALGORAND_CAPABILITY]);
    const client = await p;

    await expect(
      client.signTxGroup({ path: [1], txs: [] }),
    ).rejects.toThrow(/1..16/);
    const tooMany = new Array(17).fill(new Uint8Array([1]));
    await expect(
      client.signTxGroup({ path: [1], txs: tooMany }),
    ).rejects.toThrow(/1..16/);
  });

  it("rejects bootloader mode at connect", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [], true);
    await expect(p).rejects.toThrow(/bootloader/);
  });

  it("serializes concurrent requests on the same client", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [ALGORAND_CAPABILITY]);
    const client = await p;

    const a = client.getAddress({ path: [1] });
    const b = client.getAddress({ path: [2] });

    // First request must arrive and complete fully before the second is read.
    const req1 = await readMessage(pair.device);
    expect(req1.type).toBe(MessageType.AlgorandGetAddress);

    // Verify the second request hasn't been written yet.
    let secondArrived = false;
    const req2Promise = readMessage(pair.device).then((m) => {
      secondArrived = true;
      return m;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(secondArrived).toBe(false);

    const r1 = new Writer();
    r1.writeString(1, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    await writeMessage(pair.device, {
      type: MessageType.AlgorandAddress,
      payload: r1.bytes(),
    });
    await a;

    const req2 = await req2Promise;
    expect(req2.type).toBe(MessageType.AlgorandGetAddress);
    const r2 = new Writer();
    r2.writeString(1, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
    await writeMessage(pair.device, {
      type: MessageType.AlgorandAddress,
      payload: r2.bytes(),
    });
    await b;
  });

  it("maps an unmapped Failure code to a generic TrezorAlgorandError", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [ALGORAND_CAPABILITY]);
    const client = await p;

    const req = client.getAddress({ path: [1] });
    await readMessage(pair.device);
    const f = new Writer();
    f.writeUint32(1, 99); // FirmwareError
    f.writeString(2, "boom");
    await writeMessage(pair.device, {
      type: MessageType.Failure,
      payload: f.bytes(),
    });
    const err = await req.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TrezorAlgorandError);
    expect((err as TrezorAlgorandError).code).toBe("FAILURE_99");
  });

  it("throws a ProtocolError on unexpected response type", async () => {
    const pair = new MockTransportPair();
    const p = TrezorAlgorandClient.connect(pair.host);
    await respondInitialize(pair, [ALGORAND_CAPABILITY]);
    const client = await p;
    const pk = client.getPublicKey({ path: [1] });
    await readMessage(pair.device);
    // reply with an address instead of a public key
    const w = new Writer();
    w.writeString(1, "nope");
    await writeMessage(pair.device, {
      type: MessageType.AlgorandAddress,
      payload: w.bytes(),
    });
    await expect(pk).rejects.toBeInstanceOf(ProtocolError);
  });
});

