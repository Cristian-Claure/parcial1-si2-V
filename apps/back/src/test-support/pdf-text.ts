import { inflateSync } from "node:zlib";

/**
 * Extrae el texto de un PDF generado con fuentes estándar (pdfkit): descomprime cada stream
 * Flate y decodifica los operadores de texto Tj/TJ (cadenas hex o literales en WinAnsi).
 * Suficiente para verificar en pruebas que el PDF es válido y contiene lo esperado.
 */
export function pdfText(buffer: Buffer): { text: string; pages: number } {
  const source = buffer.toString("latin1");
  if (!source.startsWith("%PDF-") || !source.trimEnd().endsWith("%%EOF")) throw new Error("No es un PDF válido.");
  const decoder = new TextDecoder("windows-1252");
  const chunks: string[] = [];
  const streamPattern = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(source))) {
    const start = match.index + match[0].length;
    const end = source.indexOf("endstream", start);
    if (end < 0) break;
    const header = source.slice(Math.max(0, match.index - 200), match.index);
    let body = buffer.subarray(start, end);
    if (header.includes("/FlateDecode")) {
      try { body = inflateSync(body); } catch { continue; }
    }
    const content = body.toString("latin1");
    for (const op of content.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|(<[0-9a-fA-F]*>|\((?:[^)\\]|\\.)*\))\s*Tj/g)) {
      const parts = op[1] !== undefined ? [...op[1].matchAll(/<([0-9a-fA-F]*)>|\(((?:[^)\\]|\\.)*)\)/g)] : [[op[2]!, ...(op[2]!.startsWith("<") ? [op[2]!.slice(1, -1), undefined] : [undefined, op[2]!.slice(1, -1)])]];
      const text = parts.map((part) => {
        const hex = part[1];
        if (hex !== undefined) return decoder.decode(Buffer.from(hex, "hex"));
        return (part[2] ?? "").replace(/\\([()\\])/g, "$1");
      }).join("");
      chunks.push(text);
    }
    streamPattern.lastIndex = end;
  }
  const pages = (source.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return { text: chunks.join("\n"), pages };
}
