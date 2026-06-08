/**
 * generate-icons.js
 *
 * Generates tray icon PNG files for Screen Time Monitor using pure Node.js
 * (no external dependencies — uses built-in Buffer and zlib).
 *
 * Output files:
 *   - resources/tray-icon.png     (16×16)
 *   - resources/tray-icon@2x.png  (32×32, HiDPI)
 *   - resources/tray-icon.svg     (SVG fallback, can be used as-is or replaced)
 *
 * Usage: node resources/generate-icons.js
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname);

// ── PNG Encoder (pure JS) ──────────────────────────────────────

/**
 * Encode raw RGBA pixel data as a valid PNG buffer.
 *
 * @param width  - Image width in pixels.
 * @param height - Image height in pixels.
 * @param pixels - Flat Uint8Array of RGBA values (length = width * height * 4).
 * @returns PNG file as a Buffer.
 */
function encodePNG(width, height, pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // ── IHDR chunk ───────────────────────────────────────────────
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);   // width
  ihdrData.writeUInt32BE(height, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 6;   // color type: RGBA
  ihdrData[10] = 0;  // compression: deflate
  ihdrData[11] = 0;  // filter: adaptive
  ihdrData[12] = 0;  // interlace: none
  const ihdr = makeChunk('IHDR', ihdrData);

  // ── IDAT chunk (pixel data) ──────────────────────────────────
  // Each row is preceded by a filter byte (0 = None)
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawScanlines[rowStart] = 0; // filter: None
    const srcStart = y * width * 4;
    pixels.copy(rawScanlines, rowStart + 1, srcStart, srcStart + width * 4);
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });
  const idat = makeChunk('IDAT', compressed);

  // ── IEND chunk ───────────────────────────────────────────────
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Create a PNG chunk: 4-byte length + 4-byte type + data + 4-byte CRC.
 */
function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcInput);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

/**
 * CRC-32 for PNG chunk validation.
 * Uses the standard PNG polynomial 0xEDB88320.
 */
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Icon Drawing ───────────────────────────────────────────────

/**
 * Draw a blue filled circle on a transparent RGBA buffer.
 *
 * @param width   - Icon width.
 * @param height  - Icon height.
 * @param r       - Circle radius.
 * @param g       - Circle color green.
 * @param b       - Circle color blue.
 * @param a       - Circle alpha.
 * @returns Flat RGBA pixel buffer.
 */
function drawCircleIcon(width, height, r, g, b, a) {
  const pixels = Buffer.alloc(width * height * 4, 0);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const radius = Math.min(width, height) * 0.42;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        const px = (y * width + x) * 4;
        // Anti-alias edge with a 1px smooth falloff
        const edge = Math.max(0, Math.min(1, radius - dist));
        const alpha = dist > radius - 1 ? Math.round(a * edge) : a;
        pixels[px] = r;
        pixels[px + 1] = g;
        pixels[px + 2] = b;
        pixels[px + 3] = alpha;
      }
    }
  }
  return pixels;
}

// ── Generate ───────────────────────────────────────────────────

function generate() {
  console.log('[generate-icons] Creating tray icons...');

  // Primary color: Indigo (#6366F1)
  const R = 99, G = 102, B = 241, A = 255;

  // 16×16 tray icon
  {
    const pixels16 = drawCircleIcon(16, 16, R, G, B, A);
    const png16 = encodePNG(16, 16, pixels16);
    const out16 = path.join(OUT_DIR, 'tray-icon.png');
    fs.writeFileSync(out16, png16);
    console.log(`  Created ${out16} (${png16.length} bytes)`);
  }

  // 32×32 HiDPI tray icon
  {
    const pixels32 = drawCircleIcon(32, 32, R, G, B, A);
    const png32 = encodePNG(32, 32, pixels32);
    const out32 = path.join(OUT_DIR, 'tray-icon@2x.png');
    fs.writeFileSync(out32, png32);
    console.log(`  Created ${out32} (${png32.length} bytes)`);
  }

  // SVG fallback (can be used directly or replaced with custom artwork)
  const svgContent = `<!-- Screen Time Monitor Tray Icon -->
<!-- Replace this SVG with your own custom tray icon if desired. -->
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="7" fill="#6366F1"/>
  <text x="8" y="11" text-anchor="middle" font-family="Arial,sans-serif"
        font-size="8" font-weight="bold" fill="white">ST</text>
</svg>`;
  const outSvg = path.join(OUT_DIR, 'tray-icon.svg');
  fs.writeFileSync(outSvg, svgContent, 'utf-8');
  console.log(`  Created ${outSvg}`);

  console.log('[generate-icons] Done.');
}

generate();
