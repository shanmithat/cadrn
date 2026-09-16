/**
 * File Upload Zone & Pre-loaded CAD Demonstrator.
 * Supports drag-and-drop for STEP, IGES, STL, OBJ, and provides built-in
 * synthetic merged CAD models for instant testing.
 */

import React, { useRef, useState } from 'react';
import { Box, FileUp, Sparkles, UploadCloud } from 'lucide-react';
import { CADProcessingProgress } from '../core/types';

interface FileUploadZoneProps {
  onFileSelected: (file: File) => void;
  progress: CADProcessingProgress | null;
  isLoading: boolean;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onFileSelected,
  progress,
  isLoading,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  // Helper to generate in-memory synthetic CAD models for instant demo
  const loadSyntheticModel = (type: 'bracket_assembly' | 'flange' | 'bolt') => {
    let text = '';
    let fileName = '';

    if (type === 'bracket_assembly') {
      fileName = 'merged_bracket_assembly.stl';
      // Generate synthetic ASCII STL with two joined rectangular blocks meeting at a 90-degree concave seam
      text = generateSyntheticBracketSTL();
    } else if (type === 'flange') {
      fileName = 'automotive_flange.stl';
      text = generateSyntheticFlangeSTL();
    } else {
      fileName = 'fastener_bolt_m12.stl';
      text = generateSyntheticBoltSTL();
    }

    const blob = new Blob([text], { type: 'application/sla' });
    const file = new File([blob], fileName, { type: 'application/sla' });
    onFileSelected(file);
  };

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-red-500 bg-red-950/20 shadow-lg shadow-red-950/40'
            : 'border-slate-700 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-500'
        } ${isLoading ? 'pointer-events-none opacity-80' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".step,.stp,.iges,.igs,.stl,.obj"
          onChange={handleFileChange}
          className="hidden"
        />

        {isLoading && progress ? (
          <div className="w-full max-w-sm flex flex-col items-center gap-3 py-2 animate-in fade-in">
            <div className="flex justify-between w-full text-xs font-semibold text-slate-300">
              <span className="text-red-400 font-bold uppercase tracking-wider">{progress.stage}</span>
              <span className="font-mono text-slate-400">{progress.progressPercent}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-600 to-amber-500 transition-all duration-300 ease-out"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 animate-pulse text-center">{progress.message}</p>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-3">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-200">
              Drop Raw 3D CAD File Here, or <span className="text-red-500 underline">Browse</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Supports STEP, IGES (OpenCASCADE Wasm B-Rep), STL, and OBJ (100% Client-Side)
            </p>
          </>
        )}
      </div>

      {/* Preset Demo Models for Instant Testing */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Test Synthetic Automotive Assemblies:
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => loadSyntheticModel('bracket_assembly')}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Merged Bracket (2-Part)
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => loadSyntheticModel('flange')}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Automotive Flange
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => loadSyntheticModel('bolt')}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Fastener Bolt M12
          </button>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Synthetic STL Generators for Instant In-Browser Testing
// =============================================================================

function generateBoxSTL(x0: number, y0: number, z0: number, dx: number, dy: number, dz: number): string {
  const p = [
    [x0, y0, z0], [x0 + dx, y0, z0], [x0 + dx, y0 + dy, z0], [x0, y0 + dy, z0],
    [x0, y0, z0 + dz], [x0 + dx, y0, z0 + dz], [x0 + dx, y0 + dy, z0 + dz], [x0, y0 + dy, z0 + dz]
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], // bottom
    [4, 5, 6], [4, 6, 7], // top
    [0, 1, 5], [0, 5, 4], // front
    [2, 3, 7], [2, 7, 6], // back
    [0, 4, 7], [0, 7, 3], // left
    [1, 2, 6], [1, 6, 5]  // right
  ];

  let stl = '';
  for (const [i0, i1, i2] of faces) {
    stl += `facet normal 0 0 1\nouter loop\n`;
    stl += `vertex ${p[i0][0]} ${p[i0][1]} ${p[i0][2]}\n`;
    stl += `vertex ${p[i1][0]} ${p[i1][1]} ${p[i1][2]}\n`;
    stl += `vertex ${p[i2][0]} ${p[i2][1]} ${p[i2][2]}\n`;
    stl += `endloop\nendfacet\n`;
  }
  return stl;
}

