import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

import type { GestureRecognizerResult } from '@mediapipe/tasks-vision';

let gestureRecognizer: GestureRecognizer | null = null;
let runningMode: 'IMAGE' | 'VIDEO' = 'VIDEO';
let lastVideoTime = -1;
let lastResult: GestureRecognizerResult | null = null;

const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

export async function initMediaPipe() {
  // Use locally-bundled WASM so the binary version always matches the JS API version.
  // Previously pointed at CDN @0.10.3 while the installed package was @0.10.35 — mismatch
  // caused silent recognizer failures.
  const vision = await FilesetResolver.forVisionTasks("/mediapipe-wasm");

  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" as const },
    runningMode: runningMode,
    numHands: 1,
  };

  try {
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, options);
  } catch {
    // GPU delegate unavailable on this device/browser — fall back to CPU.
    console.warn('[MatterMirror] GPU delegate failed, retrying with CPU.');
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" as const },
    });
  }

  return gestureRecognizer;
}

export function predictWebcam(video: HTMLVideoElement) {
  if (!gestureRecognizer) return null;

  const startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    lastResult = gestureRecognizer.recognizeForVideo(video, startTimeMs);
  }
  // Return last cached result so the hold counter keeps incrementing on RAF frames
  // that arrive between video frames (RAF=60fps, camera=30fps). Previously returning
  // null here caused the hold counter to reset every other frame, preventing triggers.
  return lastResult;
}
