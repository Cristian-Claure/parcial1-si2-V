/**
 * Cuerpo multipart del Try-On armado a mano.
 *
 * Expo 57 instala `expo/fetch` como `fetch` global y su FormData no admite la parte
 * propietaria de React Native `{ uri, name, type }` (lanza "Unsupported FormDataPart
 * implementation", que la app veía como "No hay conexión con el servidor."). Por eso la foto
 * se lee en base64 desde el selector y se envía como `Uint8Array` con su boundary.
 */

/** Mismo tope que el backend (MAX_TRY_ON_INPUT_BYTES / VELORA_TRYON_MAX_INPUT_BYTES). */
export const TRY_ON_MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  const binary = globalThis.atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function ascii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0x7f;
  }
  return bytes;
}

/** Nombre de archivo seguro para la cabecera Content-Disposition (solo ASCII). */
export function safeFilename(name: string | null | undefined, contentType: string): string {
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const base = (name ?? "").replace(/\.[A-Za-z0-9]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "person"}.${extension}`;
}

export interface TryOnUploadInput {
  boundary: string;
  fields: Record<string, string>;
  photo: { bytes: Uint8Array; filename: string; contentType: string };
}

export function buildTryOnMultipart({ boundary, fields, photo }: TryOnUploadInput): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(ascii(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(ascii(
    `--${boundary}\r\nContent-Disposition: form-data; name="person"; filename="${photo.filename}"\r\n` +
    `Content-Type: ${photo.contentType}\r\n\r\n`,
  ));
  chunks.push(photo.bytes);
  chunks.push(ascii(`\r\n--${boundary}--\r\n`));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
