# MatterMirror

Turn any image into a hand-controlled 3D ASCII matter sculpture.

## Pitch
MatterMirror explores embodied interaction for AI-era interfaces: digital objects become physically inspectable, compressible, breakable, and reconstructable through pure hand gestures. It requires zero paid APIs, runs completely local, and relies entirely on frontend computer vision (MediaPipe) and WebGL (Three.js).

## How to use

1. **Upload an image:** Click "Upload Image" in the right-side control panel.
2. **Enable hand controls:** Click "Enable Camera".
3. **Gestures:**
   - **Open Palm:** Explode the sculpture like a Big Bang.
   - **Closed Fist:** Compress and collapse the object inward, causing it to vibrate under pressure.
   - **Pinch:** Create a gravity attractor at your hand position, pulling particles toward your fingers.
   - **Victory / Scissors (✌️):** Slice through the matter horizontally.
   - **No hand detected:** The particles slowly return to their original image structure.

### Keyboard Fallbacks
If you don't have a webcam or prefer manual controls:
- **Space:** Toggle Explode / Reassemble
- **C:** Collapse
- **V:** Vortex
- **B:** Black Hole
- **X:** Cut Slice
- **R:** Reset Matter
- **Drag Mouse:** Orbit the 3D scene
- **Scroll:** Zoom in/out

## Tech Stack
- **Framework:** Vite + React + TypeScript
- **Styling:** Tailwind CSS v4
- **3D Graphics:** Three.js (Custom Shaders + BufferGeometry for high performance)
- **Computer Vision:** `@mediapipe/tasks-vision` (running completely in the browser via WebAssembly)

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```

## Future Extensions
- Add true ASCII character mapping instead of glowing glyphs.
- Depth maps via an ML monocular depth model for better 3D reconstruction.
- Implement hand tracking velocity to allow "throwing" or "swiping" particles.
