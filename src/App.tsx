/**
 * AutoCAD-Profiler SPA Main Application Component.
 * 100% Client-Side Serverless CAD Profiling, Segmentation, and Metrology Engine.
 * Built for Renault Nissan Automotive R&D Delivery.
 */

import React, { useEffect, useState } from 'react';
import {
  Boxes,
  Cpu,
  Download,
  FileCheck,
  Github,
  Info,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { CADViewer } from './components/CADViewer';
import { EngineeringDashboard } from './components/EngineeringDashboard';
import { FileUploadZone } from './components/FileUploadZone';
import { ReportExportModal } from './components/ReportExportModal';
import { AnalyticalMetrology } from './core/metrology';
import { PartDecompositionEngine } from './core/segmentation';
import {
  AssemblySummary,
  CADModelProfile,
  CADProcessingProgress,
  ComponentProfile,
} from './core/types';
import { CADWorkerClient } from './workers/workerClient';

export const App: React.FC = () => {
  const [modelProfile, setModelProfile] = useState<CADModelProfile | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<CADProcessingProgress | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);

  // Initialize ONNX Web runtime on startup
  useEffect(() => {
    PartDecompositionEngine.initONNX().catch(err => {
      console.warn('Initial ONNX Web setup notice:', err);
    });
  }, []);

  const handleProcessFile = async (file: File) => {
    setIsLoading(true);
    setSelectedPartId(null);
    setProgress({ stage: 'reading', progressPercent: 10, message: `Reading ${file.name}...` });

    const startTime = performance.now();

    try {
      // Step 1: Off-thread parsing via Web Worker
      const { ingestionPath, meshData, executionTimeMs: workerTime } = await CADWorkerClient.parseCADFile(
        file,
        (percent, stage) => {
          setProgress({ stage: 'tessellating', progressPercent: percent, message: stage });
        }
      );

      // Step 2: Part Decomposition across concave boundary seams
      setProgress({
        stage: 'segmenting',
        progressPercent: 70,
        message: 'Decomposing merged solids across concave assembly seams...',
      });
      const parts = PartDecompositionEngine.segmentMesh(meshData);

      // Step 3: Deep Learning classification & exact metrology for each part
      setProgress({
        stage: 'inferring',
        progressPercent: 85,
        message: 'Evaluating Divergence Theorem integrals & ONNX inference...',
      });

      const components: ComponentProfile[] = [];
      for (const part of parts) {
        const compProfile = await PartDecompositionEngine.profileSegment(part);
        components.push(compProfile);
      }

      // Step 4: Overall Assembly Summary
      const bounds = AnalyticalMetrology.computeAABB(meshData.vertices);
      const overallMassProps = AnalyticalMetrology.computeExactMassProperties(
        meshData.vertices,
        meshData.indices
      );

      const totalMass = components.reduce((sum, c) => sum + c.massKg, 0);
      const totalArea = components.reduce((sum, c) => sum + c.surfaceAreaMm2, 0);

      const summary: AssemblySummary = {
        totalPartsDetected: components.length,
        totalBoundingEnvelope: bounds,
        overallCenterOfMass: [
          Math.round(overallMassProps.centroidMm[0] * 100) / 100,
          Math.round(overallMassProps.centroidMm[1] * 100) / 100,
          Math.round(overallMassProps.centroidMm[2] * 100) / 100,
        ],
        totalMassKg: Math.round(totalMass * 10000) / 10000,
        totalVolumeMm3: Math.round(overallMassProps.volumeMm3 * 10) / 10,
        totalSurfaceAreaMm2: Math.round(totalArea * 10) / 10,
      };

      const totalTime = performance.now() - startTime;

      setModelProfile({
        fileName: file.name,
        fileSizeBytes: file.size,
        ingestionPath,
        assemblySummary: summary,
        components,
        rawVertices: meshData.vertices,
        rawNormals: meshData.normals,
        rawIndices: meshData.indices,
        executionTimeMs: totalTime,
      });

      setProgress({
        stage: 'completed',
        progressPercent: 100,
        message: `Profiling complete (${totalTime.toFixed(0)} ms)`,
      });
    } catch (err: any) {
      console.error('File processing error:', err);
      alert(`Failed to profile CAD model: ${err.message || err}`);
    } finally {
      setIsLoading(false);
      setTimeout(() => setProgress(null), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-red-900 selection:text-white">
      {/* ===================================================================== */}
      {/* HEADER NAVBAR                                                         */}
      {/* ===================================================================== */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white font-black shadow-lg shadow-red-900/30">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-tight text-white">AutoCAD-Profiler</h1>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                Wasm SPA
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Renault Nissan Automotive R&D — Serverless CAD Segmentation & Metrology
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>100% Client-Side Private (Zero Backend)</span>
          </div>

          {modelProfile && (
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-md shadow-red-900/30 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Export PDF Report</span>
            </button>
          )}

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-lg bg-slate-900 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors border border-slate-800"
            title="GitHub Repository"
          >
            <Github className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* MAIN BODY                                                             */}
      {/* ===================================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Upload Zone */}
        <FileUploadZone
          onFileSelected={handleProcessFile}
          progress={progress}
          isLoading={isLoading}
        />

        {/* Workspace Display */}
        {modelProfile ? (
          <div className="flex flex-col gap-6 animate-in fade-in duration-300">
            {/* Top Row: 3D Viewport and Quick Metadata */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[520px]">
              {/* 3D Viewport (8 Columns) */}
              <div className="lg:col-span-8 h-[480px] lg:h-auto">
                <CADViewer
                  components={modelProfile.components}
                  selectedPartId={selectedPartId}
                  onSelectPart={setSelectedPartId}
                />
              </div>

              {/* Sidebar: Model Quick Stats & Controls (4 Columns) */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                {/* File Metadata Card */}
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col gap-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">CAD Asset</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {modelProfile.ingestionPath.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-100 truncate" title={modelProfile.fileName}>
                    {modelProfile.fileName}
                  </div>
                  <div className="text-xs text-slate-400 flex justify-between">
                    <span>File Size:</span>
                    <span className="font-mono text-slate-200">
                      {(modelProfile.fileSizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex justify-between">
                    <span>Tessellated Triangles:</span>
                    <span className="font-mono text-slate-200">
                      {(modelProfile.rawIndices.length / 3).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 flex justify-between">
                    <span>Client Execution:</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {modelProfile.executionTimeMs.toFixed(0)} ms
                    </span>
                  </div>
                </div>

                {/* Interactive Sub-Part Palette Selector */}
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-bold text-slate-300 tracking-wider">
                      Decomposed Parts ({modelProfile.components.length})
                    </span>
                    <span className="text-[11px] text-slate-500">Click to isolate</span>
                  </div>

                  <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[300px] pr-1">
                    {modelProfile.components.map((comp) => {
                      const isSelected = selectedPartId === comp.partId;
                      return (
                        <button
                          key={comp.partId}
                          onClick={() => setSelectedPartId(isSelected ? null : comp.partId)}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs font-semibold text-left transition-all border ${
                            isSelected
                              ? 'bg-amber-500/20 text-amber-200 border-amber-500/50 shadow-sm'
                              : 'bg-slate-950/60 text-slate-300 border-slate-800/80 hover:bg-slate-800 hover:text-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border border-white/20 shrink-0"
                              style={{ backgroundColor: comp.color }}
                            />
                            <span className="font-mono">{comp.partId}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            {comp.classification}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Full Analytical Dashboard & BOM */}
            <EngineeringDashboard
              summary={modelProfile.assemblySummary}
              components={modelProfile.components}
              selectedPartId={selectedPartId}
              onSelectPart={setSelectedPartId}
              fileName={modelProfile.fileName}
              executionTimeMs={modelProfile.executionTimeMs}
            />
          </div>
        ) : (
          /* Empty State Placeholder */
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border border-slate-800/60 bg-slate-900/30 rounded-2xl">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4">
              <Boxes className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-bold text-slate-200">No CAD Model Loaded</h3>
            <p className="text-xs text-slate-400 max-w-md mt-1 mb-6">
              Drop an automotive CAD model or select one of the synthetic assembly presets above to inspect the geometry, segment constituents, and generate a metrology BOM.
            </p>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-sky-400" /> ONNX WebGPU / Wasm
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> OpenCASCADE B-Rep Wasm
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" /> jsPDF Engine
              </span>
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* EXPORT PDF MODAL                                                      */}
      {/* ===================================================================== */}
      {modelProfile && (
        <ReportExportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          fileName={modelProfile.fileName}
          summary={modelProfile.assemblySummary}
          components={modelProfile.components}
          executionTimeMs={modelProfile.executionTimeMs}
        />
      )}

      {/* ===================================================================== */}
      {/* FOOTER                                                                */}
      {/* ===================================================================== */}
      <footer className="border-t border-slate-900 px-6 py-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
        <div>AutoCAD-Profiler v2.0 • Renault Nissan Automotive Advanced Engineering</div>
        <div className="text-[11px] text-slate-600">
          Pure Client-Side WebAssembly Architecture — Zero Data Leaves Your Browser
        </div>
      </footer>
    </div>
  );
};
