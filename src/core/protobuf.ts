// Minimal protobuf (proto2) wire codec covering only the features the
// Trezor Algorand message set uses: varints (uint32/bool/enum), length-
// delimited bytes/string/submessage, and repeated fields (packed or not).
//
// We deliberately avoid pulling in a protobuf runtime so the package stays
// light and the wire format is auditable from this file alone.

export const WireType = {
  VARINT: 0,
  LEN: 2,
} as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

export class Writer {
  private chunks: number[] = [];

  bytes(): Uint8Array {
    return new Uint8Array(this.chunks);
  }

  writeVarint(value: number | bigint): void {
    let v = typeof value === "bigint" ? value : BigInt(value);
    if (v < 0n) throw new Error("negative varints not supported");
    while (v > 0x7fn) {
      this.chunks.push(Number((v & 0x7fn) | 0x80n));
      v >>= 7n;
    }
    this.chunks.push(Number(v));
  }

  writeTag(fieldNumber: number, wireType: number): void {
    this.writeVarint((fieldNumber << 3) | wireType);
  }

  writeUint32(field: number, value: number): void {
    this.writeTag(field, WireType.VARINT);
    this.writeVarint(value >>> 0);
  }

  writeBool(field: number, value: boolean): void {
    this.writeTag(field, WireType.VARINT);
    this.writeVarint(value ? 1 : 0);
  }

  writeBytes(field: number, value: Uint8Array): void {
    this.writeTag(field, WireType.LEN);
    this.writeVarint(value.length);
    for (let i = 0; i < value.length; i++) {
      this.chunks.push(value[i]!);
    }
  }

  writeString(field: number, value: string): void {
    this.writeBytes(field, textEncoder.encode(value));
  }
}

export class Reader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  readVarint(): bigint {
    let result = 0n;
    let shift = 0n;
    while (true) {
      if (this.pos >= this.buf.length) {
        throw new Error("protobuf: truncated varint");
      }
      const byte = this.buf[this.pos++]!;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
      if (shift > 64n) throw new Error("protobuf: varint too long");
    }
  }

  readUint32(): number {
    return Number(this.readVarint() & 0xffffffffn);
  }

  readBool(): boolean {
    return this.readVarint() !== 0n;
  }

  readBytes(): Uint8Array {
    const len = Number(this.readVarint());
    if (this.pos + len > this.buf.length) {
      throw new Error("protobuf: truncated length-delimited field");
    }
    const slice = this.buf.slice(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }

  readString(): string {
    return textDecoder.decode(this.readBytes());
  }

  readTag(): { field: number; wireType: number } {
    const tag = Number(this.readVarint());
    return { field: tag >>> 3, wireType: tag & 0x7 };
  }

  skip(wireType: number): void {
    if (wireType === WireType.VARINT) {
      this.readVarint();
    } else if (wireType === WireType.LEN) {
      this.readBytes();
    } else if (wireType === 1) {
      this.pos += 8;
    } else if (wireType === 5) {
      this.pos += 4;
    } else {
      throw new Error(`protobuf: unsupported wire type ${wireType}`);
    }
  }
}

// Helper: decode a repeated uint32 field. Trezor's proto2 source does not
// declare packed, but some encoders still emit packed — accept either.
export function readRepeatedUint32Into(
  reader: Reader,
  wireType: number,
  into: number[],
): void {
  if (wireType === WireType.VARINT) {
    into.push(Number(reader.readVarint() & 0xffffffffn));
  } else if (wireType === WireType.LEN) {
    const packed = reader.readBytes();
    const r = new Reader(packed);
    while (!r.done) into.push(Number(r.readVarint() & 0xffffffffn));
  } else {
    reader.skip(wireType);
  }
}
