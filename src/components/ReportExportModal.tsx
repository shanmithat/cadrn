/**
 * Client-Side PDF Report Generator using jsPDF and jspdf-autotable.
 * Generates an executive 2-page Renault Nissan engineering profile report
 * completely inside the user's browser with ZERO backend dependencies.
 */

import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, FileText, Loader2, Sparkles, X } from 'lucide-react';
import { AssemblySummary, ComponentProfile } from '../core/types';

interface ReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  summary: AssemblySummary;
  components: ComponentProfile[];
  executionTimeMs: number;
}

export const ReportExportModal: React.FC<ReportExportModalProps> = ({
  isOpen,
  onClose,
  fileName,
  summary,
  components,
  executionTimeMs,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleGeneratePDF = async () => {
    setIsGenerating(true);

    try {
      // Create A4 portrait PDF document
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // =======================================================================
      // PAGE 1: EXECUTIVE ASSEMBLY SUMMARY & BOM
      // =======================================================================
      // Renault Nissan Header Banner
      doc.setFillColor(185, 28, 28); // Renault Crimson
      doc.rect(0, 0, 210, 18, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('AutoCAD-Profiler — Renault Nissan Automotive R&D', 12, 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Client-Side Serverless Profile | ${new Date().toISOString().split('T')[0]}`, 198, 11, { align: 'right' });

      // Title & Document Metadata
      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('1. EXECUTIVE ASSEMBLY METROLOGY PROFILE (DIVERGENCE THEOREM)', 12, 26);

      // Metrology Summary Table
      autoTable(doc, {
        startY: 29,
        theme: 'grid',
        headStyles: { fillColor: [45, 55, 72], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8, textColor: [30, 30, 30] },
        columns: [
          { header: 'Metric Category', dataKey: 'metric' },
          { header: 'Calculated Engineering Value', dataKey: 'value' },
          { header: 'Physical Reference / Unit', dataKey: 'unit' },
        ],
        body: [
          { metric: 'Sub-Parts Isolated', value: String(summary.totalPartsDetected), unit: 'Continuous mesh boundary decomposition' },
          { metric: 'Total Assembly Mass', value: `${summary.totalMassKg.toFixed(4)} kg`, unit: 'Automotive Steel: 7,850 kg/m³' },
          { metric: 'Total Volume', value: `${(summary.totalVolumeMm3 / 1000).toFixed(1)} cm³ (${summary.totalVolumeMm3.toLocaleString()} mm³)`, unit: 'Exact Divergence Theorem tetrahedral sum' },
          { metric: 'Total Surface Area', value: `${(summary.totalSurfaceAreaMm2 / 10000).toFixed(2)} dm² (${summary.totalSurfaceAreaMm2.toLocaleString()} mm²)`, unit: 'Facets integration' },
          { metric: 'Assembly Center of Mass', value: `X: ${summary.overallCenterOfMass[0].toFixed(1)}, Y: ${summary.overallCenterOfMass[1].toFixed(1)}, Z: ${summary.overallCenterOfMass[2].toFixed(1)} mm`, unit: 'Volume-weighted first moment integral' },
          { metric: 'Bounding Box (LxWxH)', value: `${summary.totalBoundingEnvelope.dimensions.map(d => d.toFixed(1)).join(' × ')} mm`, unit: 'Packaging envelope' },
          { metric: 'Source CAD Model', value: fileName, unit: `Processed in ${executionTimeMs.toFixed(0)} ms in browser` },
        ],
        margin: { left: 12, right: 12 },
      });

      // Section 2: BOM Table
      const finalY = (doc as any).lastAutoTable.finalY || 85;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('2. ASSEMBLY BILL OF MATERIALS (BOM) & PART MATRIX', 12, finalY + 8);

      const bomRows = components.map(c => [
        c.partId,
        c.classification,
        c.manufacturingProcess,
        c.volumeMm3.toLocaleString(),
        c.massKg.toFixed(4),
        c.areaToVolumeRatio.toFixed(3),
        c.dfmWarnings.length > 0 ? `${c.dfmWarnings.length} Alerts` : 'Pass',
      ]);

      autoTable(doc, {
        startY: finalY + 11,
        theme: 'striped',
        head: [['Part ID', 'Classification', 'Process', 'Volume (mm³)', 'Mass (kg)', 'A/V (mm⁻¹)', 'DFM Audit']],
        body: bomRows,
        headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7, textColor: [30, 30, 30] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 20 },
          1: { cellWidth: 35 },
          2: { cellWidth: 35 },
          3: { halign: 'right', cellWidth: 28 },
          4: { halign: 'right', cellWidth: 24 },
          5: { halign: 'right', cellWidth: 20 },
          6: { halign: 'center', cellWidth: 24 },
        },
        margin: { left: 12, right: 12 },
      });

      // Page 1 Footer
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text('Page 1 of 2 — CONFIDENTIAL RENAULT NISSAN AUTOMOTIVE R&D', 105, 290, { align: 'center' });

      // =======================================================================
      // PAGE 2: SUB-PART PROFILES & AUTOMOTIVE DFM AUDIT
      // =======================================================================
      doc.addPage();

      doc.setFillColor(185, 28, 28);
      doc.rect(0, 0, 210, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('AutoCAD-Profiler — Sub-Part Metrology & DFM Rules Audit', 12, 9);

      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text('3. CONSTITUENT COMPONENT METROLOGY & INERTIA TENSORS', 12, 22);

      let currentY = 27;
      const displayComps = components.slice(0, 6);

      displayComps.forEach((comp) => {
        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(12, currentY, 186, 23, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`Part: ${comp.partId}`, 15, currentY + 5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(70, 70, 70);
        doc.text(`Class: ${comp.classification} | Process: ${comp.manufacturingProcess}`, 55, currentY + 5);
        doc.text(`Mass: ${comp.massKg.toFixed(4)} kg | Vol: ${comp.volumeMm3.toLocaleString()} mm³`, 140, currentY + 5);

        const obbDims = comp.boundingBoxObb.dimensions.map(d => d.toFixed(1)).join(' × ');
        doc.text(`OBB (LxWxH): ${obbDims} mm | CoM: [${comp.centroidMm.join(', ')}] mm`, 15, currentY + 11);

        const momentsStr = comp.principalMoments.map(m => m.toExponential(2)).join(', ');
        doc.text(`Principal Moments: [${momentsStr}] kg·mm²`, 15, currentY + 16);

        if (comp.dfmWarnings.length > 0) {
          doc.setTextColor(185, 28, 28);
          doc.text(`DFM Alerts: ${comp.dfmWarnings.join('; ')}`, 15, currentY + 20);
        } else {
          doc.setTextColor(22, 163, 74);
          doc.text(`DFM Status: Pass — Meets standard automotive tooling constraints`, 15, currentY + 20);
        }

        currentY += 27;
      });

      // Section 4: Automotive DFM Audit Criteria Table
      doc.setTextColor(40, 40, 40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text('4. AUTOMOTIVE DFM DESIGN RULE CRITERIA', 12, currentY + 4);

      autoTable(doc, {
        startY: currentY + 7,
        theme: 'grid',
        headStyles: { fillColor: [45, 55, 72], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        bodyStyles: { fontSize: 7, textColor: [30, 30, 30] },
        head: [['Design Rule', 'Engineering Threshold', 'Manufacturing Implication']],
        body: [
          ['Undercut Detection', 'Face normal Z-proj < -0.1', 'Requires side-action slide mechanisms or collapsible cores in tooling.'],
          ['Draft Angle Sufficiency', 'Draft angle < 1.5°', 'Impairs ejection from die/mold and induces frictional surface scouring.'],
          ['Minimum Wall Thickness', 'Hydraulic diameter < 1.5 mm', 'Risk of premature freeze, incomplete fill, or high stamping warpage.'],
          ['Aspect Ratio Limit', 'Length-to-thickness > 25:1', 'Susceptible to vibrational resonance and thermal cycling distortion.'],
        ],
        margin: { left: 12, right: 12 },
      });

      // Page 2 Signoff Footer
      doc.setFontSize(7);
      doc.setTextColor(130, 130, 130);
      doc.text('Page 2 of 2 — Renault Nissan R&D Digital Engineering Signature Authorized', 105, 290, { align: 'center' });

      // Save PDF to browser download
      const cleanName = fileName.replace(/\.[^/.]+$/, '');
      doc.save(`${cleanName}_RenaultNissan_Engineering_Report.pdf`);
    } catch (err) {
      console.error('[ReportExportModal] PDF generation failed:', err);
      alert('Failed to generate PDF report: ' + String(err));
    } finally {
      setIsGenerating(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-bold text-slate-100">Export Engineering PDF Report</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-xs text-slate-300 flex flex-col gap-3">
          <p>
            Generate a standardized 2-page executive engineering profile formatted for <strong>Renault Nissan Automotive R&D</strong>.
          </p>
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col gap-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Target File:</span>
              <span className="font-mono text-slate-200">{fileName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Parts:</span>
              <span className="font-mono text-slate-200">{summary.totalPartsDetected}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Mass:</span>
              <span className="font-mono text-emerald-400 font-bold">{summary.totalMassKg.toFixed(3)} kg</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Processing Engine:</span>
              <span className="text-sky-400">100% Client-Side WebAssembly</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGeneratePDF}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-900/30 transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download PDF Report
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
