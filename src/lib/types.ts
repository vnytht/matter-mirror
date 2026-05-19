export type AppMode = 'assembled' | 'explode' | 'collapse' | 'pinch' | 'vortex' | 'blackhole' | 'slice';

export interface Particle {
  homeX: number;
  homeY: number;
  homeZ: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  brightness: number;
  size: number;
  active: boolean;
  // ASCII character to render as a 3D TextGeometry mesh (ascii-girl style)
  char: string;
}

export interface AppState {
  mode: AppMode;
  particleCount: number;
  fps: number;
  gesture: string;
  isWebcamActive: boolean;
  controls: {
    pointSize: number;
    returnSpeed: number;
    scatterForce: number;
    damping: number;
    depthScale: number; // 0–3: multiplies brightness→Z mapping for 3D depth effect
  };
}
