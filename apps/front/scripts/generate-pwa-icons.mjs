import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

// logo-mark.png is a black mark on an opaque white square (no alpha channel),
// so a plain resize+composite would leave a visible white halo against --paper.
// Instead we rebuild it as a transparent-alpha mask (alpha = inverted luminance,
// RGB forced to --ink) so it can sit cleanly on any background color.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = path.join(ROOT, "src/assets/brand/logo-mark.png");
const OUT_DIR = path.join(ROOT, "public/icons");

const PAPER = "#FAF6F0";
const INK = { r: 0x17, g: 0x13, b: 0x0f };
const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MARK_SCALE = 0.5;

async function maskedMark() {
  const { data, info } = await sharp(SOURCE)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i += 1) {
    const luminance = data[i];
    rgba[i * 4] = INK.r;
    rgba[i * 4 + 1] = INK.g;
    rgba[i * 4 + 2] = INK.b;
    rgba[i * 4 + 3] = 255 - luminance;
  }

  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const mark = await maskedMark();

  for (const size of SIZES) {
    const markSize = Math.round(size * MARK_SCALE);
    const markBuffer = await mark.clone().resize(markSize, markSize, { fit: "contain" }).png().toBuffer();

    await sharp({ create: { width: size, height: size, channels: 3, background: PAPER } })
      .composite([{ input: markBuffer, gravity: "center" }])
      .png()
      .toFile(path.join(OUT_DIR, `icon-${size}x${size}.png`));
  }

  console.log(`Generated ${SIZES.length} icons in ${OUT_DIR}`);
}

await main();