function generateSyntheticBracketSTL(): string {
  let stl = 'solid merged_bracket\n';
  // Horizontal base plate (60 x 30 x 10)
  stl += generateBoxSTL(0, 0, 0, 60, 30, 10);
  // Vertical upright arm (20 x 30 x 40) joined onto the base plate, forming sharp 90-degree concave seam
  stl += generateBoxSTL(40, 0, 10, 20, 30, 40);
  stl += 'endsolid merged_bracket\n';
  return stl;
}

function generateSyntheticFlangeSTL(): string {
  let stl = 'solid automotive_flange\n';
  // Disc approximated by 32 segments
  const r = 40, h = 8, segs = 32;
  for (let i = 0; i < segs; i++) {
    const a1 = (i * 2 * Math.PI) / segs;
    const a2 = ((i + 1) * 2 * Math.PI) / segs;
    const x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
    const x2 = r * Math.cos(a2), y2 = r * Math.sin(a2);

    // Top face
    stl += `facet normal 0 0 1\nouter loop\nvertex 0 0 ${h}\nvertex ${x1} ${y1} ${h}\nvertex ${x2} ${y2} ${h}\nendloop\nendfacet\n`;
    // Bottom face
    stl += `facet normal 0 0 -1\nouter loop\nvertex 0 0 0\nvertex ${x2} ${y2} 0\nvertex ${x1} ${y1} 0\nendloop\nendfacet\n`;
    // Side
    stl += `facet normal ${Math.cos(a1)} ${Math.sin(a1)} 0\nouter loop\nvertex ${x1} ${y1} 0\nvertex ${x2} ${y2} 0\nvertex ${x2} ${y2} ${h}\nendloop\nendfacet\n`;
    stl += `facet normal ${Math.cos(a1)} ${Math.sin(a1)} 0\nouter loop\nvertex ${x1} ${y1} 0\nvertex ${x2} ${y2} ${h}\nvertex ${x1} ${y1} ${h}\nendloop\nendfacet\n`;
  }
  stl += 'endsolid automotive_flange\n';
  return stl;
}

function generateSyntheticBoltSTL(): string {
  let stl = 'solid fastener_bolt\n';
  // Shaft cylinder (radius 6, height 50)
  const r = 6, h = 50, segs = 24;
  for (let i = 0; i < segs; i++) {
    const a1 = (i * 2 * Math.PI) / segs;
    const a2 = ((i + 1) * 2 * Math.PI) / segs;
    const x1 = r * Math.cos(a1), y1 = r * Math.sin(a1);
    const x2 = r * Math.cos(a2), y2 = r * Math.sin(a2);

    stl += `facet normal 0 0 -1\nouter loop\nvertex 0 0 0\nvertex ${x2} ${y2} 0\nvertex ${x1} ${y1} 0\nendloop\nendfacet\n`;
    stl += `facet normal 0 0 0\nouter loop\nvertex ${x1} ${y1} 0\nvertex ${x2} ${y2} 0\nvertex ${x2} ${y2} ${h}\nendloop\nendfacet\n`;
    stl += `facet normal 0 0 0\nouter loop\nvertex ${x1} ${y1} 0\nvertex ${x2} ${y2} ${h}\nvertex ${x1} ${y1} ${h}\nendloop\nendfacet\n`;
  }
  // Hex head at top (radius 12, height 10)
  stl += generateBoxSTL(-10, -10, h, 20, 20, 10);
  stl += 'endsolid fastener_bolt\n';
  return stl;
}
