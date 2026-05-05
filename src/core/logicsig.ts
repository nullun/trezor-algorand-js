// Host-side reconstruction of the FALCON-DET1024 LogicSig program the
// firmware composes during AlgorandGetFalconAddress. Mirrors
// core/src/apps/algorand/logicsig.py in trezor-firmware (the fork).
//
// The on-chain template is:
//
//   #pragma version 12
//   bytecblock <COUNTER>
//   txn TxID
//   arg 0
//   pushbytes <FALCON_PUBKEY>
//   falcon_verify
//
// `<COUNTER>` is a one-byte salt iterated by the device until the
// resulting LogicSig address is *not* a valid Ed25519 point — guaranteeing
// no classical private key can spend from the account. The device has
// already done that work; the host just splices `(publicKey, counter)`
// back into the template to obtain the program for tx submission.

const FALCON_PUBKEY_SIZE = 1793;

// Pre-compiled TEAL v12 bytecode header:
//   0c              -- pragma version 12
//   26 01 01        -- bytecblock with 1 constant of length 1
//   00              -- COUNTER placeholder at offset 4
//   31 17           -- txn TxID
//   2d              -- arg_0
//   80              -- pushbytes
//   81 0e           -- varuint 1793 (LEB128 for the FALCON pubkey length)
const TEAL_V12_PREFIX = new Uint8Array([
  0x0c,
  0x26, 0x01, 0x01,
  0x00,
  0x31, 0x17,
  0x2d,
  0x80,
  0x81, 0x0e,
]);
const TEAL_V12_SUFFIX = new Uint8Array([0x85]); // falcon_verify
const COUNTER_OFFSET = 4;

const TEMPLATES: Record<number, { prefix: Uint8Array; suffix: Uint8Array }> = {
  12: { prefix: TEAL_V12_PREFIX, suffix: TEAL_V12_SUFFIX },
};

export const DEFAULT_TEAL_VERSION = 12;

export interface FalconLogicSigInputs {
  publicKey: Uint8Array;
  counter: number;
  tealVersion?: number;
}

export function compileFalconLogicSig({
  publicKey,
  counter,
  tealVersion = DEFAULT_TEAL_VERSION,
}: FalconLogicSigInputs): Uint8Array {
  const tpl = TEMPLATES[tealVersion];
  if (!tpl) {
    throw new Error(`unsupported TEAL version: ${tealVersion}`);
  }
  if (publicKey.length !== FALCON_PUBKEY_SIZE) {
    throw new Error(
      `Falcon public key must be ${FALCON_PUBKEY_SIZE} bytes (got ${publicKey.length})`,
    );
  }
  if (!Number.isInteger(counter) || counter < 0 || counter > 255) {
    throw new Error(`counter must be a single byte 0..255 (got ${counter})`);
  }
  const out = new Uint8Array(tpl.prefix.length + publicKey.length + tpl.suffix.length);
  out.set(tpl.prefix, 0);
  out[COUNTER_OFFSET] = counter;
  out.set(publicKey, tpl.prefix.length);
  out.set(tpl.suffix, tpl.prefix.length + publicKey.length);
  return out;
}

// Renders the LogicSig program as the TEAL source it represents, with the
// FALCON public key and counter spliced in as hex literals. Useful for
// the verbose / human-readable view in CLIs and demo UIs.
export function formatFalconLogicSigTeal({
  publicKey,
  counter,
  tealVersion = DEFAULT_TEAL_VERSION,
}: FalconLogicSigInputs): string {
  if (!(tealVersion in TEMPLATES)) {
    throw new Error(`unsupported TEAL version: ${tealVersion}`);
  }
  if (publicKey.length !== FALCON_PUBKEY_SIZE) {
    throw new Error(
      `Falcon public key must be ${FALCON_PUBKEY_SIZE} bytes (got ${publicKey.length})`,
    );
  }
  if (!Number.isInteger(counter) || counter < 0 || counter > 255) {
    throw new Error(`counter must be a single byte 0..255 (got ${counter})`);
  }
  return [
    `#pragma version ${tealVersion}`,
    `bytecblock 0x${toHex(new Uint8Array([counter]))}`,
    `txn TxID`,
    `arg 0`,
    `pushbytes 0x${toHex(publicKey)}`,
    `falcon_verify`,
  ].join("\n");
}

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
