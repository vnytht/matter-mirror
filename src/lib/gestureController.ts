import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

let gestureRecognizer: GestureRecognizer | null = null;
let runningMode: 'IMAGE' | 'VIDEO' = 'VIDEO';
let lastVideoTime = -1;

export async function initMediaPipe() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  
  gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
      delegate: "GPU"
    },
    runningMode: runningMode,
    numHands: 1
  });
  
  return gestureRecognizer;
}

export function predictWebcam(video: HTMLVideoElement) {
  if (!gestureRecognizer) return null;
  
  const startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    const results = gestureRecognizer.recognizeForVideo(video, startTimeMs);
    return results;
  }
  return null;
}
