export const ALGORAND_COIN_TYPE = 283;
export const ALGORAND_CAPABILITY = 25;

export const USB_IDS = {
  TREZOR_CORE: { vendorId: 0x1209, productId: 0x53c1 },
  TREZOR_CORE_BOOTLOADER: { vendorId: 0x1209, productId: 0x53c0 },
  TREZOR_ONE: { vendorId: 0x534c, productId: 0x0001 },
} as const;

export interface TrezorTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(chunk: Uint8Array): Promise<void>;
  read(timeoutMs?: number): Promise<Uint8Array>;
  readonly chunkSize: number;
}

// How the host should respond to a PassphraseRequest from the device.
//
// `{ onDevice: true }` (the default) tells the device to collect the
// passphrase via its own UI — required for "passphrase always on device"
// configurations on Trezor T / Safe. Use `{ passphrase }` only when the
// host has prompted the user and is forwarding the secret on their behalf.
export type PassphraseSource =
  | { onDevice: true }
  | { passphrase: string };

export interface ConnectOptions {
  transport?: "webusb";
  requireAlgorandCapability?: boolean;
  device?: USBDevice;
  passphraseSource?: PassphraseSource;
}

export interface TrezorFeatures {
  vendor?: string;
  model?: string;
  internalModel?: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  capabilities: number[];
  bootloaderMode: boolean;
  deviceId?: string;
  label?: string;
  initialized?: boolean;
}

export interface GetAddressParams {
  path: number[];
  showDisplay?: boolean;
  chunkify?: boolean;
}

export interface SignTxParams {
  path: number[];
  tx: Uint8Array;
}

export interface SignTxGroupParams {
  path: number[];
  txs: Uint8Array[];
}

export interface SignDataParams {
  path: number[];
  data: Uint8Array;
  domain: string;
  authData: Uint8Array;
  requestId?: string;
}

export const SignatureType = {
  ED25519: 0,
  FALCON_DET1024: 1,
} as const;

export type SignatureType = (typeof SignatureType)[keyof typeof SignatureType];

// Returned by `TrezorAlgorandClient.getFalconAddress`. The device composes
// the LogicSig contract account itself; `publicKey` and `counter` are the
// inputs the host needs to reconstruct the program for tx submission.
export interface FalconAddressResult {
  address: string;
  publicKey: Uint8Array;
  counter?: number;
  tealVersion?: number;
}
