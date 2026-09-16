import {
  ApiHttpError,
} from "../http/api-http.error.js";

export const MAX_TRY_ON_INPUT_BYTES =
  5 * 1024 * 1024;

export type ManagedImageContentType =
  | "image/png"
  | "image/jpeg"
  | "image/webp";

export interface ValidatedImage {
  bytes: Buffer;
  contentType: ManagedImageContentType;
  filename: string;
}

export function detectImageContentType(
  bytes: Uint8Array,
  label: string,
  invalidStatus = 400,
): ManagedImageContentType {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  throw new ApiHttpError(
    invalidStatus,
    `${label} debe ser una imagen PNG, JPG/JPEG o WEBP válida.`,
  );
}

export function extensionForContentType(
  contentType: ManagedImageContentType,
): "png" | "jpg" | "webp" {
  if (
    contentType === "image/png"
  ) {
    return "png";
  }

  if (
    contentType === "image/webp"
  ) {
    return "webp";
  }

  return "jpg";
}

export function contentTypeForStorageKey(
  storageKey: string,
): ManagedImageContentType {
  const extension =
    storageKey
      .split(".")
      .pop()
      ?.toLowerCase();

  if (
    extension === "png"
  ) {
    return "image/png";
  }

  if (
    extension === "webp"
  ) {
    return "image/webp";
  }

  return "image/jpeg";
}

export function validateImageBuffer(
  bytes: Buffer,
  reportedContentType:
    string | null | undefined,
  label: string,
  maxBytes: number,
  invalidStatus = 400,
  tooLargeStatus = 413,
): ValidatedImage {
  if (
    bytes.length === 0
  ) {
    throw new ApiHttpError(
      invalidStatus,
      `${label} está vacía.`,
    );
  }

  if (
    bytes.length > maxBytes
  ) {
    throw new ApiHttpError(
      tooLargeStatus,
      `${label} supera el límite permitido.`,
    );
  }

  const contentType =
    detectImageContentType(
      bytes,
      label,
      invalidStatus,
    );

  let reported =
    reportedContentType
      ?.trim()
      .toLowerCase() ?? "";

  if (
    reported === "image/jpg"
  ) {
    reported = "image/jpeg";
  }

  if (
    reported !== "" &&
    reported !== contentType
  ) {
    throw new ApiHttpError(
      invalidStatus,
      `El tipo declarado de ${label.toLowerCase()} no coincide con su contenido.`,
    );
  }

  return {
    bytes,
    contentType,
    filename:
      `image.${extensionForContentType(contentType)}`,
  };
}
