# trezor-algorand-js

Browser-first host library for signing Algorand transactions with a Trezor
device running the [Algorand-capable firmware fork][fork].

This package intentionally stays thin: it owns the Trezor wire protocol,
protobuf codecs for the Algorand message set, a WebUSB transport, and a
small `TrezorAlgorandClient` surface. It does **not** depend on `algosdk`
and operates on raw canonical MsgPack transaction bytes so it is reusable
by wallets, CLIs, and tests.

## Status

v0 — Ed25519 signing only. Known limitations:

- Trezor One is not yet supported (WebHID transport needed).
- Rekeyed accounts are not supported; the firmware requires the
  transaction sender to equal the derived signer. See `docs/lute-integration.md`
  in the companion Lute integration notes.
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

## Layout

- `src/core` — protocol core: protobuf codec, framing, session, client.
- `src/webusb` — browser WebUSB transport.
- `src/types` — exported request/response types, Algorand constants.

## Tests

```
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # emit dist/
```

[fork]: https://github.com/nullun/trezor-firmware
