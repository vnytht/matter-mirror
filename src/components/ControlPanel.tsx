import React from 'react';
import type { AppState, AppMode } from '../lib/types';
import { Upload, Camera, CameraOff, Download, RotateCcw } from 'lucide-react';

interface ControlPanelProps {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDemoShape: (shape: 'sphere' | 'cube' | 'flower') => void;
  onExport: () => void;
  onReset: () => void;
  onTriggerMode: (mode: AppMode) => void;
  onDepthChange: (depth: number) => void; // live homeZ recompute for 3D depth effect
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  appState, setAppState, onImageUpload, onDemoShape, onExport, onReset, onTriggerMode, onDepthChange
}) => {
  return (
    <div className="absolute right-0 top-0 w-64 h-full bg-black/80 border-l border-white/20 p-4 flex flex-col gap-6 overflow-y-auto text-xs z-10 font-mono backdrop-blur-sm">
      <div className="uppercase tracking-widest text-white/50 mb-2">MatterMirror / System</div>
      
      <div className="flex flex-col gap-2">
        <label className="border border-white/30 hover:border-white/80 p-2 flex items-center justify-center gap-2 cursor-pointer transition-colors">
          <Upload size={14} /> Upload Image
          <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
        </label>
        
        <button 
          className={`border p-2 flex items-center justify-center gap-2 transition-colors ${appState.isWebcamActive ? 'border-green-500 text-green-500 hover:bg-green-500/10' : 'border-white/30 hover:border-white/80'}`}
          onClick={() => setAppState(s => ({ ...s, isWebcamActive: !s.isWebcamActive }))}
        >
          {appState.isWebcamActive ? <CameraOff size={14} /> : <Camera size={14} />} 
          {appState.isWebcamActive ? 'Disable Camera' : 'Enable Camera'}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-white/50 mb-1">Demo Shapes</div>
        <div className="flex gap-2">
          {['sphere', 'cube', 'flower'].map(shape => (
            <button 
              key={shape}
              onClick={() => onDemoShape(shape as any)}
              className="border border-white/30 hover:border-white/80 p-1 flex-1 text-center capitalize"
            >
              {shape}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <div className="text-white/50 mb-1">Physics Modes (Keyboard)</div>
        <div className="grid grid-cols-2 gap-2">
          {(['assembled', 'explode', 'collapse', 'vortex', 'blackhole', 'slice'] as AppMode[]).map(m => (
            <button 
              key={m}
              onClick={() => onTriggerMode(m)}
              className={`border p-1 text-center capitalize ${appState.mode === m ? 'bg-white text-black' : 'border-white/30 hover:border-white/80'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-4">
        <div className="text-white/50 mb-1">Tuning</div>
        
        <label className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span>Return Speed</span>
            <span>{appState.controls.returnSpeed.toFixed(1)}</span>
          </div>
          <input type="range" min="0" max="10" step="0.1" value={appState.controls.returnSpeed} 
            onChange={e => setAppState(s => ({ ...s, controls: { ...s.controls, returnSpeed: parseFloat(e.target.value) } }))}
          />
        </label>

        <label className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span>Scatter Force</span>
            <span>{appState.controls.scatterForce.toFixed(0)}</span>
          </div>
          <input type="range" min="0" max="500" step="10" value={appState.controls.scatterForce} 
            onChange={e => setAppState(s => ({ ...s, controls: { ...s.controls, scatterForce: parseFloat(e.target.value) } }))}
          />
        </label>
        
        <label className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span>Damping</span>
            <span>{appState.controls.damping.toFixed(2)}</span>
          </div>
          <input type="range" min="0.8" max="0.99" step="0.01" value={appState.controls.damping}
            onChange={e => setAppState(s => ({ ...s, controls: { ...s.controls, damping: parseFloat(e.target.value) } }))}
          />
        </label>

        {/* ── 3D Depth (ascii-girl effect) ── */}
        <div className="border-t border-white/10 pt-3">
          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-cyan-300">3D Depth ✦</span>
              <span className="text-cyan-300">{appState.controls.depthScale.toFixed(1)}x</span>
            </div>
            <input
              type="range" min="0" max="3" step="0.05"
              value={appState.controls.depthScale}
              onChange={e => onDepthChange(parseFloat(e.target.value))}
              className="accent-cyan-400"
            />
            <div className="text-white/30" style={{fontSize:'9px'}}>
              Drag → to add Z depth. Upload an image + set to 2x for 3D portrait effect.
            </div>
          </label>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-4 border-t border-white/20">
        <button onClick={onReset} className="border border-white/30 hover:border-white/80 p-2 flex justify-center items-center gap-2">
          <RotateCcw size={14} /> Reset Matter
        </button>
        <button onClick={onExport} className="border border-white/30 hover:border-white/80 p-2 flex justify-center items-center gap-2">
          <Download size={14} /> Save Still
        </button>
      </div>
    </div>
  );
};
