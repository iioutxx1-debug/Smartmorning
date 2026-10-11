import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

// CRC32 Table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Filter byte 0 per scanline
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0;
    rgbaBuffer.copy(
      rawData,
      y * (width * 4 + 1) + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function renderIcon(size, mode = 'rounded_square') {
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    const ny = y / (size - 1); // 0 top .. 1 bottom
    for (let x = 0; x < size; x++) {
      const nx = x / (size - 1); // 0 left .. 1 right
      const idx = (y * size + x) * 4;

      // Masking for rounded square or circle
      let alphaMask = 1.0;
      if (mode === 'circle') {
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = 0.485;
        const edge = 1.5 / size;
        if (dist > radius) {
          alphaMask = Math.max(0, 1 - (dist - radius) / edge);
        }
      } else if (mode === 'rounded_square') {
        const half = 0.485;
        const cornerR = 0.21;
        const qx = Math.abs(nx - 0.5) - (half - cornerR);
        const qy = Math.abs(ny - 0.5) - (half - cornerR);
        const dist =
          Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) +
          Math.min(Math.max(qx, qy), 0) -
          cornerR;
        const edge = 1.5 / size;
        if (dist > 0) {
          alphaMask = Math.max(0, 1 - dist / edge);
        }
      }

      if (alphaMask <= 0) {
        buf[idx] = 0;
        buf[idx + 1] = 0;
        buf[idx + 2] = 0;
        buf[idx + 3] = 0;
        continue;
      }

      // 1. Sky Gradient (Sky Blue #2F80ED -> Warm Horizon #93C5FD -> Golden Glow)
      let r = lerp(42, 135, Math.pow(ny, 0.85));
      let g = lerp(122, 198, Math.pow(ny, 0.85));
      let b = lerp(226, 250, Math.pow(ny, 0.85));

      // Sun center
      const sunX = 0.5;
      const sunY = 0.56;
      const dxSun = nx - sunX;
      const dySun = ny - sunY;
      const distSun = Math.sqrt(dxSun * dxSun + dySun * dySun);

      // Warm radial sunrise glow in sky
      const glowFactor = Math.max(0, 1 - distSun / 0.48);
      r = lerp(r, 255, glowFactor * 0.65);
      g = lerp(g, 232, glowFactor * 0.55);
      b = lerp(b, 150, glowFactor * 0.25);

      // Subtle sun rays
      const angle = Math.atan2(dySun, dxSun);
      if (ny < 0.62 && distSun > 0.17 && distSun < 0.42) {
        const rayWave = Math.pow(Math.max(0, Math.cos(angle * 12)), 4);
        const rayFade = Math.max(0, 1 - (distSun - 0.17) / 0.25);
        const rayBoost = rayWave * rayFade * 0.22;
        r = Math.min(255, r + rayBoost * 255);
        g = Math.min(255, g + rayBoost * 240);
        b = Math.min(255, b + rayBoost * 180);
      }

      // 2. Golden Sun Disc (#FDE047 -> #F59E0B)
      const sunRadius = mode === 'foreground' ? 0.155 : 0.19;
      if (distSun < sunRadius + 0.008) {
        const sunEdge = Math.max(0, Math.min(1, (sunRadius - distSun) * (size * 0.5)));
        const sunT = (ny - (sunY - sunRadius)) / (sunRadius * 2);
        const sr = lerp(254, 245, sunT);
        const sg = lerp(240, 158, sunT);
        const sb = lerp(115, 11, sunT);
        r = lerp(r, sr, sunEdge);
        g = lerp(g, sg, sunEdge);
        b = lerp(b, sb, sunEdge);
      }

      // 3. Back Mountain / Wave Ridge (#2563EB -> #1D4ED8)
      const wave1Y =
        0.60 +
        0.045 * Math.sin(nx * Math.PI * 2.1 - 0.4) -
        0.03 * Math.cos(nx * Math.PI * 1.3);
      if (ny >= wave1Y - 0.008) {
        const wEdge = Math.max(0, Math.min(1, (ny - wave1Y) * (size * 0.5)));
        const wr = lerp(37, 29, (ny - wave1Y) / 0.4);
        const wg = lerp(99, 78, (ny - wave1Y) / 0.4);
        const wb = lerp(235, 216, (ny - wave1Y) / 0.4);
        r = lerp(r, wr, wEdge);
        g = lerp(g, wg, wEdge);
        b = lerp(b, wb, wEdge);
      }

      // 4. Mid Mountain / Wave Ridge (#1E40AF -> #1E3A8A)
      const wave2Y =
        0.69 +
        0.05 * Math.cos(nx * Math.PI * 2.0 + 0.5) +
        0.02 * Math.sin(nx * Math.PI * 3.2);
      if (ny >= wave2Y - 0.008) {
        const wEdge = Math.max(0, Math.min(1, (ny - wave2Y) * (size * 0.5)));
        const wr = lerp(30, 23, (ny - wave2Y) / 0.35);
        const wg = lerp(64, 48, (ny - wave2Y) / 0.35);
        const wb = lerp(175, 138, (ny - wave2Y) / 0.35);
        r = lerp(r, wr, wEdge);
        g = lerp(g, wg, wEdge);
        b = lerp(b, wb, wEdge);
      }

      // 5. Front Deep Navy Wave (#152C5B -> #0F1E3D)
      const wave3Y =
        0.79 + 0.04 * Math.sin(nx * Math.PI * 1.8 - 1.1);
      if (ny >= wave3Y - 0.008) {
        const wEdge = Math.max(0, Math.min(1, (ny - wave3Y) * (size * 0.5)));
        const wr = lerp(21, 13, (ny - wave3Y) / 0.25);
        const wg = lerp(44, 27, (ny - wave3Y) / 0.25);
        const wb = lerp(91, 62, (ny - wave3Y) / 0.25);
        r = lerp(r, wr, wEdge);
        g = lerp(g, wg, wEdge);
        b = lerp(b, wb, wEdge);
      }

      buf[idx] = Math.round(r);
      buf[idx + 1] = Math.round(g);
      buf[idx + 2] = Math.round(b);
      buf[idx + 3] = Math.round(alphaMask * 255);
    }
  }

  return encodePNG(size, size, buf);
}

const mipmapSpecs = [
  { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

const resBase = path.resolve(process.cwd(), 'android/app/src/main/res');

for (const spec of mipmapSpecs) {
  const dir = path.join(resBase, spec.folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'ic_launcher.png'),
    renderIcon(spec.launcher, 'rounded_square')
  );
  fs.writeFileSync(
    path.join(dir, 'ic_launcher_round.png'),
    renderIcon(spec.launcher, 'circle')
  );
  fs.writeFileSync(
    path.join(dir, 'ic_launcher_foreground.png'),
    renderIcon(spec.foreground, 'full')
  );
}

// Also generate public web icons
const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(
  path.join(publicDir, 'icon-192.png'),
  renderIcon(192, 'rounded_square')
);
fs.writeFileSync(
  path.join(publicDir, 'icon-512.png'),
  renderIcon(512, 'rounded_square')
);

console.log('Successfully generated all Android mipmap icons and PWA icons for SmartMorning.');
