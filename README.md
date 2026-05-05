# trezor-algorand-js

Host library for signing Algorand transactions with a Trezor device running
the [Algorand-capable firmware fork][fork].

This package intentionally stays thin: it owns the Trezor wire protocol,
protobuf codecs for the Algorand message set, a WebUSB transport for the
browser, and a small `TrezorAlgorandClient` surface. It does **not** depend
on `algosdk` and operates on raw canonical MsgPack transaction bytes so it
is reusable by wallets, CLIs, and tests.

The package itself has no runtime dependencies. The bundled WebUSB
transport is the reference implementation; for Node or other environments,
implement the `TrezorTransport` interface against the USB stack of your
choice (see [Transports](#transports)).

## Status

v0 — Ed25519 signing only. Known limitations:

- Trezor One is not yet supported (WebHID transport needed).
- Rekeyed accounts are not supported; the firmware requires the
  transaction sender to equal the derived signer.
- Falcon post-quantum signing is defined in the protobuf schema but
  not yet exposed through the client.

## Usage

```ts
import {
  TrezorAlgorandClient,
  WebUsbTransport,
  defaultAlgorandPath,
} from "trezor-algorand-js";

const transport = await WebUsbTransport.request();
const client = await TrezorAlgorandClient.connect(transport);

const path = defaultAlgorandPath(0);
const address = await client.getAddress({ path });

const signature = await client.signTx({ path, tx: canonicalMsgpackBytes });

const groupSigs = await client.signTxGroup({ path, txs: [tx0, tx1] });
// signatures for txs whose sender != derived signer are returned as empty bytes.

await client.close();
```

For Node, import the protocol core directly to avoid pulling in the
WebUSB-specific code:

```ts
import { TrezorAlgorandClient } from "trezor-algorand-js/core";
import type { TrezorTransport } from "trezor-algorand-js/types";
```

## Transports

`TrezorAlgorandClient.connect()` accepts any object that satisfies the
`TrezorTransport` contract:

```ts
interface TrezorTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(chunk: Uint8Array): Promise<void>;     // exactly chunkSize bytes
  read(timeoutMs?: number): Promise<Uint8Array>; // exactly chunkSize bytes
  readonly chunkSize: number;                  // 64 for Trezor Core
}
```

`write` and `read` exchange single 64-byte HID-style report chunks; framing,
session locking, and protobuf encoding are handled by the core. The bundled
`WebUsbTransport` (`src/webusb/transport.ts`, ~150 lines) is the reference
implementation — copy its shape when targeting another USB stack.

A minimal Node transport built on the [`usb`][usb] package is included in
[`examples/node-usb/`](examples/node-usb/) for CLI authors to copy. It is
not shipped as part of the package and adds no dependencies to consumers
who don't need it.

## Examples

- [`examples/browser/`](examples/browser/) — single-file HTML demo using
  an import map against the local `dist/` build; no bundler, no remote
  dependencies. Connects over WebUSB and derives an Algorand address.
- [`examples/node-usb/`](examples/node-usb/) — reference Node transport
  built on `usb` (libusb), to copy into a CLI project.

## Layout

- `src/core` — protocol core: protobuf codec, framing, session, client.
- `src/webusb` — browser WebUSB transport.
- `src/types` — exported request/response types, Algorand constants.
- `examples/` — runnable examples (not published).

## Tests

```
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # emit dist/
```

[fork]: https://github.com/nullun/trezor-firmware
[usb]: https://www.npmjs.com/package/usb
