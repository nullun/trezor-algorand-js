import type { TrezorTransport } from "../src/types/index.js";
import { readMessage, writeMessage } from "../src/core/framing.js";

// Mock transport that pairs two halves of a conversation. The "host side"
// exposes TrezorTransport; the "device side" lets tests script replies.
export class MockTransportPair {
  readonly chunkSize = 64;
  private hostToDevice: Uint8Array[] = [];
  private deviceToHost: Uint8Array[] = [];
  private hostWaiters: ((v: Uint8Array) => void)[] = [];
  private deviceWaiters: ((v: Uint8Array) => void)[] = [];

  host: TrezorTransport = {
    chunkSize: this.chunkSize,
    open: async () => {},
    close: async () => {},
    write: async (chunk) => {
      const next = this.deviceWaiters.shift();
      if (next) next(chunk);
      else this.hostToDevice.push(chunk);
    },
    read: async () => {
      const ready = this.deviceToHost.shift();
      if (ready) return ready;
      return new Promise<Uint8Array>((resolve) => this.hostWaiters.push(resolve));
    },
  };

  device: TrezorTransport = {
    chunkSize: this.chunkSize,
    open: async () => {},
    close: async () => {},
    write: async (chunk) => {
      const next = this.hostWaiters.shift();
      if (next) next(chunk);
      else this.deviceToHost.push(chunk);
    },
    read: async () => {
      const ready = this.hostToDevice.shift();
      if (ready) return ready;
      return new Promise<Uint8Array>((resolve) => this.deviceWaiters.push(resolve));
    },
  };

  // Convenience: on the device side, read a framed message and reply.
  async expectAndReply(
    replies: Array<{ type: number; payload: Uint8Array }>,
    onRequest?: (msg: { type: number; payload: Uint8Array }) => void,
  ): Promise<void> {
    for (const reply of replies) {
      const msg = await readMessage(this.device);
      onRequest?.(msg);
      await writeMessage(this.device, reply);
    }
  }
}
