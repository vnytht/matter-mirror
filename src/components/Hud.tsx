import React from 'react';
import type { AppState } from '../lib/types';

interface HudProps {
  appState: AppState;
}

export const Hud: React.FC<HudProps> = ({ appState }) => {
  return (
    <div className="absolute left-4 top-4 z-10 font-mono text-[10px] sm:text-xs text-white/80 select-none pointer-events-none">
      <div className="flex flex-col gap-1">
        <div className="text-white font-bold tracking-widest uppercase mb-2">MatterMirror</div>
        <div className="flex gap-4">
          <span className="text-white/50 w-20">STATUS</span>
          <span className="text-green-400">LIVE / LOCAL</span>
        </div>
        <div className="flex gap-4">
          <span className="text-white/50 w-20">PARTICLES</span>
          <span>{appState.particleCount.toLocaleString()}</span>
        </div>
        <div className="flex gap-4">
          <span className="text-white/50 w-20">MODE</span>
          <span className="uppercase text-yellow-200">{appState.mode}</span>
        </div>
        <div className="flex gap-4">
          <span className="text-white/50 w-20">GESTURE</span>
          <span className="uppercase text-cyan-300">{appState.isWebcamActive ? appState.gesture || 'NONE' : 'DISABLED'}</span>
        </div>
        <div className="flex gap-4">
          <span className="text-white/50 w-20">FPS</span>
          <span>{appState.fps}</span>
        </div>
      </div>

      {/* Scanlines / Decoration */}
      <div className="mt-8 border-l border-white/20 pl-4 py-2">
        {appState.isWebcamActive ? (
          <>
            <div className="text-white/50 mb-1 uppercase tracking-widest" style={{fontSize: '9px'}}>Gestures</div>
            <div className="text-white/30">✋ Open Palm = Explode</div>
            <div className="text-white/30">✊ Closed Fist = Collapse</div>
            <div className="text-white/30">✌️ Victory = Vortex</div>
            <div className="text-white/30">👍 Thumb Up = Assemble</div>
            <div className="text-white/30">👇 Thumb Down = Black Hole</div>
            <div className="text-white/30">☝️ Pointing Up = Slice</div>
            <div className="text-white/30 mt-2">Hold gesture 6 frames to trigger</div>
          </>
        ) : (
          <>
            <div className="text-white/30">Upload an image.</div>
            <div className="text-white/30">Enable camera.</div>
            <div className="text-white/30 mt-2">Space = Explode</div>
            <div className="text-white/30">C = Collapse</div>
            <div className="text-white/30">V = Vortex</div>
            <div className="text-white/30">B = Black Hole</div>
            <div className="text-white/30">X = Cut Slice</div>
            <div className="text-white/30">Drag = Orbit</div>
          </>
        )}
      </div>
    </div>
  );
};
