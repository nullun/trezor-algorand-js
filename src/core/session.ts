import { readMessage, writeMessage } from "./framing.js";
import {
  MessageType,
  decodeFailure,
  encodeButtonAck,
  encodePassphraseAck,
} from "./messages.js";
import { ProtocolError, failureToError } from "./errors.js";
import type { TrezorTransport } from "../types/index.js";

export class Session {
  constructor(private readonly transport: TrezorTransport) {}

  // Send a request and drive the interaction loop, transparently acking
  // ButtonRequest / PassphraseRequest / PinMatrixRequest (best-effort) until
  // the device returns a terminal message.
  async call(
    type: number,
    payload: Uint8Array,
  ): Promise<{ type: number; payload: Uint8Array }> {
    await writeMessage(this.transport, { type, payload });
    return this.awaitResponse();
  }

  // Send a bare message with no follow-up interaction handling (used by
  // TxAck, which itself already lives inside the Sign-Tx loop).
  async send(type: number, payload: Uint8Array): Promise<void> {
    await writeMessage(this.transport, { type, payload });
  }

  async receive(): Promise<{ type: number; payload: Uint8Array }> {
    return this.awaitResponse();
  }

  private async awaitResponse(): Promise<{
    type: number;
    payload: Uint8Array;
  }> {
    while (true) {
      const msg = await readMessage(this.transport);

      if (msg.type === MessageType.Failure) {
        const f = decodeFailure(msg.payload);
        throw failureToError(f.code, f.message);
      }

      if (msg.type === MessageType.ButtonRequest) {
        await writeMessage(this.transport, {
          type: MessageType.ButtonAck,
          payload: encodeButtonAck(),
        });
        continue;
      }

      if (msg.type === MessageType.PassphraseRequest) {
        // We do not prompt for passphrase in this library — users relying on
        // passphrase-protected accounts should enter the passphrase on-device
        // or unlock the session upstream. Send an empty ack to match trezord
        // defaults; device will surface its own UI if misconfigured.
        await writeMessage(this.transport, {
          type: MessageType.PassphraseAck,
          payload: encodePassphraseAck(""),
        });
        continue;
      }

      if (msg.type === MessageType.PinMatrixRequest) {
        throw new ProtocolError(
          "device requires PIN entry; unlock the Trezor before using trezor-algorand-js",
        );
      }

      return msg;
    }
  }
}
