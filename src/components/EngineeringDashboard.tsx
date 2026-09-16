/**
 * Executive Renault Nissan Engineering Dashboard & BOM Table.
 * Presents assembly-level metrology KPIs, interactive Bill of Materials,
 * and individual component engineering profiles with DFM audit checks.
 */

import React from 'react';
import {
  AlertTriangle,
  Binary,
  Boxes,
  CheckCircle2,
  Compass,
  Cpu,
  FileSpreadsheet,
  Gauge,
  Layers,
  Scale,
  Sparkles,
  Tag,
  Wrench,
} from 'lucide-react';
import { AssemblySummary, ComponentProfile } from '../core/types';

interface EngineeringDashboardProps {
  summary: AssemblySummary;
  components: ComponentProfile[];
  selectedPartId: string | null;
  onSelectPart: (partId: string | null) => void;
  fileName: string;
  executionTimeMs: number;
}

export const EngineeringDashboard: React.FC<EngineeringDashboardProps> = ({
  summary,
  components,
  selectedPartId,
  onSelectPart,
  fileName,
  executionTimeMs,
}) => {
  const selectedComp = components.find(c => c.partId === selectedPartId);

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE METROLOGY SUMMARY CARDS                                     */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Parts Count */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Parts Detected</span>
            <Boxes className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-100">{summary.totalPartsDetected}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Concavity boundary partitions</div>
          </div>
        </div>

        {/* KPI 2: Total Mass */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Total Mass</span>
            <Scale className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-100">{summary.totalMassKg.toFixed(3)} kg</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Standard Steel: 7,850 kg/m³</div>
          </div>
        </div>

        {/* KPI 3: Total Volume */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Total Volume</span>
            <Gauge className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-100">
              {(summary.totalVolumeMm3 / 1000).toFixed(1)} cm³
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {summary.totalVolumeMm3.toLocaleString()} mm³
            </div>
          </div>
        </div>

        {/* KPI 4: Total Surface Area */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Surface Area</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-100">
              {(summary.totalSurfaceAreaMm2 / 10000).toFixed(2)} dm²
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              {summary.totalSurfaceAreaMm2.toLocaleString()} mm²
            </div>
          </div>
        </div>
      </div>

      {/* Center of Mass and Bounding Box Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-lg p-3 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-red-500" />
            <span className="font-semibold text-slate-300">Assembly Center of Mass:</span>
          </div>
          <span className="font-mono text-slate-200">
            [{summary.overallCenterOfMass.map(v => v.toFixed(1)).join(', ')}] mm
          </span>
        </div>

        <div className="bg-slate-900/50 border border-slate-800/80 rounded-lg p-3 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-sky-400" />
            <span className="font-semibold text-slate-300">Bounding Box Envelope (LxWxH):</span>
          </div>
          <span className="font-mono text-slate-200">
            {summary.totalBoundingEnvelope.dimensions.map(v => v.toFixed(1)).join(' × ')} mm
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. BILL OF MATERIALS (BOM) TABLE                                         */}
      {/* ========================================================================= */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/90">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Assembly Bill of Materials (BOM)
            </h3>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-semibold">
              {components.length} Items
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Processed in <span className="font-mono text-emerald-400 font-bold">{executionTimeMs.toFixed(0)} ms</span> (Zero Server Overhead)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                <th className="p-3">Part ID</th>
                <th className="p-3">Classification (AI)</th>
                <th className="p-3">Manufacturing</th>
                <th className="p-3">OEM Catalog Match (BOM)</th>
                <th className="p-3 text-right">Volume (mm³)</th>
                <th className="p-3 text-right">Mass (kg)</th>
                <th className="p-3 text-right">A/V Ratio</th>
                <th className="p-3 text-center">DFM Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {components.map((comp) => {
                const isSelected = selectedPartId === comp.partId;
                return (
                  <tr
                    key={comp.partId}
                    onClick={() => onSelectPart(isSelected ? null : comp.partId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-200 font-medium'
                        : 'hover:bg-slate-800/40 text-slate-300'
                    }`}
                  >
                    <td className="p-3 flex items-center gap-2 font-mono font-bold">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: comp.color }}
                      />
                      {comp.partId}
                    </td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {comp.classification}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {comp.manufacturingProcess}
                      </span>
                    </td>
                    <td className="p-3">
                      {comp.oemMatch ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-emerald-400 font-semibold">{comp.oemMatch.partNumber}</span>
                          <span className="text-[10px] bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/60">
                            {comp.oemMatch.similarityPercent}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono">{comp.volumeMm3.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono">{comp.massKg.toFixed(4)}</td>
                    <td className="p-3 text-right font-mono">{comp.areaToVolumeRatio.toFixed(3)}</td>
                    <td className="p-3 text-center">
                      {comp.dfmWarnings.length > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          {comp.dfmWarnings.length} Flags
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Pass
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SELECTED COMPONENT METROLOGY DEEP-DIVE                                 */}
      {/* ========================================================================= */}
      {selectedComp && (
        <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-5 shadow-2xl flex flex-col gap-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <span
                className="w-4 h-4 rounded-full border border-white/40"
                style={{ backgroundColor: selectedComp.color }}
              />
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Component Engineering Metrology: <span className="font-mono text-amber-400">{selectedComp.partId}</span>
              </h3>
            </div>
            <button
              onClick={() => onSelectPart(null)}
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Deselect
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Column 1: Physical Metrology */}
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 flex flex-col gap-2">
              <div className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Mass Properties (Exact)</div>
              <div className="flex justify-between">
                <span className="text-slate-400">Volume:</span>
                <span className="font-mono font-bold text-slate-200">{selectedComp.volumeMm3.toLocaleString()} mm³</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Surface Area:</span>
                <span className="font-mono font-bold text-slate-200">{selectedComp.surfaceAreaMm2.toLocaleString()} mm²</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Mass (Steel):</span>
                <span className="font-mono font-bold text-emerald-400">{selectedComp.massKg.toFixed(4)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Facets Count:</span>
                <span className="font-mono text-slate-300">{selectedComp.faceCount} triangles</span>
              </div>
            </div>

            {/* Column 2: Inertia & OBB */}
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 flex flex-col gap-2">
              <div className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">OBB & Principal Moments</div>
              <div className="flex justify-between">
                <span className="text-slate-400">OBB (LxWxH):</span>
                <span className="font-mono text-slate-200">
                  {selectedComp.boundingBoxObb.dimensions.map(d => d.toFixed(1)).join(' × ')} mm
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Center of Mass:</span>
                <span className="font-mono text-slate-200">
                  [{selectedComp.centroidMm.map(c => c.toFixed(1)).join(', ')}]
                </span>
              </div>
              <div className="text-slate-400">Moments [I₁, I₂, I₃]:</div>
              <div className="font-mono text-[11px] text-purple-300 bg-slate-900 p-1.5 rounded">
                [{selectedComp.principalMoments.map(m => m.toExponential(2)).join(', ')}] kg·mm²
              </div>
            </div>

            {/* Column 3: DFM & Manufacturing */}
            <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/80 flex flex-col gap-2">
              <div className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">DFM Audit & Classification</div>
              <div className="flex justify-between">
                <span className="text-slate-400">Classification:</span>
                <span className="font-semibold text-indigo-300">{selectedComp.classification}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Inferred Process:</span>
                <span className="font-semibold text-amber-300">{selectedComp.manufacturingProcess}</span>
              </div>

              {selectedComp.dfmWarnings.length > 0 ? (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="font-bold text-red-400 text-[10px] uppercase">DFM Warnings:</span>
                  {selectedComp.dfmWarnings.map((w, idx) => (
                    <div key={idx} className="text-[11px] text-red-300 bg-red-950/40 border border-red-800/50 p-1.5 rounded">
                      ⚠️ {w}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-emerald-400 flex items-center gap-1.5 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  Passes standard automotive tooling rules.
                </div>
              )}
            </div>
          </div>

          {/* AI/ML Multi-Task Profiling & OEM BOM Metric Match */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1 border-t border-slate-800/80">
            {/* OEM Catalog Match */}
            <div className="bg-slate-950/80 p-3.5 rounded-lg border border-emerald-500/30 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div className="font-bold text-emerald-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Renault-Nissan OEM BOM Match (512-D Zero-Shot)
                </div>
                {selectedComp.oemMatch && (
                  <span className="bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded text-[11px] border border-emerald-500/40">
                    {selectedComp.oemMatch.similarityPercent}% Match
                  </span>
                )}
              </div>
              {selectedComp.oemMatch ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-400">Part Number:</span>
                    <span className="font-mono font-bold text-emerald-300 text-sm">
                      {selectedComp.oemMatch.partNumber}
                    </span>
                  </div>
                  <div className="text-slate-300 text-[11px] leading-relaxed">
                    {selectedComp.oemMatch.description}
                  </div>
                  <div className="flex justify-between text-[11px] pt-1 border-t border-slate-800/60">
                    <span className="text-slate-400">Platform BOM:</span>
                    <span className="text-slate-200 font-medium">{selectedComp.oemMatch.catalogBOM}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                    <Binary className="w-3.5 h-3.5 text-sky-400" />
                    <span>512-D L2 Unit Hypersphere Vector (Cosine Metric Retrieval)</span>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 italic">No standard OEM BOM catalog match found.</div>
              )}
            </div>

            {/* Machining Features */}
            <div className="bg-slate-950/80 p-3.5 rounded-lg border border-indigo-500/30 flex flex-col justify-between gap-2">
              <div>
                <div className="font-bold text-indigo-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5 mb-2">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" />
                  Detected Machining & Micro-Geometry Features
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedComp.machiningFeatures && selectedComp.machiningFeatures.length > 0 ? (
                    selectedComp.machiningFeatures.map((feat, idx) => (
                      <span
                        key={idx}
                        className="bg-indigo-950/70 text-indigo-200 border border-indigo-700/50 px-2 py-0.5 rounded text-[11px] font-medium"
                      >
                        ✓ {feat}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 italic">Standard smooth surface geometry</span>
                  )}
                </div>
              </div>

              <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2">
                <span>MultiTaskCADNet Inference</span>
                <span className="text-emerald-400 font-mono">WebGPU / Wasm SIMD</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
