// One-off generator for public/icons/icon-{192,512}.png — run with
// `node scripts/generateIcons.mjs` whenever the icon design changes.
//
// Not using next/og's ImageResponse here: @vercel/og's bundled default-font
// loader builds a `file://` URL from import.meta.url and never encodes it,
// so it throws "Invalid URL" on Windows the moment the project path (like
// this repo's "My Dashboard") contains a space. Drawing rectangles into a raw
// pixel buffer and encoding it with Node's built-in zlib sidesteps that
// dependency entirely.
//
// The mark is a blocky "LET" wordmark built from plain rects — no font file,
// and it scales to any size. It sits within the middle band of the canvas, so
// it survives the circular crop a maskable icon gets on Android.
import { deflateSync } from "zlib";
import { writeFileSync } from "fs";

const BG = [0x0b, 0x12, 0x20]; // #0b1220, matches manifest.ts background_color
const ACCENT = [0xe2, 0x95, 0x4f]; // the UI's orange, so the tile reads as this app at a glance

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

/** Fills a rect on an RGB pixel buffer. Coordinates are fractions of the icon, so one set of numbers draws the mark at any size. */
function fillRect(px, size, [fx, fy, fw, fh], [r, g, b]) {
  const x0 = Math.round(fx * size);
  const y0 = Math.round(fy * size);
  const x1 = Math.min(size, Math.round((fx + fw) * size));
  const y1 = Math.min(size, Math.round((fy + fh) * size));
  for (let y = Math.max(0, y0); y < y1; y++) {
    for (let x = Math.max(0, x0); x < x1; x++) {
      const i = (y * size + x) * 3;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
}

/** The rects making up "LET", as [x, y, w, h] fractions of the canvas. */
function letRects() {
  const t = 0.05; // stroke thickness
  const top = 0.37;
  const bottom = 0.63;
  const h = bottom - top;
  const lw = 0.15; // letter width
  const gap = 0.055;
  const rects = [];
  let x = (1 - (lw * 3 + gap * 2)) / 2;

  // L — upright plus a foot
  rects.push([x, top, t, h], [x, bottom - t, lw, t]);
  x += lw + gap;
  // E — upright plus three arms, the middle one slightly short
  rects.push([x, top, t, h], [x, top, lw, t], [x, top + (h - t) / 2, lw * 0.82, t], [x, bottom - t, lw, t]);
  x += lw + gap;
  // T — a bar with a centered stem
  rects.push([x, top, lw, t], [x + (lw - t) / 2, top, t, h]);

  return rects;
}

function iconPng(size) {
  const px = Buffer.alloc(size * size * 3);
  fillRect(px, size, [0, 0, 1, 1], BG);
  for (const rect of letRects()) fillRect(px, size, rect, ACCENT);

  // PNG scanlines are each prefixed with a filter byte (0 = none).
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync("public/icons/icon-192.png", iconPng(192));
writeFileSync("public/icons/icon-512.png", iconPng(512));
console.log("Wrote public/icons/icon-192.png and icon-512.png");
