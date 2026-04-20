import {
  BootloaderModeError,
  CapabilityMissingError,
  InvalidGroupError,
  ProtocolError,
} from "./errors.js";
import {
  MessageType,
  decodeAlgorandAddress,
  decodeAlgorandDataSignature,
  decodeAlgorandPublicKey,
  decodeAlgorandTxRequest,
  decodeAlgorandTxSignature,
  decodeFeatures,
  encodeAlgorandGetAddress,
  encodeAlgorandGetPublicKey,
  encodeAlgorandSignData,
  encodeAlgorandSignTx,
  encodeAlgorandTxAck,
  encodeGetFeatures,
  encodeInitialize,
} from "./messages.js";
import { Session } from "./session.js";
import { ALGORAND_CAPABILITY } from "../types/index.js";
import type {
  ConnectOptions,
  GetAddressParams,
  SignDataParams,
  SignTxGroupParams,
  SignTxParams,
  TrezorFeatures,
  TrezorTransport,
} from "../types/index.js";

export class TrezorAlgorandClient {
  private readonly session: Session;
  private features?: TrezorFeatures;

  private constructor(private readonly transport: TrezorTransport) {
    this.session = new Session(transport);
  }

  static async connect(
    transport: TrezorTransport,
    options: ConnectOptions = {},
  ): Promise<TrezorAlgorandClient> {
    await transport.open();
    const client = new TrezorAlgorandClient(transport);
    const features = await client.initialize();
    if (features.bootloaderMode) {
      await transport.close().catch(() => {});
      throw new BootloaderModeError();
    }
    if (
      options.requireAlgorandCapability !== false &&
      !features.capabilities.includes(ALGORAND_CAPABILITY)
    ) {
      await transport.close().catch(() => {});
      throw new CapabilityMissingError("Algorand");
    }
    return client;
  }

  private async initialize(): Promise<TrezorFeatures> {
    const resp = await this.session.call(
      MessageType.Initialize,
      encodeInitialize(),
    );
    if (resp.type !== MessageType.Features) {
      throw new ProtocolError(
        `expected Features response to Initialize, got ${resp.type}`,
      );
    }
    const f = decodeFeatures(resp.payload);
    const features: TrezorFeatures = {
      vendor: f.vendor,
      model: f.model,
      internalModel: f.internalModel,
      majorVersion: f.majorVersion,
      minorVersion: f.minorVersion,
      patchVersion: f.patchVersion,
      capabilities: f.capabilities,
      bootloaderMode: f.bootloaderMode,
      deviceId: f.deviceId,
      label: f.label,
      initialized: f.initialized,
    };
    this.features = features;
    return features;
  }

  async getFeatures(): Promise<TrezorFeatures> {
    const resp = await this.session.call(
      MessageType.GetFeatures,
      encodeGetFeatures(),
    );
    if (resp.type !== MessageType.Features) {
      throw new ProtocolError(
        `expected Features response to GetFeatures, got ${resp.type}`,
      );
    }
    const f = decodeFeatures(resp.payload);
    this.features = {
      vendor: f.vendor,
      model: f.model,
      internalModel: f.internalModel,
      majorVersion: f.majorVersion,
      minorVersion: f.minorVersion,
      patchVersion: f.patchVersion,
      capabilities: f.capabilities,
      bootloaderMode: f.bootloaderMode,
      deviceId: f.deviceId,
      label: f.label,
      initialized: f.initialized,
    };
    return this.features;
  }

  cachedFeatures(): TrezorFeatures | undefined {
    return this.features;
  }

  async getPublicKey(params: GetAddressParams): Promise<Uint8Array> {
    const resp = await this.session.call(
      MessageType.AlgorandGetPublicKey,
      encodeAlgorandGetPublicKey(params.path, params.showDisplay === true),
    );
    if (resp.type !== MessageType.AlgorandPublicKey) {
      throw new ProtocolError(
        `expected AlgorandPublicKey, got ${resp.type}`,
      );
    }
    return decodeAlgorandPublicKey(resp.payload);
  }

  async getAddress(params: GetAddressParams): Promise<string> {
    const resp = await this.session.call(
      MessageType.AlgorandGetAddress,
      encodeAlgorandGetAddress(
        params.path,
        params.showDisplay === true,
        params.chunkify === true,
      ),
    );
    if (resp.type !== MessageType.AlgorandAddress) {
      throw new ProtocolError(
        `expected AlgorandAddress, got ${resp.type}`,
      );
    }
    return decodeAlgorandAddress(resp.payload);
  }

  async signTx(params: SignTxParams): Promise<Uint8Array> {
    const sigs = await this.signTxGroup({
      path: params.path,
      txs: [params.tx],
    });
    return sigs[0]!;
  }

  async signTxGroup(params: SignTxGroupParams): Promise<Uint8Array[]> {
    const { path, txs } = params;
    if (txs.length < 1 || txs.length > 16) {
      throw new InvalidGroupError(
        `Algorand group must be 1..16 transactions (got ${txs.length})`,
      );
    }

    let resp = await this.session.call(
      MessageType.AlgorandSignTx,
      encodeAlgorandSignTx(path, txs[0]!, txs.length, 0, 0),
    );

    for (let i = 1; i < txs.length; i++) {
      if (resp.type !== MessageType.AlgorandTxRequest) {
        throw new ProtocolError(
          `expected AlgorandTxRequest at group index ${i}, got ${resp.type}`,
        );
      }
      // The device echoes the expected index — validate but don't rely on it.
      decodeAlgorandTxRequest(resp.payload);
      await this.session.send(
        MessageType.AlgorandTxAck,
        encodeAlgorandTxAck(txs[i]!),
      );
      resp = await this.session.receive();
    }

    if (resp.type !== MessageType.AlgorandTxSignature) {
      throw new ProtocolError(
        `expected AlgorandTxSignature, got ${resp.type}`,
      );
    }
    const sig = decodeAlgorandTxSignature(resp.payload);

    if (txs.length === 1) return [sig.signature];
    if (sig.groupSignatures.length !== txs.length) {
      throw new ProtocolError(
        `group signature count mismatch: expected ${txs.length}, got ${sig.groupSignatures.length}`,
      );
    }
    return sig.groupSignatures;
  }

  async signData(params: SignDataParams): Promise<Uint8Array> {
    const resp = await this.session.call(
      MessageType.AlgorandSignData,
      encodeAlgorandSignData(
        params.path,
        params.data,
        params.domain,
        params.authData,
        params.requestId,
      ),
    );
    if (resp.type !== MessageType.AlgorandDataSignature) {
      throw new ProtocolError(
        `expected AlgorandDataSignature, got ${resp.type}`,
      );
    }
    return decodeAlgorandDataSignature(resp.payload);
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
