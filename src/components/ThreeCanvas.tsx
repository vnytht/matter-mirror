import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Particle, AppState } from '../lib/types';
import { updateParticles } from '../lib/particlePhysics';

interface ThreeCanvasProps {
  particles: Particle[];
  appState: AppState;
  pinchPoint?: THREE.Vector3;
  objectOffset?: THREE.Vector3;
  gestureRef?: React.RefObject<{ rotation: THREE.Euler }>; // live rotation from pinch gesture
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ particles, appState, pinchPoint, objectOffset, gestureRef }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const reqRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());

  // Font reference
  const fontRef = useRef<any>(null);
  const fontLoadedRef = useRef(false);

  // Per-char geometry templates (NOT shared with meshes — cloned for each mesh)
  const geoTemplates = useRef<Map<string, THREE.BufferGeometry>>(new Map());

  // Root group
  const rootRef = useRef<THREE.Group | null>(null);
  // One mesh per particle
  const meshesRef = useRef<THREE.Mesh[]>([]);
  // Which particles version is built
  const builtParticlesRef = useRef<Particle[] | null>(null);

  // ─── Scene init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    // No scene.background — renderer is transparent so webcam shows through (AR mode)

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      5000
    );
    camera.position.set(0, 0, 600);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    renderer.setClearColor(0x000000, 0); // fully transparent — video bg shows through
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    mountRef.current.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    orbit.screenSpacePanning = true;
    orbitRef.current = orbit;

    const root = new THREE.Group();
    scene.add(root);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    rootRef.current = root;

    // Load Helvetiker font (same as ascii-girl)
    const loader = new FontLoader();
    loader.load(
      'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json',
      (font) => {
        fontRef.current = font;
        fontLoadedRef.current = true;

        // Build geometry templates — one per unique char we'll ever render
        // These are only used as templates; we clone() them for each actual mesh
        const charsToCache = [
          '.', ',', "'", '`', '^', '"', ':', ';', 'I', 'l', '!', 'i', '>', '<', '~',
          '+', '_', '-', '?', ']', '[', '}', '{', '1', ')', '(', '|', 't', 'f', 'j',
          'r', 'x', 'n', 'u', 'v', 'c', 'z', 'X', 'Y', 'U', 'J', 'C', 'L', 'Q', '0',
          'O', 'Z', 'm', 'w', 'q', 'p', 'd', 'b', 'k', 'h', 'a', 'o', '*', '#', 'M',
          'W', '&', '8', '%', 'B', '@', '$',
        ];
        for (const ch of charsToCache) {
          try {
            const geo = new TextGeometry(ch, {
              font,
              size: 4.0,        // scaled up to match scene coordinate space
              height: 0.1,      // very thin 3D extrusion — matches ascii-girl feel
              curveSegments: 2, // performance — matches ascii-girl
            });
            geo.center();
            // ascii-girl applies geo.scale(0.6, 1, 1) — condenses horizontally
            geo.scale(0.6, 1.0, 1.0);
            geoTemplates.current.set(ch, geo);
          } catch {
            // skip unsupported chars
          }
        }

        // Force a rebuild of particle meshes now that font is ready
        builtParticlesRef.current = null;
      }
    );

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(reqRef.current);
      orbit.dispose();
      for (const geo of geoTemplates.current.values()) geo.dispose();
      geoTemplates.current.clear();
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // ─── Rebuild meshes when particles change or font loads ─────────────────────
  // We use a polling approach in the render loop so font-load triggers a rebuild.
  // builtParticlesRef === null means "needs rebuild"
  const rebuildMeshes = () => {
    if (!rootRef.current || !fontLoadedRef.current) return;
    if (particles.length === 0) return;
    if (builtParticlesRef.current === particles) return; // already up to date

    const root = rootRef.current;

    // Remove and dispose old meshes
    for (const mesh of meshesRef.current) {
      root.remove(mesh);
      mesh.geometry.dispose(); // safe to dispose — each mesh owns its clone
      (mesh.material as THREE.Material).dispose();
    }
    meshesRef.current = [];

    const fallback = geoTemplates.current.get('.') || geoTemplates.current.get(':');
    if (!fallback) return; // templates not built yet

    const newMeshes: THREE.Mesh[] = [];
    for (const p of particles) {
      const ch = p.char && p.char !== ' ' ? p.char : '.';
      const template = geoTemplates.current.get(ch) || fallback;

      // CRITICAL: clone() the geometry so each mesh owns its own copy
      // Sharing geometry across Mesh instances causes the stretching bug
      const geo = template.clone();

      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(p.r, p.g, p.b),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x, p.y, p.z);
      root.add(mesh);
      newMeshes.push(mesh);
    }

    meshesRef.current = newMeshes;
    builtParticlesRef.current = particles;
  };

  // ─── Render + physics loop ───────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => {
      reqRef.current = requestAnimationFrame(loop);

      // Rebuild if needed (font loaded after particles were set, etc.)
      if (builtParticlesRef.current !== particles) {
        rebuildMeshes();
      }

      const dt = Math.min(clockRef.current.getDelta(), 0.05);

      if (particles.length > 0 && meshesRef.current.length > 0) {
        updateParticles(
          particles,
          appState.mode,
          dt,
          {
            returnSpeed: appState.controls.returnSpeed,
            scatterForce: appState.controls.scatterForce,
            damping: appState.controls.damping,
            pinchPoint,
            handActive: appState.isWebcamActive && (
              appState.gesture === 'Closed_Fist' ||
              appState.gesture === 'Open_Palm' ||
              appState.gesture === 'Pinch' ||
              appState.gesture === 'Victory'
            ),
          }
        );

        // Sync particle state → mesh positions, colors, and billboard toward camera
        const meshes = meshesRef.current;
        const cam = cameraRef.current!;
        for (let i = 0; i < meshes.length && i < particles.length; i++) {
          const p = particles[i];
          const mesh = meshes[i];
          mesh.position.set(p.x, p.y, p.z);
          mesh.lookAt(cam.position); // billboard — always face camera like ascii-girl chars
          (mesh.material as THREE.MeshBasicMaterial).color.setRGB(p.r, p.g, p.b);
        }
      }

      // Apply rotation from pinch gesture (read ref directly — no re-render needed)
      if (rootRef.current && gestureRef?.current) {
        rootRef.current.rotation.copy(gestureRef.current.rotation);
      }

      // Apply object offset (position) — only changes on reset/upload, not every frame
      if (rootRef.current && objectOffset) {
        rootRef.current.position.copy(objectOffset);
      }

      orbitRef.current?.update();

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    reqRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(reqRef.current);
  }, [particles, appState, pinchPoint]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0"
      style={{ cursor: 'grab', zIndex: 3 }}
    />
  );
};
