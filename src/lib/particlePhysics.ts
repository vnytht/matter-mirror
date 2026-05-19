import type { Particle, AppMode } from './types';
import * as THREE from 'three';

/**
 * Updates particle physics for one frame.
 * Returns updated particle positions/colors — the ThreeCanvas syncs these to meshes.
 * 
 * assembled return uses exponential lerp (exact ascii-girl approach):
 *   t = 1 - exp(-returnSpeed * dt)
 *   position.lerp(home, t)
 * This gives smooth, zero-overshoot convergence.
 */
export function updateParticles(
  particles: Particle[],
  mode: AppMode,
  dt: number,
  params: {
    returnSpeed: number;
    scatterForce: number;
    damping: number;
    turbulence?: number;
    pinchPoint?: THREE.Vector3;
    handActive?: boolean;
  }
) {
  const { returnSpeed, scatterForce, damping, turbulence = 0, pinchPoint, handActive } = params;

  // Exponential lerp factor for smooth return — key ascii-girl technique
  const lerpT = 1 - Math.exp(-returnSpeed * 2 * dt);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.active) continue;

    if (mode === 'assembled') {
      // Exponential lerp to home — no spring velocity, no bounce (ascii-girl style)
      p.x += (p.homeX - p.x) * lerpT;
      p.y += (p.homeY - p.y) * lerpT;
      p.z += (p.homeZ - p.z) * lerpT;
      // Snap when close enough
      if (Math.abs(p.x - p.homeX) < 0.01) p.x = p.homeX;
      if (Math.abs(p.y - p.homeY) < 0.01) p.y = p.homeY;
      if (Math.abs(p.z - p.homeZ) < 0.01) p.z = p.homeZ;
      p.vx = 0; p.vy = 0; p.vz = 0;

    } else if (mode === 'explode') {
      // Turbulence
      if (turbulence > 0) {
        p.vx += (Math.random() - 0.5) * turbulence * 8 * dt;
        p.vy += (Math.random() - 0.5) * turbulence * 8 * dt;
        p.vz += (Math.random() - 0.5) * turbulence * 3 * dt;
      }
      p.vx *= damping;
      p.vy *= damping;
      p.vz *= damping;
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

    } else if (mode === 'collapse') {
      // Pull to hand position (or origin if no hand) — feels like catching particles in fist
      const tx = (params.pinchPoint?.x ?? 0);
      const ty = (params.pinchPoint?.y ?? 0);
      const tz = (params.pinchPoint?.z ?? 0);
      const dist = Math.sqrt((p.x-tx)*(p.x-tx) + (p.y-ty)*(p.y-ty) + (p.z-tz)*(p.z-tz));
      if (dist < 40) {
        // Turbulence when near the fist
        p.vx += (Math.random() - 0.5) * 20 * dt;
        p.vy += (Math.random() - 0.5) * 20 * dt;
        p.vz += (Math.random() - 0.5) * 20 * dt;
      } else {
        p.vx += (tx - p.x) * returnSpeed * 2 * dt;
        p.vy += (ty - p.y) * returnSpeed * 2 * dt;
        p.vz += (tz - p.z) * returnSpeed * 2 * dt;
      }
      p.vx *= damping;
      p.vy *= damping;
      p.vz *= damping;
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

    } else if (mode === 'vortex') {
      // Tangential orbit around Y axis with centripetal pull
      const px = p.x, pz = p.z;
      const orbitRadius = Math.sqrt(px * px + pz * pz) || 1;
      const angularVel = returnSpeed * 0.5;
      const tx = -pz / orbitRadius;
      const tz = px / orbitRadius;
      p.vx += tx * angularVel * orbitRadius * 0.3 * dt;
      p.vz += tz * angularVel * orbitRadius * 0.3 * dt;
      // Pull to natural radius
      const naturalRadius = Math.sqrt(p.homeX * p.homeX + p.homeZ * p.homeZ) || 1;
      p.vx -= (px / orbitRadius) * (orbitRadius - naturalRadius) * 2 * dt;
      p.vz -= (pz / orbitRadius) * (orbitRadius - naturalRadius) * 2 * dt;
      // Vertical lerp to home Y
      p.vy += (p.homeY - p.y) * returnSpeed * dt;
      p.vx *= damping;
      p.vy *= damping;
      p.vz *= damping;
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

    } else if (mode === 'blackhole') {
      // Rush inward, shoot out other side
      const d = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1;
      if (d > 10) {
        p.vx += (-p.x / d) * Math.min(d * 2, 120) * returnSpeed * 0.1 * dt;
        p.vy += (-p.y / d) * Math.min(d * 2, 120) * returnSpeed * 0.1 * dt;
        p.vz += (-p.z / d) * Math.min(d * 2, 120) * returnSpeed * 0.1 * dt;
      } else {
        p.vx += (Math.random() - 0.5) * scatterForce * 0.5 * dt;
        p.vy += (Math.random() - 0.5) * scatterForce * 0.5 * dt;
        p.vz += (Math.random() - 0.5) * scatterForce * 0.5 * dt;
      }
      p.vx *= damping;
      p.vy *= damping;
      p.vz *= damping;
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;

    } else if (mode === 'pinch') {
      // Grab mode: particles hold their home positions (assembled formation).
      // The whole sculpture moves via root.position (objectOffset in ThreeCanvas).
      // DO NOT apply any force toward pinchPoint — that caused the collapse bug.
      p.x += (p.homeX - p.x) * lerpT;
      p.y += (p.homeY - p.y) * lerpT;
      p.z += (p.homeZ - p.z) * lerpT;
      if (Math.abs(p.x - p.homeX) < 0.01) p.x = p.homeX;
      if (Math.abs(p.y - p.homeY) < 0.01) p.y = p.homeY;
      if (Math.abs(p.z - p.homeZ) < 0.01) p.z = p.homeZ;
      p.vx = 0; p.vy = 0; p.vz = 0;

    } else if (mode === 'slice') {
      if (Math.abs(p.y) < 20) {
        p.vx += (Math.random() - 0.5) * scatterForce * 0.2 * dt;
        p.vy += (Math.random() - 0.5) * scatterForce * 0.2 * dt;
        p.vz += (Math.random() - 0.5) * scatterForce * 0.2 * dt;
      } else {
        p.x += (p.homeX - p.x) * lerpT;
        p.y += (p.homeY - p.y) * lerpT;
        p.z += (p.homeZ - p.z) * lerpT;
      }
      p.vx *= damping;
      p.vy *= damping;
      p.vz *= damping;
      p.x += p.vx;
      p.y += p.vy;
      p.z += p.vz;
    }

    // ── Soft boundary sphere ─────────────────────────────────────────────────
    // Applied to ALL non-assembled modes — particles never fly off screen.
    // Acts like an elastic membrane: gentle near boundary, stronger beyond it.
    if (mode !== 'assembled') {
      const MAX_RADIUS = 260;
      const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
      if (dist > MAX_RADIUS) {
        const over = dist - MAX_RADIUS;
        const strength = (over / MAX_RADIUS) * 80; // quadratic-ish restoring force
        p.vx -= (p.x / dist) * strength * dt;
        p.vy -= (p.y / dist) * strength * dt;
        p.vz -= (p.z / dist) * strength * dt;
        // Hard clamp: never more than 10% past boundary
        if (dist > MAX_RADIUS * 1.1) {
          const scale = (MAX_RADIUS * 1.1) / dist;
          p.x *= scale; p.y *= scale; p.z *= scale;
        }
      }
    }
  }
}

