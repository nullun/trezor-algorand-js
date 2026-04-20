import { Reader, Writer, readRepeatedUint32Into, WireType } from "./protobuf.js";

// Message type IDs — must match common/protob/messages.proto in the fork.
export const MessageType = {
  Initialize: 0,
  Success: 2,
  Failure: 3,
  Features: 17,
  PinMatrixRequest: 18,
  PinMatrixAck: 19,
  ButtonRequest: 26,
  ButtonAck: 27,
  PassphraseRequest: 41,
  PassphraseAck: 42,
  GetFeatures: 55,

  AlgorandGetPublicKey: 606,
  AlgorandPublicKey: 607,
  AlgorandGetAddress: 608,
  AlgorandAddress: 609,
  AlgorandSignTx: 610,
  AlgorandTxRequest: 611,
  AlgorandTxAck: 612,
  AlgorandTxSignature: 613,
  AlgorandSignData: 614,
  AlgorandDataSignature: 615,
  AlgorandGetFalconAddress: 616,
  AlgorandFalconAddress: 617,
} as const;

// ---------- Initialize / GetFeatures ----------

export function encodeInitialize(sessionId?: Uint8Array): Uint8Array {
  const w = new Writer();
  if (sessionId && sessionId.length > 0) w.writeBytes(1, sessionId);
  return w.bytes();
}

export function encodeGetFeatures(): Uint8Array {
  return new Uint8Array(0);
}

export interface Features {
  vendor?: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  bootloaderMode: boolean;
  deviceId?: string;
  label?: string;
  initialized?: boolean;
  model?: string;
  internalModel?: string;
  capabilities: number[];
}

export function decodeFeatures(buf: Uint8Array): Features {
  const r = new Reader(buf);
  const out: Features = {
    majorVersion: 0,
    minorVersion: 0,
    patchVersion: 0,
    bootloaderMode: false,
    capabilities: [],
  };
  while (!r.done) {
    const { field, wireType } = r.readTag();
    switch (field) {
      case 1: out.vendor = r.readString(); break;
      case 2: out.majorVersion = r.readUint32(); break;
      case 3: out.minorVersion = r.readUint32(); break;
      case 4: out.patchVersion = r.readUint32(); break;
      case 5: out.bootloaderMode = r.readBool(); break;
      case 6: out.deviceId = r.readString(); break;
      case 10: out.label = r.readString(); break;
      case 12: out.initialized = r.readBool(); break;
      case 21: out.model = r.readString(); break;
      case 30: readRepeatedUint32Into(r, wireType, out.capabilities); break;
      case 44: out.internalModel = r.readString(); break;
      default: r.skip(wireType);
    }
  }
  return out;
}

// ---------- Failure / ButtonRequest / ButtonAck ----------

export interface Failure {
  code?: number;
  message?: string;
}

export function decodeFailure(buf: Uint8Array): Failure {
  const r = new Reader(buf);
  const out: Failure = {};
  while (!r.done) {
    const { field, wireType } = r.readTag();
    switch (field) {
      case 1: out.code = r.readUint32(); break;
      case 2: out.message = r.readString(); break;
      default: r.skip(wireType);
    }
  }
  return out;
}

export function encodeButtonAck(): Uint8Array {
  return new Uint8Array(0);
}

export function encodePassphraseAck(passphrase = ""): Uint8Array {
  const w = new Writer();
  if (passphrase.length > 0) w.writeString(1, passphrase);
  return w.bytes();
}

// ---------- Algorand ----------

function writePath(w: Writer, path: number[]): void {
  // proto2 non-packed: each element gets its own tag.
  for (const n of path) w.writeUint32(1, n);
}

export function encodeAlgorandGetPublicKey(
  path: number[],
  showDisplay: boolean,
): Uint8Array {
  const w = new Writer();
  writePath(w, path);
  if (showDisplay) w.writeBool(2, true);
  return w.bytes();
}

export function decodeAlgorandPublicKey(buf: Uint8Array): Uint8Array {
  const r = new Reader(buf);
  let publicKey: Uint8Array = new Uint8Array(0);
  while (!r.done) {
    const { field, wireType } = r.readTag();
    if (field === 1 && wireType === WireType.LEN) publicKey = r.readBytes();
    else r.skip(wireType);
  }
  return publicKey;
}

export function encodeAlgorandGetAddress(
  path: number[],
  showDisplay: boolean,
  chunkify: boolean,
): Uint8Array {
  const w = new Writer();
  writePath(w, path);
  if (showDisplay) w.writeBool(2, true);
  if (chunkify) w.writeBool(3, true);
  return w.bytes();
}

export function decodeAlgorandAddress(buf: Uint8Array): string {
  const r = new Reader(buf);
  let address = "";
  while (!r.done) {
    const { field, wireType } = r.readTag();
    if (field === 1 && wireType === WireType.LEN) address = r.readString();
    else r.skip(wireType);
  }
  return address;
}

export function encodeAlgorandSignTx(
  path: number[],
  serializedTx: Uint8Array,
  groupSize: number,
  groupIndex: number,
  signatureType: number,
): Uint8Array {
  const w = new Writer();
  writePath(w, path);
  w.writeBytes(2, serializedTx);
  if (groupSize !== 1) w.writeUint32(3, groupSize);
  if (groupIndex !== 0) w.writeUint32(4, groupIndex);
  if (signatureType !== 0) w.writeUint32(5, signatureType);
  return w.bytes();
}

export function encodeAlgorandTxAck(serializedTx: Uint8Array): Uint8Array {
  const w = new Writer();
  w.writeBytes(1, serializedTx);
  return w.bytes();
}

export interface AlgorandTxRequest {
  groupIndex?: number;
}

export function decodeAlgorandTxRequest(buf: Uint8Array): AlgorandTxRequest {
  const r = new Reader(buf);
  const out: AlgorandTxRequest = {};
  while (!r.done) {
    const { field, wireType } = r.readTag();
    if (field === 1) out.groupIndex = r.readUint32();
    else r.skip(wireType);
  }
  return out;
}

export interface AlgorandTxSignatureResponse {
  signature: Uint8Array;
  groupSignatures: Uint8Array[];
  signatureType?: number;
}

export function decodeAlgorandTxSignature(
  buf: Uint8Array,
): AlgorandTxSignatureResponse {
  const r = new Reader(buf);
  const out: AlgorandTxSignatureResponse = {
    signature: new Uint8Array(0),
    groupSignatures: [],
  };
  while (!r.done) {
    const { field, wireType } = r.readTag();
    switch (field) {
      case 1: out.signature = r.readBytes(); break;
      case 2: out.groupSignatures.push(r.readBytes()); break;
      case 3: out.signatureType = r.readUint32(); break;
      default: r.skip(wireType);
    }
  }
  return out;
}

export function encodeAlgorandSignData(
  path: number[],
  data: Uint8Array,
  domain: string,
  authData: Uint8Array,
  requestId?: string,
): Uint8Array {
  const w = new Writer();
  writePath(w, path);
  w.writeBytes(2, data);
  w.writeString(3, domain);
  w.writeBytes(4, authData);
  if (requestId !== undefined) w.writeString(5, requestId);
  return w.bytes();
}

export function decodeAlgorandDataSignature(buf: Uint8Array): Uint8Array {
  const r = new Reader(buf);
  let signature: Uint8Array = new Uint8Array(0);
  while (!r.done) {
    const { field, wireType } = r.readTag();
    if (field === 1 && wireType === WireType.LEN) signature = r.readBytes();
    else r.skip(wireType);
  }
  return signature;
}
