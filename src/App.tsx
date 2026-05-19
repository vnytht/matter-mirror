import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AppState, Particle, AppMode } from './lib/types';
import { imageToParticles } from './lib/imageToParticles';
import { createDemoShape } from './lib/demoShapes';
import { scatterParticles } from './lib/particlePhysics';
import { ThreeCanvas } from './components/ThreeCanvas';
import { ControlPanel } from './components/ControlPanel';
import { Hud } from './components/Hud';
import { WebcamPreview } from './components/WebcamPreview';
import * as THREE from 'three';

const INITIAL_STATE: AppState = {
  mode: 'assembled',
  particleCount: 0,
  fps: 0,
  gesture: '',
  isWebcamActive: false,
  controls: {
    pointSize: 1.0,
    returnSpeed: 8.0,
    scatterForce: 100,
    damping: 0.85,
    depthScale: 0.5, // default: subtle depth, drag slider to increase
  }
};

// Modes that need a one-shot scatter impulse on entry
const SCATTER_MODES: Partial<Record<AppMode, AppMode>> = {
  explode: 'explode',
  vortex: 'vortex',
  blackhole: 'blackhole',
};

function App() {
  const [appState, setAppState] = useState<AppState>(INITIAL_STATE);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [pinchPoint, setPinchPoint] = useState<THREE.Vector3 | undefined>();

  // Stable refs to avoid stale closures
  const modeRef = useRef(appState.mode);
  const particlesRef = useRef(particles);
  const scatterForceRef = useRef(appState.controls.scatterForce);
  useEffect(() => { modeRef.current = appState.mode; }, [appState.mode]);
  useEffect(() => { particlesRef.current = particles; }, [particles]);
  useEffect(() => { scatterForceRef.current = appState.controls.scatterForce; }, [appState.controls.scatterForce]);

  // ─── Gesture rotation state (ref, NOT useState — zero re-renders) ───────────────────
  // ThreeCanvas reads this directly in its RAF loop each frame.
  // Using React state here would re-render every frame → camera flicker → bad.
  const gestureStateRef = useRef({
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),  // YXZ order = natural yaw + pitch
    prevHandPos: null as THREE.Vector3 | null,   // previous frame hand pos
    isGrabbing: false,
  });
  // Keep objectOffset as state only for reset/demo-shape recentering (changes infrequently)
  const [objectOffset, setObjectOffset] = useState(new THREE.Vector3(0, 0, 0));

  // ─── Unified mode trigger — used by keyboard, gesture, AND panel buttons ────
  // This is the single source of truth for changing modes.
  // It fires scatterParticles() for modes that need an impulse kick.
  const triggerMode = useCallback((newMode: AppMode) => {
    const currentMode = modeRef.current;
    if (newMode === currentMode) return; // already in this mode, no re-kick

    if (newMode === 'assembled') {
      // Just return home — no impulse needed
      setAppState(s => ({ ...s, mode: 'assembled' }));
      return;
    }

    if (SCATTER_MODES[newMode]) {
      // Apply one-shot scatter impulse to a snapshot of current particles
      setParticles(pts => {
        const kicked = [...pts];
        scatterParticles(kicked, newMode, scatterForceRef.current / 100);
        return kicked;
      });
    }

    setAppState(s => ({ ...s, mode: newMode }));
  }, []);

  useEffect(() => {
    handleDemoShape('sphere');

    let frames = 0;
    let lastTime = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const fps = Math.round((frames * 1000) / (now - lastTime));
      setAppState(s => ({ ...s, fps }));
      frames = 0;
      lastTime = now;
    }, 1000);

    const frameLoop = () => { frames++; requestAnimationFrame(frameLoop); };
    const req = requestAnimationFrame(frameLoop);

    return () => { clearInterval(timer); cancelAnimationFrame(req); };
  }, []);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();

      if (e.code === 'Space') {
        e.preventDefault();
        // Toggle: assembled ↔ explode (ascii-girl style)
        triggerMode(modeRef.current === 'assembled' ? 'explode' : 'assembled');
        return;
      }

      const keyMap: Record<string, AppMode> = {
        'c': 'collapse',
        'v': 'vortex',
        'b': 'blackhole',
        'x': 'slice',
        'a': 'assembled',
      };

      if (key === 'r') { handleReset(); return; }
      if (keyMap[key]) triggerMode(keyMap[key]);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerMode]);

  // ─── Gesture handler ──────────────────────────────────────────────────────────
  // Stable callback — gestureStateRef mutations never cause React re-renders,
  // so handleGesture identity stays stable → no camera flicker.
  const handleGesture = useCallback((gesture: string, handWorldPos?: THREE.Vector3) => {
    // Only update gesture label when it actually changes (not every frame)
    setAppState(s => s.gesture === gesture ? s : { ...s, gesture });

    if (handWorldPos) setPinchPoint(handWorldPos);

    // ── Pinch = ROTATE the sculpture ────────────────────────────────────────────
    // Hand delta X → yaw (Y axis), hand delta Y → pitch (X axis)
    // gestureStateRef is mutated directly — no setState → no re-render → no flicker
    if (gesture === 'Pinch' && handWorldPos) {
      const gs = gestureStateRef.current;
      if (!gs.isGrabbing) {
        gs.isGrabbing = true;
        gs.prevHandPos = handWorldPos.clone();
        if (modeRef.current !== 'assembled') {
          setAppState(s => ({ ...s, mode: 'assembled' }));
        }
      }
      if (gs.prevHandPos) {
        const dx = handWorldPos.x - gs.prevHandPos.x;
        const dy = handWorldPos.y - gs.prevHandPos.y;
        const sensitivity = 0.008; // ~1 full rotation per screen width
        gs.rotation.y += dx * sensitivity;
        gs.rotation.x -= dy * sensitivity;
        gs.rotation.x = Math.max(-Math.PI * 0.6, Math.min(Math.PI * 0.6, gs.rotation.x));
      }
      gs.prevHandPos = handWorldPos.clone();
      return;
    }

    if (gestureStateRef.current.isGrabbing && gesture !== 'Pinch') {
      gestureStateRef.current.isGrabbing = false;
      gestureStateRef.current.prevHandPos = null;
    }

    const gestureToMode: Record<string, AppMode> = {
      'Open_Palm':   'explode',
      'Closed_Fist': 'collapse',
      'Victory':     'vortex',
      'Thumb_Up':    'assembled',
      'Thumb_Down':  'blackhole',
      'Pointing_Up': 'slice',
      'ILoveYou':    'blackhole',
    };
    const mappedMode = gestureToMode[gesture];
    if (mappedMode) triggerMode(mappedMode);
  }, [triggerMode]); // gestureStateRef is a ref — intentionally not in deps

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const parts = await imageToParticles(img, 6, appState.controls.depthScale);
      setParticles(parts);
      setAppState(s => ({ ...s, particleCount: parts.length, mode: 'assembled' }));
      gestureStateRef.current.rotation.set(0, 0, 0);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Live depth recompute: when slider changes, update homeZ for all particles
  // and snap them to new depth (assembled mode lerps there smoothly)
  const handleDepthChange = (newDepth: number) => {
    setAppState(s => ({ ...s, controls: { ...s.controls, depthScale: newDepth } }));
    setParticles(pts => pts.map(p => {
      const newHomeZ = (p.brightness - 0.5) * newDepth * 120;
      return { ...p, homeZ: newHomeZ };
    }));
  };

  const handleDemoShape = (shape: 'sphere' | 'cube' | 'flower') => {
    const parts = createDemoShape(shape);
    setParticles(parts);
    setAppState(s => ({ ...s, particleCount: parts.length, mode: 'assembled' }));
  };

  const handleExport = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `mattermirror-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleReset = () => {
    setParticles(pts => pts.map(p => ({
      ...p,
      x: p.homeX, y: p.homeY, z: p.homeZ,
      vx: 0, vy: 0, vz: 0,
      active: true,
    })));
    setObjectOffset(new THREE.Vector3(0, 0, 0));
    gestureStateRef.current.rotation.set(0, 0, 0);
    gestureStateRef.current.isGrabbing = false;
    gestureStateRef.current.prevHandPos = null;
    setAppState(s => ({ ...s, mode: 'assembled' }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white selection:bg-white/30">

      {/* Layer 0: AR video background + hand overlay canvas (inside WebcamPreview) */}
      <WebcamPreview
        isActive={appState.isWebcamActive}
        onGesture={handleGesture}
      />

      {/* Layer 1: subtle dark vignette when camera is active — makes chars readable */}
      {appState.isWebcamActive && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 2,
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 100%)',
          }}
        />
      )}

      {/* Layer 2: Three.js canvas (transparent — particles float over video) */}
      <ThreeCanvas
        particles={particles}
        appState={appState}
        pinchPoint={pinchPoint}
        objectOffset={objectOffset}
        gestureRef={gestureStateRef}
      />

      {/* Layer 10+: HUD and controls */}
      <Hud appState={appState} />

      <ControlPanel
        appState={appState}
        setAppState={setAppState}
        onImageUpload={handleImageUpload}
        onDemoShape={handleDemoShape}
        onExport={handleExport}
        onReset={handleReset}
        onTriggerMode={triggerMode}
        onDepthChange={handleDepthChange}
      />
    </div>
  );
}

export default App;
