# Node USB transport (example)

A reference `TrezorTransport` for Node, built on [`usb`][usb] (libusb).
Not published as part of `trezor-algorand-js` — copy the file into your
CLI project.

## Setup

```
npm install trezor-algorand-js usb
```

`usb` is a native module. Prebuilt binaries are published for common
Node versions and platforms; on unsupported targets, libusb headers and
a working C++ toolchain are required.

On Linux, attaching to the device without root usually requires a udev
rule:

```
# /etc/udev/rules.d/51-trezor.rules
SUBSYSTEM=="usb", ATTR{idVendor}=="1209", ATTR{idProduct}=="53c1", MODE="0660", GROUP="plugdev"
```

## Usage

```ts
import { TrezorAlgorandClient } from "trezor-algorand-js/core";
import { defaultAlgorandPath } from "trezor-algorand-js/core";
import { NodeUsbTransport } from "./transport.js";

const transport = NodeUsbTransport.find();
const client = await TrezorAlgorandClient.connect(transport);

const path = defaultAlgorandPath(0);
const address = await client.getAddress({ path, showDisplay: true });
console.log(address);

await client.close();
```

## Notes

- Only Trezor Core (vendor `0x1209`, product `0x53c1`) is matched. Trezor
  One uses HID and is not handled here — the upstream package does not
  support it yet either.
- Bootloader-mode devices (product `0x53c0`) are intentionally not matched;
  the core client refuses to drive them anyway.
- The transport detaches any active kernel driver on Linux/macOS at open,
  and best-effort re-attaches it at close.

[usb]: https://www.npmjs.com/package/usb
