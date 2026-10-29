import { crc32, deflateSync } from "node:zlib";
import qrcode from "qrcode-generator";

/** Matriz QR (nivel de corrección M, versión automática). */
function matrix(text: string): boolean[][] {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => code.isDark(row, col)));
}

/** SVG escalable para la web (sin colores de marca: el QR siempre negro sobre blanco para que los bancos lo lean). */
export function renderQrSvg(text: string, margin = 4): string {
  const modules = matrix(text);
  const size = modules.length + margin * 2;
  let path = "";
  modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x + margin} ${y + margin}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Código QR de pago"><rect width="${size}" height="${size}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed) >>> 0);
  return Buffer.concat([length, typed, crc]);
}

/** PNG en escala de grises (8 bits) codificado a mano con zlib: el móvil lo muestra como data URL sin librerías nativas. */
export function renderQrPng(text: string, scale = 8, margin = 4): Buffer {
  const modules = matrix(text);
  const size = (modules.length + margin * 2) * scale;
  const raw = Buffer.alloc((size + 1) * size, 0xff);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size + 1)] = 0; // filtro "None" por fila
    const moduleY = Math.floor(y / scale) - margin;
    for (let x = 0; x < size; x += 1) {
      const moduleX = Math.floor(x / scale) - margin;
      if (modules[moduleY]?.[moduleX]) raw[y * (size + 1) + 1 + x] = 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profundidad
  header[9] = 0; // escala de grises
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function renderQrPngDataUrl(text: string): string {
  return `data:image/png;base64,${renderQrPng(text).toString("base64")}`;
}
