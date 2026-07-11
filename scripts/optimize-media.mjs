import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const MAX_WIDTH = 1600;
const QUALITY = 80;

const folders = ["media/portraits/color", "media/portraits/mono"];

for (const folder of folders) {
  for (const file of readdirSync(folder).filter((f) => f.endsWith(".jpg"))) {
    const path = join(folder, file);
    const image = sharp(path);
    const { width } = await image.metadata();
    if (width <= MAX_WIDTH) {
      console.log(`skip ${path} (${width}px)`);
      continue;
    }
    const before = statSync(path).size;
    const buffer = await image
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    writeFileSync(path, buffer);
    console.log(`${path} ${(before / 1024).toFixed(0)}K -> ${(buffer.length / 1024).toFixed(0)}K`);
  }
}
