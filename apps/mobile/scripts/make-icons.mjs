// Draws the app's icons and splash from the Bookmark mark (apps/web/public/logo.svg), so they never drift
// from the brand. Run from apps/mobile: `node scripts/make-icons.mjs`.
//
// Self-contained on purpose: the mark is straight lines and cubic curves, so it's flattened to a polygon,
// filled with 4 x 4 supersampling for smooth edges, and written as PNG with Node's own zlib.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "images");

const RED = [0xf1, 0x3c, 0x3c];
const INK = [0x0a, 0x0a, 0x0a];
const WHITE = [0xff, 0xff, 0xff];

// The mark's path from logo.svg, in its 30 x 31 viewBox: M, L and C commands only.
const MARK = "M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z";

function polygon(d) {
  const tokens = d.match(/[MLCZ]|-?[\d.]+/g);
  const points = [];
  let i = 0;
  let cmd = "";
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLCZ]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "Z") break;
    if (cmd === "M" || cmd === "L") points.push([num(), num()]);
    if (cmd === "C") {
      const [x0, y0] = points[points.length - 1];
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      for (let s = 1; s <= 24; s++) {
        const t = s / 24, u = 1 - t;
        points.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
    }
  }
  return points;
}

const MARK_POINTS = polygon(MARK);
const [minX, maxX] = [Math.min(...MARK_POINTS.map((p) => p[0])), Math.max(...MARK_POINTS.map((p) => p[0]))];
const [minY, maxY] = [Math.min(...MARK_POINTS.map((p) => p[1])), Math.max(...MARK_POINTS.map((p) => p[1]))];

// Even-odd point-in-polygon, for one sample.
function inside(pts, x, y) {
  let hit = false;
  for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
    const [xa, ya] = pts[a], [xb, yb] = pts[b];
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) hit = !hit;
  }
  return hit;
}

// RGBA pixels: the mark, `scale` of the width wide and centred, in `fill` over `background` (or clear).
function draw(size, { fill, scale, background }) {
  const px = new Uint8Array(size * size * 4);
  const w = size * scale;
  const k = w / (maxX - minX);
  const h = (maxY - minY) * k;
  const pts = MARK_POINTS.map(([x, y]) => [(x - minX) * k + (size - w) / 2, (y - minY) * k + (size - h) / 2]);
  const N = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0;
      if (scale > 0) {
        for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) if (inside(pts, x + (sx + 0.5) / N, y + (sy + 0.5) / N)) cover++;
      }
      const a = cover / (N * N);
      const o = (y * size + x) * 4;
      if (background) {
        for (let c = 0; c < 3; c++) px[o + c] = Math.round(fill[c] * a + background[c] * (1 - a));
        px[o + 3] = 255;
      } else {
        px.set(fill, o);
        px[o + 3] = Math.round(a * 255);
      }
    }
  }
  return px;
}

// ---- PNG ---------------------------------------------------------------------------------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

// Opaque images are written as plain RGB: App Store icons mustn't have an alpha channel.
function png(size, rgba, opaque) {
  const channels = opaque ? 3 : 4;
  const raw = Buffer.alloc(size * (size * channels + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * channels + 1);
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      for (let c = 0; c < channels; c++) raw[row + 1 + x * channels + c] = rgba[o + c];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const jobs = [
  // iOS and the store listing: the red mark on the app's dark ground, as the app opens dark.
  ["icon.png", 1024, { fill: RED, scale: 0.46, background: INK }],
  // Android adaptive icon: launchers crop to the middle 66% (and round it), so the mark sits well inside.
  ["android-icon-foreground.png", 1024, { fill: RED, scale: 0.34 }],
  ["android-icon-background.png", 1024, { fill: INK, scale: 0, background: INK }],
  // Android 13 themed icons tint this one; only its shape counts.
  ["android-icon-monochrome.png", 1024, { fill: WHITE, scale: 0.34 }],
  ["splash-icon.png", 512, { fill: RED, scale: 0.9 }],
  ["favicon.png", 48, { fill: RED, scale: 0.9 }],
];

for (const [name, size, opts] of jobs) {
  writeFileSync(join(out, name), png(size, draw(size, opts), !!opts.background));
  console.log(`${name} ${size}px`);
}
