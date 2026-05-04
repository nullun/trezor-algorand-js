// Trezor v1 wire framing.
//
// Each USB chunk is exactly `chunkSize` bytes (64 for WebUSB). The first
// chunk of a message is `?` + `##` + big-endian header (uint16 message type,
// uint32 payload length) + start of payload. Subsequent chunks are `?` +
// payload continuation. Chunks are zero-padded to `chunkSize`.
//
// On read, `?` is the USB report prefix and `##` marks the first chunk.
// See trezor-firmware/python/src/trezorlib/protocol_v1.py.

import { ProtocolError, TransportError } from "./errors.js";
import type { TrezorTransport } from "../types/index.js";

export interface WireMessage {
  type: number;
  payload: Uint8Array;
}

const REPORT_MAGIC = 0x3f; // '?'
const HEADER_MAGIC = 0x23; // '#'
const HEADER_LEN = 6; // uint16 + uint32

export async function writeMessage(
  transport: TrezorTransport,
  msg: WireMessage,
): Promise<void> {
  const chunkSize = transport.chunkSize;
  const header = new Uint8Array(HEADER_LEN + 2);
  header[0] = HEADER_MAGIC;
  header[1] = HEADER_MAGIC;
  // big-endian uint16 type
  header[2] = (msg.type >>> 8) & 0xff;
  header[3] = msg.type & 0xff;
  // big-endian uint32 length
  const len = msg.payload.length;
  header[4] = (len >>> 24) & 0xff;
  header[5] = (len >>> 16) & 0xff;
  header[6] = (len >>> 8) & 0xff;
  header[7] = len & 0xff;

  const total = new Uint8Array(header.length + msg.payload.length);
  total.set(header, 0);
  total.set(msg.payload, header.length);

  const bodySize = chunkSize - 1;
  let offset = 0;
  while (offset < total.length || offset === 0) {
    const chunk = new Uint8Array(chunkSize);
    chunk[0] = REPORT_MAGIC;
    const slice = total.subarray(offset, offset + bodySize);
    chunk.set(slice, 1);
    await transport.write(chunk);
    offset += bodySize;
    if (offset >= total.length) break;
  }
}

export async function readMessage(
  transport: TrezorTransport,
  timeoutMs?: number,
): Promise<WireMessage> {
  // first chunk: expect `?##` + 6-byte header
  const first = await readChunk(transport, timeoutMs);
  if (first.length < 1 + 2 + HEADER_LEN) {
    throw new ProtocolError("short initial chunk");
  }
  if (first[0] !== REPORT_MAGIC) {
    throw new ProtocolError(
      `missing report magic 0x3f, got 0x${first[0]!.toString(16)}`,
    );
  }
  if (first[1] !== HEADER_MAGIC || first[2] !== HEADER_MAGIC) {
    throw new ProtocolError("missing '##' header magic");
  }
  const msgType = ((first[3]! << 8) | first[4]!) >>> 0;
  const dataLen =
    ((first[5]! << 24) | (first[6]! << 16) | (first[7]! << 8) | first[8]!) >>>
    0;
  const out = new Uint8Array(dataLen);
  let copied = Math.min(dataLen, first.length - 9);
  out.set(first.subarray(9, 9 + copied), 0);

  while (copied < dataLen) {
    const chunk = await readChunk(transport, timeoutMs);
    if (chunk.length < 1) throw new ProtocolError("empty chunk");
    if (chunk[0] !== REPORT_MAGIC) {
      throw new ProtocolError("missing report magic on continuation chunk");
    }
    const body = chunk.subarray(1);
    const take = Math.min(body.length, dataLen - copied);
    out.set(body.subarray(0, take), copied);
    copied += take;
  }

  return { type: msgType, payload: out };
}

async function readChunk(
  transport: TrezorTransport,
  timeoutMs?: number,
): Promise<Uint8Array> {
  const chunk = await transport.read(timeoutMs);
  if (chunk.length !== transport.chunkSize) {
    throw new TransportError(
      `expected ${transport.chunkSize}-byte chunk, got ${chunk.length}`,
    );
  }
  return chunk;
}
