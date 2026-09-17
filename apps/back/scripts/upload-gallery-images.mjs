#!/usr/bin/env node
// One-off migration: upload the 45 catalog product photos as GALLERY images
// through the real admin HTTP endpoint (POST /api/catalog/manage/products/:id/assets),
// the same one CatalogManagementPage uses. Not meant to be run again once done.
//
// Usage:
//   VELORA_MIGRATION_ADMIN_EMAIL=... VELORA_MIGRATION_ADMIN_PASSWORD=... \
//     node apps/back/scripts/upload-gallery-images.mjs

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = process.env.VELORA_MIGRATION_API_BASE ?? "http://127.0.0.1:8080";
const ADMIN_EMAIL = process.env.VELORA_MIGRATION_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.VELORA_MIGRATION_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Set VELORA_MIGRATION_ADMIN_EMAIL and VELORA_MIGRATION_ADMIN_PASSWORD before running.");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = path.resolve(__dirname, "../../front/src/assets/products");

// variantId omitted (null) => product-level GALLERY image.
// primary defaults to true; only set false on the second image of a pair.
const UPLOADS = [
  { file: "Abrigo-Camelia.png", productId: "1e9065ac-b5a1-0eab-18d9-a42ec9d732b1", productName: "Abrigo Camelia" },
  { file: "Abrigo-mistral.png", productId: "da70f9ba-1775-4807-9651-b09633db6557", productName: "Abrigo Mistral" },
  { file: "aretes-alba.png", productId: "519558f6-5056-3632-a4c5-1b22c4575713", productName: "Aretes Alba" },
  { file: "ballerina-olivia.png", productId: "a433420a-a41a-e171-a59c-d5e52294ea65", productName: "Ballerina Olivia" },
  { file: "blaquer-olivia.png", productId: "f929b720-ea48-8b11-2bd1-56c14f5f7bb3", productName: "Blazer Olivia" },
  { file: "blusa-abrilpng.png", productId: "15e3b362-d249-de09-1bd0-560aed008c3f", productName: "Blusa Abril" },
  { file: "blusa-alma.png", productId: "2c43b245-9cb5-62dd-5206-9293ae03e4da", productName: "Blusa Alma" },
  { file: "blusa-marfil.png", productId: "b00631c4-6b76-9d41-1d1d-57c7cae0e772", productName: "Blusa Marfil" },
  { file: "body-marfil.png", productId: "0182d4c6-a8ac-5bdd-414c-02a3040314cd", productName: "Body Marfil" },
  { file: "bolso-siena.png", productId: "6bf985fc-611e-16aa-698d-d88a9e229d76", productName: "Bolso Siena" },
  { file: "bota-verona.png", productId: "e6333b7c-1e64-c120-9c74-019db8330f35", productName: "Bota Verona" },
  { file: "camisa-cielo.png", productId: "f1e8e20c-6199-3de8-ef67-36df46bec159", productName: "Camisa Cielo" },
  { file: "camisa-lino.png", productId: "abaee24b-f3ed-2907-aa61-2992d5e040a5", productName: "Camisa Lino" },
  { file: "camiseta-serena.png", productId: "4a7c2055-87ae-9384-3e2e-e1cf52b290a5", productName: "Camiseta Serena" },
  { file: "cardigan-nerea.png", productId: "5d2b4484-4120-c2d4-7028-b14abdfd8b10", productName: "Cárdigan Nerea" },
  { file: "cartera-aura.png", productId: "7966222e-6d73-31a5-d4d4-6e658626083c", productName: "Cartera Aura" },
  { file: "chaqueta-celia.png", productId: "066861c3-bea0-a3ae-6c1f-37e9d804a22e", productName: "Chaqueta Celia" },
  { file: "chaqueta-montreal.png", productId: "4f2960a3-d559-2778-930e-19a76c73bb02", productName: "Chaqueta Montreal" },
  { file: "chompa-emilia.png", productId: "abfc4d05-ffe9-46a0-0db7-475ac1d596b6", productName: "Chompa Emilia" },
  { file: "cinturon-dalia.png", productId: "69742e22-6e45-3637-a40c-daaa49c3afe4", productName: "Cinturón Dalia" },
  { file: "collar-nerea.png", productId: "185eb54a-3917-b9eb-ab96-3656a5cba11f", productName: "Collar Nerea" },
  { file: "conjunto-alma.png", productId: "7d4a40a5-5de2-25da-5c5f-32c16b11be86", productName: "Conjunto Alma" },
  { file: "conjunto-lucia.png", productId: "1c11ae6c-07e5-a99b-de51-4f48a2d2ef17", productName: "Conjunto Lucía" },
  { file: "conjunto-roma.png", productId: "ea4b6809-52f4-5185-b878-2b3c6df5d50e", productName: "Conjunto Roma" },
  { file: "falda-elisa.png", productId: "d3c352ce-9754-b090-b392-979b7ed4bcad", productName: "Falda Elisa" },
  { file: "falda-magnolia.png", productId: "18c7576f-f10a-804f-9ff4-a41455183c2c", productName: "Falda Magnolia" },
  { file: "falda-sol.png", productId: "0ebde8b5-cebd-c90b-156d-cbde86a6e0fb", productName: "Falda Sol" },
  { file: "falda-verona.png", productId: "35bf1dfa-dd7a-46c0-3b14-7fb480d662d6", productName: "Falda Verona" },
  { file: "jean-marea.png", productId: "a5515453-06b9-8123-dd29-f482a9d4ce49", productName: "Jean Marea" },
  { file: "lentes-sol.png", productId: "2299d6c0-9e71-cf5a-6156-27889c588c85", productName: "Lentes Sol" },
  { file: "minibag-elisa.png", productId: "d1a90916-ec48-a82a-4bc9-ac5116ead382", productName: "Mini Bag Elisa" },
  { file: "mocasin-ambar.png", productId: "e274ef14-d8b6-cae1-622d-bb5dfbe2974e", productName: "Mocasín Ámbar" },

  // Pantalón Niza: generic shot is primary/fallback; "-negro" is tied to the S/Negro variant and never primary.
  { file: "pantalon-niza.png", productId: "1698d65d-c490-2cd6-ab25-351db26afbcb", productName: "Pantalón Niza", sortOrder: 0, primary: true },
  { file: "pantalon-niza-negro.png", productId: "1698d65d-c490-2cd6-ab25-351db26afbcb", productName: "Pantalón Niza", variantId: "c213012f-b308-0be6-0f7b-be4a97c46f18", sortOrder: 1, primary: false },

  { file: "pantalon-roma.png", productId: "dc442b2e-1fd4-4796-3301-36c30d0bbebf", productName: "Pantalón Roma" },
  { file: "pantalon-siena.png", productId: "f1b681cf-1e41-b4d3-1994-9dd1e1f0ef8a", productName: "Pantalón Siena" },
  { file: "pantalon-vitta.png", productId: "57d23f79-c19d-f2b4-144f-7e5cd687bff2", productName: "Pantalón Vitta" },
  { file: "pañuelo-brisa.png", productId: "9c7b5fb9-bed5-117e-0b9b-86b4e7e7cb46", productName: "Pañuelo Brisa" },

  // Sandalia Lía: two product-level angles, no variant tie. First is primary.
  { file: "sandalia-lia.png", productId: "c66d20b2-c3cb-9be1-947e-3931710fdd07", productName: "Sandalia Lía", sortOrder: 0, primary: true },
  { file: "sandalia-lia2.png", productId: "c66d20b2-c3cb-9be1-947e-3931710fdd07", productName: "Sandalia Lía", sortOrder: 1, primary: false },

  { file: "sneaker-nube.png", productId: "58bba5a1-7bca-67b6-0339-501a7ca78d01", productName: "Sneaker Nube" },
  { file: "sueter-alba.png", productId: "e4682870-ea20-e2e3-0bb4-3bd3d344bcc8", productName: "Suéter Alba" },
  { file: "tejido-renata.png", productId: "2c627085-2beb-bf8b-4c34-9db50d3b1804", productName: "Tejido Renata" },
  { file: "top-esencial.png", productId: "65e7657a-df31-f28e-ca83-afe4d1cf5638", productName: "Top Esencial" },
  { file: "tote-serena.png", productId: "07ac438b-45b7-4057-66de-9e50cdc5fe8f", productName: "Tote Serena" },
  { file: "vestido-aurora.png", productId: "5295a629-f00c-4231-b033-6de536019f7e", productName: "Vestido Aurora" },
  { file: "vestido-brisa.png", productId: "7a650edc-1c5f-5b8e-a797-c816f788f4c3", productName: "Vestido Brisa" },
  { file: "vestido-celeste.png", productId: "c97b5000-689d-4864-822e-681f14574d9b", productName: "Vestido Celeste" },
  { file: "vestido-dalia.png", productId: "d460e695-c096-bd20-a355-135a6fba0805", productName: "Vestido Dalia" },
  { file: "vestido-luna.png", productId: "dadf9285-d7a6-8c61-ea0f-5932b38bed86", productName: "Vestido Luna" },
  { file: "vestido-serena.png", productId: "8724657d-8d23-b4e6-f6b2-b63da0a84178", productName: "Vestido Serena" },
  { file: "vestido-toscana.png", productId: "a9541c4a-e4be-6041-fec6-5abd56a6c94c", productName: "Vestido Toscana" },
].map((entry) => ({ sortOrder: 0, primary: true, ...entry }));

