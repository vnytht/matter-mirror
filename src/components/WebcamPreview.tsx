import React, { useEffect, useRef } from 'react';
import { predictWebcam, initMediaPipe } from '../lib/gestureController';
import * as THREE from 'three';

interface WebcamPreviewProps {
  isActive: boolean;
  onGesture: (gesture: string, handWorldPos?: THREE.Vector3) => void;
}

// Hand landmark connections (MediaPipe 21-point model)
const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],           // thumb
  [0,5],[5,6],[6,7],[7,8],           // index
  [0,9],[9,10],[10,11],[11,12],      // middle
  [0,13],[13,14],[14,15],[15,16],    // ring
  [0,17],[17,18],[18,19],[19,20],    // pinky
  [5,9],[9,13],[13,17],              // palm knuckles
];

// Palm center = average of wrist + 4 knuckles
const PALM_INDICES = [0, 5, 9, 13, 17];

// Gesture hold frames before triggering (anti-flicker)
const HOLD_FRAMES = 8;

// Map MediaPipe normalized coords → Three.js world coords
// Camera sits at z=600 looking at origin; FOV 45° gives ~500 wide at z=0
const toWorldPos = (nx: number, ny: number, nz: number): THREE.Vector3 => ({
  x: (0.5 - nx) * 500,   // flip X (video mirrored)
  y: (0.5 - ny) * 280,   // flip Y (screen Y down, world Y up)
  z: -nz * 150,
} as unknown as THREE.Vector3);

