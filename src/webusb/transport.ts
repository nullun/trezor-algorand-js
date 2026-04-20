import { BootloaderModeError, DeviceNotFoundError, TransportError } from "../core/errors.js";
import type { TrezorTransport } from "../types/index.js";
import { USB_IDS } from "../types/index.js";

const WEBUSB_INTERFACE = 0;
const WEBUSB_ENDPOINT = 1;
const CHUNK_SIZE = 64;
const DEFAULT_READ_TIMEOUT_MS = 30_000;

export interface WebUsbTransportOptions {
  device?: USBDevice;
  requestIfMissing?: boolean;
}

// Filters passed to `navigator.usb.requestDevice` for a Trezor Core device.
// Trezor One is HID-only on the browser side and is intentionally excluded
// here — adding it would need a second transport path.
export const WEBUSB_FILTERS: USBDeviceFilter[] = [
  { vendorId: USB_IDS.TREZOR_CORE.vendorId, productId: USB_IDS.TREZOR_CORE.productId },
  {
    vendorId: USB_IDS.TREZOR_CORE_BOOTLOADER.vendorId,
    productId: USB_IDS.TREZOR_CORE_BOOTLOADER.productId,
  },
];

export class WebUsbTransport implements TrezorTransport {
  readonly chunkSize = CHUNK_SIZE;
  private device: USBDevice;
  private opened = false;

  constructor(device: USBDevice) {
    this.device = device;
  }

  static async request(): Promise<WebUsbTransport> {
    if (typeof navigator === "undefined" || !navigator.usb) {
      throw new TransportError("WebUSB is not available in this environment");
    }
    let device: USBDevice;
    try {
      device = await navigator.usb.requestDevice({ filters: WEBUSB_FILTERS });
    } catch (err) {
      throw new DeviceNotFoundError((err as Error).message);
    }
    return new WebUsbTransport(device);
  }

  static async getFirst(): Promise<WebUsbTransport | null> {
    if (typeof navigator === "undefined" || !navigator.usb) return null;
    const devices = await navigator.usb.getDevices();
    const match = devices.find(
      (d) =>
        (d.vendorId === USB_IDS.TREZOR_CORE.vendorId &&
          d.productId === USB_IDS.TREZOR_CORE.productId) ||
        (d.vendorId === USB_IDS.TREZOR_CORE_BOOTLOADER.vendorId &&
          d.productId === USB_IDS.TREZOR_CORE_BOOTLOADER.productId),
    );
    return match ? new WebUsbTransport(match) : null;
  }

  async open(): Promise<void> {
    if (
      this.device.vendorId === USB_IDS.TREZOR_CORE_BOOTLOADER.vendorId &&
      this.device.productId === USB_IDS.TREZOR_CORE_BOOTLOADER.productId
    ) {
      throw new BootloaderModeError();
    }
    try {
      if (!this.device.opened) await this.device.open();
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }
      await this.device.claimInterface(WEBUSB_INTERFACE);
      this.opened = true;
    } catch (err) {
      throw new TransportError(`failed to open WebUSB device: ${(err as Error).message}`);
    }
  }

  async close(): Promise<void> {
    if (!this.opened) return;
    try {
      await this.device.releaseInterface(WEBUSB_INTERFACE);
    } catch {
      // ignore — the device may already be gone
    }
    try {
      await this.device.close();
    } catch {
      // ignore
    }
    this.opened = false;
  }

  async write(chunk: Uint8Array): Promise<void> {
    if (chunk.length !== CHUNK_SIZE) {
      throw new TransportError(`write chunk must be ${CHUNK_SIZE} bytes`);
    }
    const result = await this.device.transferOut(WEBUSB_ENDPOINT, chunk);
    if (result.status !== "ok") {
      throw new TransportError(`WebUSB transferOut failed: ${result.status}`);
    }
  }

  async read(timeoutMs: number = DEFAULT_READ_TIMEOUT_MS): Promise<Uint8Array> {
    const transfer = this.device.transferIn(WEBUSB_ENDPOINT, CHUNK_SIZE);
    const result = await withTimeout(transfer, timeoutMs);
    if (result.status !== "ok") {
      throw new TransportError(`WebUSB transferIn failed: ${result.status}`);
    }
    if (!result.data) throw new TransportError("WebUSB transferIn returned no data");
    return new Uint8Array(
      result.data.buffer,
      result.data.byteOffset,
      result.data.byteLength,
    );
  }
}

function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TransportError(`read timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
