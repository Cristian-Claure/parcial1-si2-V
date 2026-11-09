import assert from "node:assert/strict";
import test from "node:test";
import { base64ToBytes, buildTryOnMultipart, safeFilename } from "../src/features/try-on/tryOnUpload.ts";

test("base64ToBytes decodifica el base64 del selector (con o sin prefijo data:)", () => {
  assert.deepEqual([...base64ToBytes("/9j/4A==")], [0xff, 0xd8, 0xff, 0xe0]);
  assert.deepEqual([...base64ToBytes("data:image/jpeg;base64,/9j/\n4A==")], [0xff, 0xd8, 0xff, 0xe0]);
});

test("safeFilename deja un nombre ASCII con la extensión del tipo", () => {
  assert.equal(safeFilename("Foto de Mamá.HEIC", "image/jpeg"), "Foto-de-Mam.jpg");
  assert.equal(safeFilename(null, "image/png"), "person.png");
});

test("buildTryOnMultipart arma un multipart que el backend (multer) puede leer", () => {
  const photo = new Uint8Array([0xff, 0xd8, 0x00, 0xff, 0xd9]);
  const body = buildTryOnMultipart({
    boundary: "B",
    fields: { productId: "p-1", variantId: "v-1" },
    photo: { bytes: photo, filename: "person.jpg", contentType: "image/jpeg" },
  });
  const text = Buffer.from(body).toString("latin1");
  assert.ok(text.startsWith('--B\r\nContent-Disposition: form-data; name="productId"\r\n\r\np-1\r\n'));
  assert.ok(text.includes('--B\r\nContent-Disposition: form-data; name="variantId"\r\n\r\nv-1\r\n'));
  assert.ok(text.includes('name="person"; filename="person.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'));
  assert.ok(text.endsWith("\r\n--B--\r\n"));
  const start = text.indexOf("image/jpeg\r\n\r\n") + "image/jpeg\r\n\r\n".length;
  assert.deepEqual([...body.slice(start, start + photo.length)], [...photo]);
});
