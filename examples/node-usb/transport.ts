// Reference Node transport for trezor-algorand-js, built on the `usb`
// (libusb) package. Copy this file into your CLI project — it is not
// published as part of the trezor-algorand-js package and is not
// dependency-tracked by it.
//
// Required peer dependencies in your project:
//   npm install trezor-algorand-js usb
//
// Behaviour mirrors src/webusb/transport.ts: claim interface 0, exchange
// 64-byte chunks on endpoint 1, surface read timeouts as transport errors.

import { findByIds, type Device, type InEndpoint, type OutEndpoint } from "usb";
import type { TrezorTransport } from "trezor-algorand-js/types";

const TREZOR_CORE_VENDOR_ID = 0x1209;
const TREZOR_CORE_PRODUCT_ID = 0x53c1;
const INTERFACE = 0;
const CHUNK_SIZE = 64;
const DEFAULT_READ_TIMEOUT_MS = 30_000;

export class NodeUsbTransport implements TrezorTransport {
  readonly chunkSize = CHUNK_SIZE;
  private readonly device: Device;
  private inEndpoint?: InEndpoint;
  private outEndpoint?: OutEndpoint;
  private detachedKernelDriver = false;

  constructor(device: Device) {
    this.device = device;
  }

  static find(): NodeUsbTransport {
    const device = findByIds(TREZOR_CORE_VENDOR_ID, TREZOR_CORE_PRODUCT_ID);
    if (!device) throw new Error("no Trezor Core device attached");
    return new NodeUsbTransport(device);
  }

  async open(): Promise<void> {
    this.device.open();
    const iface = this.device.interface(INTERFACE);
    if (process.platform !== "win32" && iface.isKernelDriverActive()) {
      iface.detachKernelDriver();
      this.detachedKernelDriver = true;
    }
    iface.claim();
    for (const ep of iface.endpoints) {
      if (ep.direction === "in") this.inEndpoint = ep as InEndpoint;
      else this.outEndpoint = ep as OutEndpoint;
    }
    if (!this.inEndpoint || !this.outEndpoint) {
      throw new Error("expected one IN and one OUT endpoint on interface 0");
    }
  }

  async close(): Promise<void> {
    const iface = this.device.interface(INTERFACE);
    await new Promise<void>((resolve) => {
      iface.release(true, () => resolve());
    });
    if (this.detachedKernelDriver) {
      try {
        iface.attachKernelDriver();
      } catch {
        // best-effort — the kernel will rebind on disconnect anyway
      }
    }
    this.device.close();
  }

  write(chunk: Uint8Array): Promise<void> {
    if (chunk.length !== CHUNK_SIZE) {
      throw new Error(`write chunk must be ${CHUNK_SIZE} bytes`);
    }
    return new Promise((resolve, reject) => {
      this.outEndpoint!.transfer(Buffer.from(chunk), (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  read(timeoutMs: number = DEFAULT_READ_TIMEOUT_MS): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this.inEndpoint!.timeout = timeoutMs;
      this.inEndpoint!.transfer(CHUNK_SIZE, (err, data) => {
        if (err) return reject(err);
        if (!data) return reject(new Error("transferIn returned no data"));
        resolve(new Uint8Array(data));
      });
    });
  }
}