/**
 * Apply initial scatter impulse to particles (called once on scatter trigger).
 * Exact ascii-girl approach: one-shot velocity kick, then physics runs free.
 */
export function scatterParticles(
  particles: Particle[],
  mode: AppMode,
  scatterSpeed: number
) {
  const sp = scatterSpeed;

  for (const p of particles) {
    if (mode === 'explode') {
      // Reduced from 200 → 80 so particles stay within the soft boundary
      p.vx = (Math.random() - 0.5) * 80 * sp;
      p.vy = (Math.random() - 0.5) * 80 * sp;
      p.vz = (Math.random() - 0.5) * 30 * sp;

    } else if (mode === 'vortex') {
      const orbitRadius = Math.sqrt(p.homeX * p.homeX + p.homeZ * p.homeZ) || 1;
      const tx = -p.homeZ / orbitRadius;
      const tz = p.homeX / orbitRadius;
      const kick = sp * (0.8 + Math.random() * 0.4) * 20;
      p.vx = tx * kick;
      p.vy = (Math.random() - 0.5) * sp * 5;
      p.vz = tz * kick;

    } else if (mode === 'blackhole') {
      const inX = -p.homeX, inY = -p.homeY, inZ = -p.homeZ;
      const d = Math.sqrt(inX * inX + inY * inY + inZ * inZ) || 1;
      const force = sp * Math.min(d * 2.5, 200);
      p.vx = (inX / d) * force + (Math.random() - 0.5) * sp * 10;
      p.vy = (inY / d) * force + (Math.random() - 0.5) * sp * 10;
      p.vz = (inZ / d) * force;

    } else {
      // Collapse, slice, pinch — no initial kick
      p.vx = 0; p.vy = 0; p.vz = 0;
    }
  }
}
