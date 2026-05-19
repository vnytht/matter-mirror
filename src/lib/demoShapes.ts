import type { Particle } from './types';

// A short ramp used for demo shapes — we want a mix of chars for visual variety
const DEMO_CHARS = ['.', ',', ':', ';', '|', '(', ')', '[', ']', '{', '}', '#', '@', '*', '+'];

function randomChar(): string {
  return DEMO_CHARS[Math.floor(Math.random() * DEMO_CHARS.length)];
}

export function createDemoShape(type: 'sphere' | 'cube' | 'flower'): Particle[] {
  const particles: Particle[] = [];
  const count = 2500;
  
  for (let i = 0; i < count; i++) {
    let homeX = 0, homeY = 0, homeZ = 0;
    let r = 1, g = 1, b = 1, brightness = 1;

    if (type === 'sphere') {
      // Fibonacci sphere — evenly distributed on surface
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      const radius = 120;
      homeX = radius * Math.cos(theta) * Math.sin(phi);
      homeY = radius * Math.sin(theta) * Math.sin(phi);
      homeZ = radius * Math.cos(phi);
      // Blue-white gradient like original ascii-girl default
      r = Math.random() * 0.4 + 0.6;
      g = Math.random() * 0.4 + 0.6;
      b = 1.0;
    } else if (type === 'cube') {
      homeX = (Math.random() - 0.5) * 200;
      homeY = (Math.random() - 0.5) * 200;
      homeZ = (Math.random() - 0.5) * 200;
      // Green tones
      r = 0.4; g = 1.0; b = 0.5;
    } else if (type === 'flower') {
      // Fermat spiral
      const t = i * 0.05;
      const rad = Math.sqrt(i) * 4;
      homeX = Math.cos(t) * rad;
      homeY = Math.sin(t) * rad;
      homeZ = (Math.random() - 0.5) * 30;
      // Pink/magenta
      r = 1.0; g = 0.2; b = 0.8;
    }

    brightness = (r + g + b) / 3;

    particles.push({
      homeX, homeY, homeZ,
      x: homeX, y: homeY, z: homeZ,
      vx: 0, vy: 0, vz: 0,
      r, g, b,
      brightness,
      size: 1.0,
      active: true,
      char: randomChar(),
    });
  }
  
  return particles;
}
