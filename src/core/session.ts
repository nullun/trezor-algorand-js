import { readMessage, writeMessage } from "./framing.js";
import {
  MessageType,
  decodeFailure,
  encodeButtonAck,
  encodePassphraseAck,
} from "./messages.js";
import { ProtocolError, failureToError } from "./errors.js";
import type {
  PassphraseSource,
  TrezorTransport,
} from "../types/index.js";

export interface SessionOptions {
  passphraseSource?: PassphraseSource;
}

export interface Transaction {
  call(
    type: number,
    payload: Uint8Array,
  ): Promise<{ type: number; payload: Uint8Array }>;
  send(type: number, payload: Uint8Array): Promise<void>;
  receive(): Promise<{ type: number; payload: Uint8Array }>;
}

// Serializes all device interaction so concurrent client calls cannot
// interleave reads and writes on the same transport. `call` is atomic on
// its own; multi-step exchanges (e.g. SignTx group) wrap their entire
// protocol in `transact` so the lock is held across the whole sequence.
export class Session {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly passphraseSource: PassphraseSource;

  constructor(
    private readonly transport: TrezorTransport,
    options: SessionOptions = {},
  ) {
    this.passphraseSource = options.passphraseSource ?? { onDevice: true };
  }

  async call(
    type: number,
    payload: Uint8Array,
  ): Promise<{ type: number; payload: Uint8Array }> {
    return this.enqueue(() => this.callUnlocked(type, payload));
  }

  async transact<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.enqueue(() =>
      fn({
        call: (t, p) => this.callUnlocked(t, p),
        send: (t, p) => writeMessage(this.transport, { type: t, payload: p }),
        receive: () => this.awaitResponse(),
      }),
    );
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async callUnlocked(
    type: number,
    payload: Uint8Array,
  ): Promise<{ type: number; payload: Uint8Array }> {
    await writeMessage(this.transport, { type, payload });
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
        await writeMessage(this.transport, {
          type: MessageType.PassphraseAck,
          payload: this.encodePassphrase(),
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

  private encodePassphrase(): Uint8Array {
    const src = this.passphraseSource;
    if ("onDevice" in src && src.onDevice) {
      return encodePassphraseAck("", true);
    }
    if ("passphrase" in src) {
      return encodePassphraseAck(src.passphrase, false);
    }
    return encodePassphraseAck("", true);
  }
}
