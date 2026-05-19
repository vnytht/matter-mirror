import type { Particle } from './types';

// ASCII ramp from darkest (sparse) to brightest (dense) — matches ascii-girl aesthetic
// Chars are ordered by visual "weight" so dark pixels get sparse chars, bright get dense
const ASCII_RAMP = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';

function brightnessToChar(b: number): string {
  // b is 0–255; map to ramp index
  const idx = Math.floor((b / 255) * (ASCII_RAMP.length - 1));
  const char = ASCII_RAMP[idx];
  // Avoid returning space (invisible) — clamp to at least '.'
  return char === ' ' ? '.' : char;
}

export async function imageToParticles(
  imageSource: HTMLImageElement,
  step: number = 6,
  depthScale: number = 0.5  // 0=flat, 3=dramatic 3D sculpture (ascii-girl effect)
): Promise<Particle[]> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  // Downscale image to a reasonable bounding box to avoid too many particles
  // ascii-girl uses ~7,800; we target ~2,000–3,000 for performance
  const MAX_WIDTH = 300;
  let width = imageSource.width;
  let height = imageSource.height;

  if (width > MAX_WIDTH) {
    height = Math.floor(height * (MAX_WIDTH / width));
    width = MAX_WIDTH;
  }

  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(imageSource, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const particles: Particle[] = [];

  // Center offsets — same coordinate convention as ascii-girl
  const offsetX = width / 2;
  const offsetY = height / 2;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      // Skip transparent pixels
      if (a < 128) continue;

      // Calculate brightness (0-255)
      const brightness = (r * 0.299 + g * 0.587 + b * 0.114); // perceptual luminance

      // Skip near-black pixels (like ascii-girl which skips background)
      if (brightness < 12) continue;

      // Map brightness to ASCII character
      const char = brightnessToChar(brightness);

      // Map pixel positions to Three.js world space (Y is up, invert Y)
      const homeX = (x - offsetX) * 1.4; // slight horizontal stretch like ascii-girl's 0.6 x-scale on chars
      const homeY = -(y - offsetY) * 1.4;
      // Z depth from brightness — the "ascii-girl 3D depth" effect
      // (brightness - 0.5) maps to [-0.5, +0.5]; multiply by depthScale * 120 for range
      // At depthScale=0.5: ±30 units (subtle). At depthScale=2.0: ±120 units (dramatic 3D face)
      const homeZ = (brightness / 255 - 0.5) * depthScale * 120;

      particles.push({
        homeX,
        homeY,
        homeZ,
        x: homeX,
        y: homeY,
        z: homeZ,
        vx: 0,
        vy: 0,
        vz: 0,
        r: r / 255,
        g: g / 255,
        b: b / 255,
        brightness: brightness / 255,
        size: 1.0,
        active: true,
        char,
      });
    }
  }

  return particles;
}