async function login() {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.accessToken;
}

async function uploadOne(token, entry) {
  const bytes = await readFile(path.join(IMAGES_DIR, entry.file));
  const form = new FormData();

  form.append("file", new Blob([bytes], { type: "image/png" }), entry.file);
  form.append("purpose", "GALLERY");
  form.append("primary", String(entry.primary));
  form.append("sortOrder", String(entry.sortOrder));
  form.append("altText", entry.productName);

  if (entry.variantId) {
    form.append("variantId", entry.variantId);
  }

  const response = await fetch(
    `${API_BASE}/api/catalog/manage/products/${entry.productId}/assets`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );

  const bodyText = response.ok ? null : await response.text();
  return { file: entry.file, productName: entry.productName, ok: response.ok, status: response.status, body: bodyText };
}

async function main() {
  console.log(`Uploading ${UPLOADS.length} images via ${API_BASE} as ${ADMIN_EMAIL}...\n`);

  const token = await login();
  const results = [];

  for (const entry of UPLOADS) {
    const result = await uploadOne(token, entry);
    results.push(result);
    console.log(
      `${result.ok ? "OK  " : "FAIL"} ${entry.file} -> ${entry.productName}` +
        (result.ok ? "" : ` (${result.status}: ${result.body})`),
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} uploaded successfully.`);

  if (failed.length > 0) {
    console.log("Failed files:", failed.map((f) => f.file).join(", "));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
