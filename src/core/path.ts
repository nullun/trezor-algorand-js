import { InvalidPathError } from "./errors.js";
import { ALGORAND_COIN_TYPE } from "../types/index.js";

const HARDENED = 0x80000000;

// Parse a BIP-32 path string like `m/44'/283'/0'/0/0` into an array of
// number[] using the hardened bit convention Trezor expects.
export function parsePath(path: string): number[] {
  const trimmed = path.trim();
  const parts = trimmed.split("/");
  if (parts[0] !== "m") throw new InvalidPathError(`path must start with m: ${path}`);
  const out: number[] = [];
  for (const raw of parts.slice(1)) {
    if (raw.length === 0) throw new InvalidPathError(`empty segment in ${path}`);
    const hardened = raw.endsWith("'") || raw.endsWith("h");
    const numStr = hardened ? raw.slice(0, -1) : raw;
    const n = Number(numStr);
    if (!Number.isInteger(n) || n < 0 || n >= HARDENED) {
      throw new InvalidPathError(`invalid segment '${raw}' in ${path}`);
    }
    out.push(hardened ? (n | HARDENED) >>> 0 : n);
  }
  return out;
}

// Default Algorand derivation for a Trezor slot, matching the firmware
// pattern `m/44'/283'/account'/change'/address_index'`.
export function defaultAlgorandPath(account: number): number[] {
  if (!Number.isInteger(account) || account < 0) {
    throw new InvalidPathError(`account must be a non-negative integer: ${account}`);
  }
  return [
    (44 | HARDENED) >>> 0,
    (ALGORAND_COIN_TYPE | HARDENED) >>> 0,
    (account | HARDENED) >>> 0,
    (0 | HARDENED) >>> 0,
    (0 | HARDENED) >>> 0,
  ];
}
