export class TrezorAlgorandError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TrezorAlgorandError";
    this.code = code;
  }
}

export class DeviceNotFoundError extends TrezorAlgorandError {
  constructor(message = "No Trezor device found") {
    super("DEVICE_NOT_FOUND", message);
    this.name = "DeviceNotFoundError";
  }
}

export class DeviceBusyError extends TrezorAlgorandError {
  constructor(message = "Trezor device is busy") {
    super("DEVICE_BUSY", message);
    this.name = "DeviceBusyError";
  }
}

export class UserRejectedError extends TrezorAlgorandError {
  constructor(message = "User rejected the request on device") {
    super("USER_REJECTED", message);
    this.name = "UserRejectedError";
  }
}

export class UnsupportedFirmwareError extends TrezorAlgorandError {
  constructor(message = "Trezor firmware is not supported") {
    super("UNSUPPORTED_FIRMWARE", message);
    this.name = "UnsupportedFirmwareError";
  }
}

export class CapabilityMissingError extends TrezorAlgorandError {
  constructor(capability = "Algorand") {
    super(
      "CAPABILITY_MISSING",
      `Trezor firmware does not advertise the ${capability} capability`,
    );
    this.name = "CapabilityMissingError";
  }
}

export class InvalidPathError extends TrezorAlgorandError {
  constructor(message: string) {
    super("INVALID_PATH", message);
    this.name = "InvalidPathError";
  }
}

export class InvalidGroupError extends TrezorAlgorandError {
  constructor(message: string) {
    super("INVALID_GROUP", message);
    this.name = "InvalidGroupError";
  }
}

export class TransportError extends TrezorAlgorandError {
  constructor(message: string) {
    super("TRANSPORT_ERROR", message);
    this.name = "TransportError";
  }
}

export class ProtocolError extends TrezorAlgorandError {
  constructor(message: string) {
    super("PROTOCOL_ERROR", message);
    this.name = "ProtocolError";
  }
}

export class BootloaderModeError extends TrezorAlgorandError {
  constructor(message = "Trezor device is in bootloader mode") {
    super("BOOTLOADER_MODE", message);
    this.name = "BootloaderModeError";
  }
}

// Trezor Failure codes we care about mapping specifically. See
// messages-common.proto Failure.FailureType.
export const FailureCode = {
  UnexpectedMessage: 1,
  ButtonExpected: 2,
  DataError: 3,
  ActionCancelled: 4,
  PinExpected: 5,
  PinCancelled: 6,
  PinInvalid: 7,
  InvalidSignature: 8,
  ProcessError: 9,
  NotEnoughFunds: 10,
  NotInitialized: 11,
  PinMismatch: 12,
  WipeCodeMismatch: 13,
  InvalidSession: 14,
  Busy: 15,
  FirmwareError: 99,
} as const;

export function failureToError(
  code: number | undefined,
  message: string | undefined,
): TrezorAlgorandError {
  const msg = message ?? "Trezor device reported a failure";
  switch (code) {
    case FailureCode.ActionCancelled:
    case FailureCode.PinCancelled:
      return new UserRejectedError(msg);
    case FailureCode.Busy:
      return new DeviceBusyError(msg);
    case FailureCode.NotInitialized:
      return new UnsupportedFirmwareError(msg);
    default:
      return new TrezorAlgorandError(`FAILURE_${code ?? "UNKNOWN"}`, msg);
  }
}
