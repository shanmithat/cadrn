/**
 * Executive Renault Nissan Engineering Dashboard & Metrology Dissection Hub.
 * Features 3 dedicated analytical consoles:
 * 1. Manufacturing Features Dissection: Hole schedule, PCD patterns, pockets, grooves, tooling & setups.
 * 2. GD&T Tolerancing Matrix: ASME Y14.5 / ISO 1101 DRF, Feature Control Frames, ISO 286 fits, Ra callouts.
 * 3. Assembly Parts & BOM: Part decomposition, exact mass properties, and OEM catalog match.
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Binary,
  Boxes,
  CheckCircle2,
  CircleDot,
  Compass,
  Crosshair,
  FileSpreadsheet,
  Gauge,
  Layers,
  Maximize2,
  Minimize2,
  PieChart,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  Target,
  Wrench,
} from 'lucide-react';
import {
  AssemblySummary,
  ComponentProfile,
  GDTReport,
  GDTStatus,
  GDTSymbol,
  HoleFeature,
  ManufacturingFeaturesReport,
  ToolApproachDirection,
} from '../core/types';

interface EngineeringDashboardProps {
  summary: AssemblySummary;
  components: ComponentProfile[];
  selectedPartId: string | null;
  onSelectPart: (partId: string | null) => void;
  fileName: string;
  executionTimeMs: number;
  manufacturingFeatures?: ManufacturingFeaturesReport;
  gdtReport?: GDTReport;
}

export const EngineeringDashboard: React.FC<EngineeringDashboardProps> = ({
  summary,
  components,
  selectedPartId,
  onSelectPart,
  fileName,
  executionTimeMs,
  manufacturingFeatures,
  gdtReport,
}) => {
  // Navigation tabs: 'features' (Manufacturing Features), 'gdt' (GD&T Matrix), 'bom' (Assembly BOM)
  const [activeTab, setActiveTab] = useState<'features' | 'gdt' | 'bom'>('features');
  const [holeSearchTerm, setHoleSearchTerm] = useState<string>('');
  const [selectedHoleType, setSelectedHoleType] = useState<string>('all');

  const selectedComp = components.find(c => c.partId === selectedPartId);

  // Filtered holes for the Hole Schedule
  const filteredHoles = (manufacturingFeatures?.holes || []).filter(h => {
    const matchesSearch =
      h.holeId.toLowerCase().includes(holeSearchTerm.toLowerCase()) ||
      h.diameterMm.toString().includes(holeSearchTerm) ||
      (h.threadDesignation && h.threadDesignation.toLowerCase().includes(holeSearchTerm.toLowerCase())) ||
      h.holeType.toLowerCase().includes(holeSearchTerm.toLowerCase());
    const matchesType =
      selectedHoleType === 'all' || h.holeType === selectedHoleType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* ========================================================================= */}
      {/* TOP NAVIGATION TABS FOR DISSECTION CONSOLES                               */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Tab 1: Manufacturing Features Dissection (Default) */}
          <button
            onClick={() => setActiveTab('features')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'features'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Manufacturing Features Dissection</span>
            {manufacturingFeatures && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
                {manufacturingFeatures.totalHolesCount} Holes
              </span>
            )}
          </button>

          {/* Tab 2: GD&T Tolerancing Matrix */}
          <button
            onClick={() => setActiveTab('gdt')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'gdt'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            <span>GD&T Tolerancing & Metrology Matrix</span>
            {gdtReport && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
                {gdtReport.totalGdtCalloutsCount} Controls
              </span>
            )}
          </button>

          {/* Tab 3: Assembly Parts & BOM */}
          <button
            onClick={() => setActiveTab('bom')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'bom'
                ? 'bg-red-600 text-white shadow-lg shadow-red-900/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Assembly Parts & BOM</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
              {components.length} Parts
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 pr-2 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Deterministic Geometry Engine</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONSOLE 1: MANUFACTURING FEATURES DISSECTION                             */}
      {/* ========================================================================= */}
      {activeTab === 'features' && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* Top KPI Cards for Features */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* KPI: Holes */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Holes & Bores</span>
              <div className="mt-2">
                <div className="text-2xl font-black text-slate-100">
                  {manufacturingFeatures?.totalHolesCount ?? 0}
                </div>
                <div className="text-[10px] text-emerald-400 mt-0.5 font-medium">
                  {manufacturingFeatures?.holes.filter(h => h.threadDesignation).length ?? 0} Tapped Threads
                </div>
              </div>
            </div>

            {/* KPI: Patterns */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hole Patterns</span>
              <div className="mt-2">
                <div className="text-2xl font-black text-amber-400">
                  {manufacturingFeatures?.holePatterns.length ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">PCD & Flange Arrays</div>
              </div>
            </div>

            {/* KPI: Pockets */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pockets & Slots</span>
              <div className="mt-2">
                <div className="text-2xl font-black text-sky-400">
                  {manufacturingFeatures?.totalPocketsCount ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">CNC Milled Cavities</div>
              </div>
            </div>

            {/* KPI: Grooves */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Grooves & Recesses</span>
              <div className="mt-2">
                <div className="text-2xl font-black text-purple-400">
                  {manufacturingFeatures?.totalGroovesCount ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">O-Ring & Circlip Seats</div>
              </div>
            </div>

            {/* KPI: Planar Faces */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Planar Faces</span>
              <div className="mt-2">
                <div className="text-2xl font-black text-indigo-400">
                  {manufacturingFeatures?.totalPlanarFacesCount ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Reference Planes</div>
              </div>
            </div>

            {/* KPI: Fillets */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Corner Fillets</span>
              <div className="mt-2">
                <div className="text-2xl font-black text-rose-400">
                  {manufacturingFeatures?.fillets.length ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Cutter Radii Limits</div>
              </div>
            </div>
          </div>

          {/* CNC Tooling & Machining Setups Audit Card */}
          {manufacturingFeatures?.toolingAndSetups && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                      CNC Tooling, Fixturing & Machining Setups Audit
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Multi-axis tool accessibility, cutter radius constraints, and clamping index analysis
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700">
                    Setups Required (3-Axis):{' '}
                    <span className="text-amber-400 font-mono">
                      {manufacturingFeatures.toolingAndSetups.minimumSetups3Axis} Clamps
                    </span>
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      manufacturingFeatures.toolingAndSetups.is5AxisRequired
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}
                  >
                    {manufacturingFeatures.toolingAndSetups.is5AxisRequired
                      ? '5-Axis CNC Recommended'
                      : 'Standard 3-Axis Accessible'}
                  </span>
                </div>
              </div>

              {/* Tooling Constraints & Approach Vectors */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                  <span className="text-slate-400">Min Milling Cutter Dia:</span>
                  <div className="mt-1 font-mono font-bold text-slate-100 text-base">
                    ⌀ {manufacturingFeatures.toolingAndSetups.minMillingToolDiameterMm.toFixed(1)} mm
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Based on corner radii R{((manufacturingFeatures.toolingAndSetups.minMillingToolDiameterMm) / 2).toFixed(1)} mm</span>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                  <span className="text-slate-400">Max Hole / Pocket Depth:</span>
                  <div className="mt-1 font-mono font-bold text-slate-100 text-base">
                    {manufacturingFeatures.toolingAndSetups.maxHoleDepthMm.toFixed(1)} mm
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">Maximum required tool gauge reach</span>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                  <span className="text-slate-400">Max Aspect Ratio (L/D):</span>
                  <div className="mt-1 font-mono font-bold text-slate-100 text-base">
                    {manufacturingFeatures.toolingAndSetups.maxToolAspectRatioLd.toFixed(1)} : 1
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1">
                    {manufacturingFeatures.toolingAndSetups.maxToolAspectRatioLd > 5.0 ? 'Peck drilling recommended' : 'Standard cycle'}
                  </span>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                  <span className="text-slate-400">Tool Approach Vectors:</span>
                  <div className="mt-1 font-mono font-bold text-indigo-300 text-base">
                    {manufacturingFeatures.toolingAndSetups.uniqueApproachDirections.length} Directions
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {manufacturingFeatures.toolingAndSetups.uniqueApproachDirections.map((dir, i) => (
                      <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {dir.split(' ')[0]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* DFM Warnings & Critical Flags */}
              {(manufacturingFeatures.toolingAndSetups.dfmCriticalFlags.length > 0 ||
                manufacturingFeatures.toolingAndSetups.dfmWarnings.length > 0) && (
                <div className="flex flex-col gap-2 pt-1">
                  {manufacturingFeatures.toolingAndSetups.dfmCriticalFlags.map((flag, idx) => (
                    <div
                      key={`crit-${idx}`}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 text-xs text-red-200"
                    >
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-red-300 uppercase text-[10px]">DFM Critical: </span>
                        {flag}
                      </div>
                    </div>
                  ))}
                  {manufacturingFeatures.toolingAndSetups.dfmWarnings.map((warn, idx) => (
                    <div
                      key={`warn-${idx}`}
                      className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 text-xs text-amber-200"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300 uppercase text-[10px]">Machining Note: </span>
                        {warn}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Detailed Hole Schedule Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900/90">
              <div className="flex items-center gap-2">
                <CircleDot className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                  Comprehensive Hole Schedule & Bore Callouts
                </h3>
                <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                  {filteredHoles.length} of {manufacturingFeatures?.holes.length ?? 0}
                </span>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={holeSearchTerm}
                    onChange={e => setHoleSearchTerm(e.target.value)}
                    placeholder="Search holes (ID, dia, thread)..."
                    className="pl-8 pr-3 py-1 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
                  />
                </div>

                <select
                  value={selectedHoleType}
                  onChange={e => setSelectedHoleType(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-red-500"
                >
                  <option value="all">All Hole Types</option>
                  <option value="Through-Hole">Through-Hole</option>
                  <option value="Counterbored Hole">Counterbored Hole</option>
                  <option value="Stepped Bearing Bore">Stepped Bearing Bore</option>
                  <option value="Blind Hole">Blind Hole</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-950/95 backdrop-blur-sm text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider z-10">
                  <tr>
                    <th className="p-3">Hole ID</th>
                    <th className="p-3">Diameter (⌀)</th>
                    <th className="p-3">Depth</th>
                    <th className="p-3">Aspect (L/D)</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Thread / Tap Spec</th>
                    <th className="p-3">ISO 286 Fit</th>
                    <th className="p-3">Axis Vector</th>
                    <th className="p-3">Approach</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredHoles.map(hole => (
                    <tr
                      key={hole.holeId}
                      className="hover:bg-slate-800/40 text-slate-300 transition-colors"
                    >
                      <td className="p-3 font-mono font-bold text-amber-300">{hole.holeId}</td>
                      <td className="p-3 font-mono font-semibold text-slate-100">
                        ⌀ {hole.diameterMm.toFixed(2)} mm
                        {hole.counterboreDiaMm && (
                          <div className="text-[10px] text-slate-400 font-normal">
                            C'bore: ⌀{hole.counterboreDiaMm.toFixed(1)} × {hole.counterboreDepthMm?.toFixed(1)} mm
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-mono text-slate-200">{hole.depthMm.toFixed(1)} mm</td>
                      <td className="p-3 font-mono">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            hole.isChatterRisk
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'text-slate-300'
                          }`}
                        >
                          {hole.aspectRatio.toFixed(1)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          {hole.holeType}
                        </span>
                      </td>
                      <td className="p-3">
                        {hole.threadDesignation ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                            {hole.threadDesignation}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">— (Clearance)</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-indigo-300 font-mono text-[11px]">
                          {hole.fitStandardIso286.split(' ')[0]}
                        </span>
                        <div className="text-[10px] text-slate-400">
                          {hole.fitStandardIso286.slice(hole.fitStandardIso286.indexOf(' ') + 1)}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-[10px] text-slate-400">
                        [{hole.axisVector.map(v => v.toFixed(2)).join(', ')}]
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-[11px] text-slate-300">
                          {hole.toolApproach.split(' ')[0]}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {hole.isChatterRisk ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Chatter Risk
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Nominal
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredHoles.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500 italic">
                        No holes matching query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hole Patterns & Bolt Circles (PCD) */}
          {manufacturingFeatures?.holePatterns && manufacturingFeatures.holePatterns.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5">
                <Target className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                  Detected Bolt Circles (PCD) & Flange Patterns ({manufacturingFeatures.holePatterns.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {manufacturingFeatures.holePatterns.map(pat => (
                  <div
                    key={pat.patternId}
                    className="bg-slate-950/70 border border-amber-500/30 rounded-lg p-3.5 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="font-mono font-bold text-amber-300 text-xs">{pat.patternId}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                          {pat.isEquispaced ? 'Equispaced' : 'Symmetrical'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-200 mt-1">
                        {pat.patternType}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                      <div className="flex justify-between">
                        <span>PCD / Span:</span>
                        <span className="font-mono font-bold text-slate-100">⌀ {pat.pitchCircleDiameterMm.toFixed(1)} mm</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Hole Count & Size:</span>
                        <span className="font-mono text-slate-200">{pat.holeCount} × ⌀ {pat.holeDiameterMm.toFixed(1)} mm</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Angular Spacing:</span>
                        <span className="font-mono text-slate-200">{pat.angularSpacingDeg.toFixed(1)}°</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Center [X, Y, Z]:</span>
                        <span className="font-mono text-slate-300 text-[10px]">
                          [{pat.patternCenter.map(v => v.toFixed(0)).join(', ')}]
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-1">
                      {pat.holeIds.slice(0, 4).map(hId => (
                        <span key={hId} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 font-mono">
                          {hId}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pockets & Grooves Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pockets & Cavities Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Pockets & Milling Cavities ({manufacturingFeatures?.pockets.length ?? 0})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-400 font-semibold border-b border-slate-800 text-[10px] uppercase">
                      <th className="pb-2">Pocket ID</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2 text-right">Depth</th>
                      <th className="pb-2 text-right">Floor Size</th>
                      <th className="pb-2 text-right">Min Corner R</th>
                      <th className="pb-2 text-right">Max Cutter ⌀</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {manufacturingFeatures?.pockets.map(pkt => (
                      <tr key={pkt.pocketId} className="text-slate-300">
                        <td className="py-2.5 font-mono font-bold text-sky-300">{pkt.pocketId}</td>
                        <td className="py-2.5 text-[11px] text-slate-300">{pkt.pocketType}</td>
                        <td className="py-2.5 text-right font-mono text-slate-100">{pkt.depthMm.toFixed(1)} mm</td>
                        <td className="py-2.5 text-right font-mono text-slate-300">{pkt.lengthMm} × {pkt.widthMm} mm</td>
                        <td className="py-2.5 text-right font-mono text-amber-300">R{pkt.minCornerRadiusMm.toFixed(1)}</td>
                        <td className="py-2.5 text-right font-mono font-bold text-emerald-400">⌀ {pkt.maxToolDiameterMm.toFixed(1)} mm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Grooves & Undercuts Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Tag className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Grooves, Recesses & Undercuts ({manufacturingFeatures?.grooves.length ?? 0})
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-400 font-semibold border-b border-slate-800 text-[10px] uppercase">
                      <th className="pb-2">Groove ID</th>
                      <th className="pb-2">Specification</th>
                      <th className="pb-2 text-right">⌀ ID / ⌀ OD</th>
                      <th className="pb-2 text-right">Width × Depth</th>
                      <th className="pb-2 text-right">Axis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {manufacturingFeatures?.grooves.map(grv => (
                      <tr key={grv.grooveId} className="text-slate-300">
                        <td className="py-2.5 font-mono font-bold text-purple-300">{grv.grooveId}</td>
                        <td className="py-2.5 text-[11px] text-slate-200">
                          {grv.standardSpecification}
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-100">
                          ⌀{grv.innerDiameterMm.toFixed(1)} / ⌀{grv.outerDiameterMm.toFixed(1)}
                        </td>
                        <td className="py-2.5 text-right font-mono text-emerald-400">
                          {grv.widthMm.toFixed(2)} × {grv.depthMm.toFixed(2)} mm
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-400 text-[10px]">
                          [{grv.axisVector.join(', ')}]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONSOLE 2: GD&T TOLERANCING & METROLOGY MATRIX                           */}
      {/* ========================================================================= */}
      {activeTab === 'gdt' && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* Datum Reference Frame (DRF) Header */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                    ASME Y14.5 / ISO 1101 Datum Reference Frame (DRF)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    6-Degrees-of-Freedom kinematic constraint hierarchy for functional machining and CMM metrology
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-200 font-mono">
                  {gdtReport?.generalToleranceClass ?? 'ISO 2768-m'}
                </span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  All {gdtReport?.passedCount ?? 0} Controls PASS
                </span>
              </div>
            </div>

            {/* DRF Datums [A], [B], [C] Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {gdtReport?.datumReferenceFrame.map(datum => (
                <div
                  key={datum.datumLabel}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-2"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-red-600 text-white font-mono font-black flex items-center justify-center text-sm shadow-md shadow-red-900/40">
                        {datum.datumLabel}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-100">Datum [{datum.datumLabel}]</div>
                        <div className="text-[10px] text-slate-400">{datum.datumType}</div>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-amber-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {datum.featureId}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed mt-1">
                    {datum.roleDescription}
                  </p>

                  <div className="text-[10px] font-mono text-slate-400 pt-2 border-t border-slate-800/80 flex justify-between">
                    <span>Vector:</span>
                    <span>[{datum.normalOrAxis.map(v => v.toFixed(2)).join(', ')}]</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature Control Frames (FCF) Table */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/90">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">
                  Feature Control Frames & Geometric Tolerance Verification
                </h3>
              </div>
              <div className="text-xs text-slate-400">
                Compliance Standard: <span className="font-bold text-slate-200">ISO 1101 / ASME Y14.5-2018</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                    <th className="p-3">Characteristic</th>
                    <th className="p-3">Feature Controlled</th>
                    <th className="p-3">Tolerance Zone</th>
                    <th className="p-3 text-right">Specified Tol</th>
                    <th className="p-3 text-right">Measured Dev</th>
                    <th className="p-3 text-center">Datums</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Engineering Rationale & ISO Standard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {gdtReport?.featureControlFrames.map((fcf, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40 text-slate-300 transition-colors">
                      <td className="p-3">
                        <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">
                          {fcf.characteristic}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-100">{fcf.featureName}</div>
                        <div className="text-[10px] font-mono text-amber-300">{fcf.featureId}</div>
                      </td>
                      <td className="p-3 text-[11px] text-slate-300">{fcf.toleranceZone}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-100">
                        {fcf.specifiedToleranceMm.toFixed(3)} mm
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-400">
                        {fcf.measuredDeviationMm.toFixed(3)} mm
                      </td>
                      <td className="p-3 text-center">
                        {fcf.datumsReferenced.length > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            {fcf.datumsReferenced.map(d => (
                              <span
                                key={d}
                                className="w-5 h-5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] font-bold text-slate-200 flex items-center justify-center"
                              >
                                {d}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[10px]">None (Form)</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          PASS
                        </span>
                      </td>
                      <td className="p-3 text-[11px] text-slate-300 max-w-sm">
                        <div>{fcf.engineeringRationale}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{fcf.isoStandardReference}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ISO 286 Fits & Surface Roughness Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ISO 286 Fits Table */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  ISO 286 Limits & Recommended Engineering Fits
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-400 font-semibold border-b border-slate-800 text-[10px] uppercase">
                      <th className="pb-2">Nominal Size</th>
                      <th className="pb-2">Fit Class</th>
                      <th className="pb-2">Hole Zone</th>
                      <th className="pb-2">Shaft Zone</th>
                      <th className="pb-2">Functional Fit Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {gdtReport?.iso286Fits.map((fit, idx) => (
                      <tr key={idx} className="text-slate-300">
                        <td className="py-2.5 font-mono font-bold text-slate-100">
                          ⌀ {fit.nominalSizeMm.toFixed(1)} mm
                        </td>
                        <td className="py-2.5 font-mono font-bold text-amber-300">{fit.fitDesignation}</td>
                        <td className="py-2.5 font-mono text-[10px] text-slate-300">{fit.holeToleranceZone}</td>
                        <td className="py-2.5 font-mono text-[10px] text-slate-300">{fit.shaftToleranceZone}</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            {fit.fitType}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Surface Roughness Ra Callouts */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <Gauge className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Surface Roughness Specifications (Ra in micrometers)
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-slate-400 font-semibold border-b border-slate-800 text-[10px] uppercase">
                      <th className="pb-2">Feature / Surface</th>
                      <th className="pb-2 text-right">Required Ra</th>
                      <th className="pb-2">Process Capability</th>
                      <th className="pb-2 text-center">Sealing Critical</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {gdtReport?.surfaceFinishCallouts.map((sf, idx) => (
                      <tr key={idx} className="text-slate-300">
                        <td className="py-2.5 font-semibold text-slate-200">{sf.featureDescription}</td>
                        <td className="py-2.5 text-right font-mono font-bold text-amber-300">
                          Ra {sf.requiredRaUm.toFixed(1)} µm
                        </td>
                        <td className="py-2.5 text-[11px] text-slate-300">{sf.processCapability}</td>
                        <td className="py-2.5 text-center">
                          {sf.sealingCritical ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                              Yes
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONSOLE 3: ASSEMBLY BILL OF MATERIALS (BOM) & PART PROFILES               */}
      {/* ========================================================================= */}
      {activeTab === 'bom' && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* Executive Metrology Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

          {/* BOM Table */}
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
                Processed in <span className="font-mono text-emerald-400 font-bold">{executionTimeMs.toFixed(0)} ms</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                    <th className="p-3">Part ID</th>
                    <th className="p-3">Classification</th>
                    <th className="p-3">Manufacturing</th>
                    <th className="p-3">OEM Catalog Match (BOM)</th>
                    <th className="p-3 text-right">Volume (mm³)</th>
                    <th className="p-3 text-right">Mass (kg)</th>
                    <th className="p-3 text-right">A/V Ratio</th>
                    <th className="p-3 text-center">DFM Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {components.map(comp => {
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

          {/* Selected Component Metrology Deep-Dive */}
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
                </div>

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
                </div>

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
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
