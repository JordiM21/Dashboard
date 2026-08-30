// One-off generator for public/icons/icon-{192,512}.png — run with
// `node scripts/generateIcons.mjs` whenever the icon design changes.
//
// Not using next/og's ImageResponse here: @vercel/og's bundled default-font
// loader builds a `file://` URL from import.meta.url and never encodes it,
// so it throws "Invalid URL" on Windows the moment the project path (like
// this repo's "My Dashboard") contains a space. A flat solid-color square
// via Node's built-in zlib sidesteps that dependency entirely — good enough
// for a home-screen icon; swap in a real logo file later if wanted.
import { deflateSync } from "zlib";
import { writeFileSync } from "fs";

const BG = [0x0b, 0x12, 0x20]; // #0b1220, matches manifest.ts background_color

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function solidPng(size, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(size).fill([r, g, b]).flat())]);
  const raw = Buffer.concat(Array(size).fill(row));
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync("public/icons/icon-192.png", solidPng(192, BG));
writeFileSync("public/icons/icon-512.png", solidPng(512, BG));
console.log("Wrote public/icons/icon-192.png and icon-512.png");