// Lerp between two hex colors by t (0–1)
function lerpColor(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bv})`;
}

interface TriggerAnim {
  x: number; y: number;
  startTime: number;
  type: string; // gesture type
}

export const WebcamPreview: React.FC<WebcamPreviewProps> = ({ isActive, onGesture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const reqRef = useRef<number>(0);
  const initialized = useRef(false);

  // Stable callback ref — avoids camera re-init when parent re-renders
  // This is the FIX for camera flickering: useEffect deps = [isActive] only
  const onGestureRef = useRef(onGesture);
  useEffect(() => { onGestureRef.current = onGesture; }); // always fresh, no effect re-run

  // Gesture hold debounce
  const lastGestureRef = useRef('');
  const holdCounterRef = useRef(0);

  // Pending burst animations
  const triggersRef = useRef<TriggerAnim[]>([]);

  useEffect(() => {
    if (!isActive) {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      cancelAnimationFrame(reqRef.current);
      const cv = overlayRef.current;
      if (cv) cv.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
      onGestureRef.current('');
      return;
    }

    let active = true;

    const setup = async () => {
      if (!initialized.current) {
        await initMediaPipe();
        initialized.current = true;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => { if (active) loop(); };
        }
      } catch (err) {
        console.error('Camera access denied', err);
      }
    };

    const loop = () => {
      if (!active) return;
      reqRef.current = requestAnimationFrame(loop);

      const video = videoRef.current;
      const cv = overlayRef.current;
      if (!cv || !video || video.readyState < 2) return;

      // Match overlay size to window
      if (cv.width !== window.innerWidth || cv.height !== window.innerHeight) {
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;
      }

      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);

      // Run MediaPipe
      const results = predictWebcam(video);
      const hasHand = results && results.gestures.length > 0 && results.landmarks.length > 0;

      if (hasHand) {
        // MediaPipe base gesture (one of 8 built-in categories)
        let gesture = results!.gestures[0][0].categoryName;
        const landmarks = results!.landmarks[0];

        // ── Robust scale-invariant pinch detection ────────────────────────────
        // Problem with raw dist: if hand is far from camera it's small → threshold
        // too tight. Fix: normalize by palm span so detection works at any distance.
        //
        //   palmSpan = distance from index MCP (5) to pinky MCP (17)
        //   pinchRatio = thumbTip-indexTip distance / palmSpan
        //   A real pinch is typically pinchRatio < 0.35
        //
        const thumbTip  = landmarks[4];  // thumb tip
        const indexTip  = landmarks[8];  // index finger tip
        const rawPinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        const palmSpan = Math.hypot(
          landmarks[5].x - landmarks[17].x,  // index MCP → pinky MCP
          landmarks[5].y - landmarks[17].y
        );
        // pinchRatio: 0 = fully closed, ~1 = fingers far apart
        const pinchRatio = palmSpan > 0.01 ? rawPinchDist / palmSpan : 1;

        // Hysteresis thresholds: engage at 0.38, release at 0.60
        // This prevents flickering from resetting the hold counter
        const PINCH_ENGAGE  = 0.38;
        const PINCH_RELEASE = 0.60;
        const wasPinching = lastGestureRef.current === 'Pinch';

        if (pinchRatio < PINCH_ENGAGE || (wasPinching && pinchRatio < PINCH_RELEASE)) {
          gesture = 'Pinch';
        }

        // Palm center (normalized)
        const palmCenter = {
          x: PALM_INDICES.reduce((s, i) => s + landmarks[i].x, 0) / PALM_INDICES.length,
          y: PALM_INDICES.reduce((s, i) => s + landmarks[i].y, 0) / PALM_INDICES.length,
          z: PALM_INDICES.reduce((s, i) => s + landmarks[i].z, 0) / PALM_INDICES.length,
        };

        // Screen position of palm center (mirrored)
        const palmSX = (1 - palmCenter.x) * cv.width;
        const palmSY = palmCenter.y * cv.height;

        // Hold counter — pinch uses fewer frames (2) since it's harder to hold steady
        const effectiveHoldFrames = gesture === 'Pinch' ? 2 : HOLD_FRAMES;
        if (gesture === lastGestureRef.current) {
          holdCounterRef.current = Math.min(holdCounterRef.current + 1, effectiveHoldFrames + 1);
        } else {
          holdCounterRef.current = 1;
          lastGestureRef.current = gesture;
        }
        const charge = Math.min(holdCounterRef.current / effectiveHoldFrames, 1);
        const triggered = holdCounterRef.current === effectiveHoldFrames;

        // Color theme per gesture
        const gestureColor = ({
          'Open_Palm':   '#00ffcc',
          'Closed_Fist': '#ff4466',
          'Victory':     '#aa55ff',
          'Thumb_Up':    '#44ff88',
          'Thumb_Down':  '#ff8800',
          'Pointing_Up': '#4488ff',
          'Pinch':       '#ffdd00',
        } as Record<string, string>)[gesture] ?? '#00ffcc';

        // Skeleton color: teal → gesture color as charge fills
        const skeletonColor = charge < 0.05
          ? 'rgba(0,255,200,0.55)'
          : lerpColor('#00ffc8', gestureColor, charge);
        const alpha = 0.5 + charge * 0.5;

        // Draw hand skeleton lines
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = skeletonColor;
        ctx.globalAlpha = alpha;
        for (const [a, b] of HAND_CONNECTIONS) {
          const la = landmarks[a], lb = landmarks[b];
          ctx.beginPath();
          ctx.moveTo((1 - la.x) * cv.width, la.y * cv.height);
          ctx.lineTo((1 - lb.x) * cv.width, lb.y * cv.height);
          ctx.stroke();
        }

        // Draw joints
        for (let i = 0; i < 21; i++) {
          const lm = landmarks[i];
          const sx = (1 - lm.x) * cv.width;
          const sy = lm.y * cv.height;
          const r = i === 0 ? 6 : (i % 4 === 0 ? 4 : 2.5);
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = triggered ? '#ffffff' : skeletonColor;
          ctx.globalAlpha = alpha;
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // ── Pinch proximity indicator ──────────────────────────────────────────
        // Shows fingertip-to-fingertip proximity as a live color gradient.
        // Also shows pinchRatio so user can calibrate.
        {
          const tSX = (1 - thumbTip.x) * cv.width;
          const tSY = thumbTip.y * cv.height;
          const iSX = (1 - indexTip.x) * cv.width;
          const iSY = indexTip.y * cv.height;
          // proximity: 0=far apart, 1=at engage threshold or below
          const proximity = Math.max(0, Math.min(1, 1 - (pinchRatio - 0.1) / (PINCH_ENGAGE - 0.1)));
          const isPinching = gesture === 'Pinch';

          // Line between fingertips
          ctx.beginPath();
          ctx.moveTo(tSX, tSY);
          ctx.lineTo(iSX, iSY);
          ctx.strokeStyle = isPinching
            ? '#ffdd00'
            : `rgba(255, ${Math.round(220 * proximity)}, 0, ${0.3 + proximity * 0.7})`;
          ctx.lineWidth = isPinching ? 3 : 1.5 + proximity * 2;
          ctx.globalAlpha = 0.35 + proximity * 0.65;
          ctx.stroke();

          // Glow dots — grow as fingers approach
          const dotR = 3 + proximity * 10;
          for (const [sx, sy] of [[tSX, tSY], [iSX, iSY]]) {
            ctx.beginPath();
            ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
            ctx.fillStyle = isPinching
              ? '#ffdd00'
              : `rgba(255, ${Math.round(160 * proximity + 60)}, 0, 0.85)`;
            ctx.globalAlpha = 0.4 + proximity * 0.6;
            ctx.fill();
          }

          // Debug ratio + GRAB label near midpoint
          const midX = (tSX + iSX) / 2;
          const midY = (tSY + iSY) / 2 - 16;
          ctx.font = '10px monospace';
          ctx.globalAlpha = 0.75;
          if (isPinching) {
            ctx.fillStyle = '#ffdd00';
            ctx.fillText('✦ GRAB', midX - 18, midY);
          } else {
            // Show ratio so user can see how close they are (target: < 0.38)
            ctx.fillStyle = proximity > 0.5 ? '#ffaa00' : 'rgba(255,255,255,0.4)';
            ctx.fillText(`${pinchRatio.toFixed(2)} / 0.38`, midX - 22, midY);
          }
          ctx.globalAlpha = 1;
        }

        // Charging arc around wrist
        const wrist = landmarks[0];
        const wristSX = (1 - wrist.x) * cv.width;
        const wristSY = wrist.y * cv.height;
        const arcR = 28;

        // Background track
        ctx.beginPath();
        ctx.arc(wristSX, wristSY, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Filled arc
        if (charge > 0) {
          ctx.beginPath();
          ctx.arc(wristSX, wristSY, arcR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
          ctx.strokeStyle = gestureColor;
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.85;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Gesture label near wrist
        if (charge > 0.1) {
          ctx.font = '10px monospace';
          ctx.fillStyle = gestureColor;
          ctx.globalAlpha = charge;
          ctx.fillText(gesture.replace('_', ' ').toUpperCase(), wristSX + arcR + 6, wristSY + 4);
          ctx.globalAlpha = 1;
        }

        // Compute world position of palm every frame (needed for continuous drag)
        const worldPos = new THREE.Vector3(
          (0.5 - palmCenter.x) * 500,
          (0.5 - palmCenter.y) * 280,
          -palmCenter.z * 150
        );

        // Fire gesture: ONCE at threshold crossing (for impulse), then EVERY frame after
        // (so pinch-drag continuously updates the hand position in App.tsx)
        if (triggered) {
          onGestureRef.current(gesture, worldPos);
          // Queue burst animation only on the threshold frame
          triggersRef.current.push({ x: palmSX, y: palmSY, startTime: performance.now(), type: gesture });
        } else if (holdCounterRef.current > HOLD_FRAMES) {
          // Continue firing every frame while gesture is held (for smooth grab-drag)
          onGestureRef.current(gesture, worldPos);
        }

      } else {
        // No hand — reset
        if (lastGestureRef.current !== '') {
          lastGestureRef.current = '';
          holdCounterRef.current = 0;
        }
      }

      // Draw burst animations
      const now = performance.now();
      const BURST_DUR = 700;
      triggersRef.current = triggersRef.current.filter(a => now - a.startTime < BURST_DUR);
      for (const anim of triggersRef.current) {
        const t = (now - anim.startTime) / BURST_DUR; // 0→1
        const ringCount = 3;
        const isCollapse = anim.type === 'Closed_Fist' || anim.type === 'Thumb_Down';
        const color = isCollapse ? '#ff4466' : '#00ffcc';

        for (let ri = 0; ri < ringCount; ri++) {
          const ringT = (t + ri / ringCount) % 1;
          const r = isCollapse
            ? (1 - ringT) * 120   // contracting
            : ringT * 140;         // expanding
          const opacity = isCollapse
            ? ringT * (1 - t)
            : (1 - ringT) * (1 - t * 0.5);

          ctx.beginPath();
          ctx.arc(anim.x, anim.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = opacity;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };

    setup();
    return () => {
      active = false;
      cancelAnimationFrame(reqRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [isActive]); // IMPORTANT: onGesture intentionally omitted — use onGestureRef to avoid camera re-init on every render

  return (
    <>
      {/* AR video passthrough — fullscreen behind everything */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{
          transform: 'scaleX(-1)',
          zIndex: 1,
          opacity: isActive ? 0.55 : 0,
          transition: 'opacity 0.6s ease',
        }}
      />

      {/* Hand tracking overlay */}
      <canvas
        ref={overlayRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 6 }}
      />
    </>
  );
};
