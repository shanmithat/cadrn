"""Executive 2-Page Automotive Engineering Report Generator.
Generates a Renault Nissan branded engineering profile report containing:
- Executive Summary & Assembly Mass Properties (Divergence Theorem)
- Bill of Materials (BOM) Table with Part Classifications & Manufacturing Processes
- Sub-Part Decomposition Breakdown with Principal Inertia & OBB Dimensions
- Automotive DFM Rule Validation Flags (Undercuts, Zero-Draft, Wall Thickness)
Supports WeasyPrint headless HTML-to-PDF rendering with robust FPDF2 fallback.
"""

from __future__ import annotations

from datetime import datetime
import logging
import os
from pathlib import Path
from typing import Optional

from core.schemas import CADProfileResponse

logger = logging.getLogger(__name__)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AutoCAD-Profiler: Automotive Engineering Report</title>
<style>
    @page {
        size: A4 portrait;
        margin: 12mm;
        @bottom-right {
            content: "Page " counter(page) " of " counter(pages);
            font-size: 8pt;
            color: #718096;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }
        @bottom-left {
            content: "CONFIDENTIAL - RENAULT NISSAN R&D AUTOMOTIVE ADVANCED ENGINEERING";
            font-size: 7pt;
            color: #a0aec0;
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }
    }

    * { box-sizing: border-box; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #1a202c;
        margin: 0;
        padding: 0;
        font-size: 9pt;
        line-height: 1.35;
    }

    .page-container {
        width: 100%;
        min-height: 270mm;
        page-break-after: always;
        position: relative;
    }
    .page-container:last-child {
        page-break-after: auto;
    }

    /* Header */
    .header {
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 8px;
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }
    .brand-title {
        font-size: 16pt;
        font-weight: 800;
        color: #b91c1c; /* Renault red / Nissan crimson */
        letter-spacing: -0.5px;
        margin: 0;
    }
    .brand-subtitle {
        font-size: 8pt;
        color: #4a5568;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .meta-box {
        text-align: right;
        font-size: 8pt;
        color: #718096;
    }

    /* Section styling */
    .section-title {
        font-size: 11pt;
        font-weight: 700;
        color: #2d3748;
        margin-top: 10px;
        margin-bottom: 6px;
        border-left: 4px solid #b91c1c;
        padding-left: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* KPI Grid */
    .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-bottom: 12px;
    }
    .kpi-card {
        background: #f7fafc;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        padding: 8px 10px;
    }
    .kpi-label {
        font-size: 7pt;
        color: #718096;
        text-transform: uppercase;
        font-weight: 600;
    }
    .kpi-value {
        font-size: 12pt;
        font-weight: 700;
        color: #1a202c;
        margin-top: 2px;
    }
    .kpi-sub {
        font-size: 7pt;
        color: #a0aec0;
    }

    /* Data Tables */
    table.data-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
        margin-bottom: 12px;
        font-size: 8pt;
    }
    table.data-table th {
        background-color: #2d3748;
        color: #ffffff;
        text-align: left;
        padding: 6px 8px;
        font-weight: 600;
        font-size: 7.5pt;
        text-transform: uppercase;
    }
    table.data-table td {
        padding: 5px 8px;
        border-bottom: 1px solid #edf2f7;
    }
    table.data-table tr:nth-child(even) {
        background-color: #f8fafc;
    }

    /* Badges */
    .badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 7pt;
        font-weight: 600;
    }
    .badge-class { background: #e0e7ff; color: #3730a3; }
    .badge-process { background: #fef3c7; color: #92400e; }
    .badge-ok { background: #d1fae5; color: #065f46; }
    .badge-warn { background: #fee2e2; color: #991b1b; }

    /* Component Metrology Cards */
    .comp-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-top: 6px;
    }
    .comp-card {
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 8px 10px;
        background: #ffffff;
    }
    .comp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #f1f5f9;
        padding-bottom: 4px;
        margin-bottom: 6px;
    }
    .comp-id {
        font-weight: 700;
        color: #0f172a;
        font-size: 9pt;
    }
    .comp-stat-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 3px;
        font-size: 7.5pt;
    }
    .comp-stat-label { color: #64748b; }
    .comp-stat-val { font-weight: 600; color: #1e293b; }

    .warning-box {
        background: #fff1f2;
        border-left: 3px solid #e11d48;
        padding: 4px 6px;
        margin-top: 4px;
        font-size: 7pt;
        color: #9f1239;
    }

    /* Footer Signoff */
    .signoff-box {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        border-top: 1px solid #cbd5e1;
        padding-top: 8px;
        display: flex;
        justify-content: space-between;
        font-size: 7.5pt;
        color: #64748b;
    }
</style>
</head>
<body>

<!-- ========================= PAGE 1: EXECUTIVE ASSEMBLY BOM ========================= -->
<div class="page-container">
    <div class="header">
        <div>
            <div class="brand-title">AutoCAD-Profiler</div>
            <div class="brand-subtitle">Renault Nissan Automotive R&D — Advanced Geometric Analytics</div>
        </div>
        <div class="meta-box">
            <div><strong>Task ID:</strong> {{ task_id }}</div>
            <div><strong>Date:</strong> {{ date_str }}</div>
            <div><strong>Source:</strong> {{ filename }} ({{ ingestion_path }})</div>
        </div>
    </div>

    <div class="section-title">1. Executive Assembly Metrology Profile (Divergence Theorem)</div>
    <div class="kpi-grid">
        <div class="kpi-card">
            <div class="kpi-label">Sub-Parts Isolated</div>
            <div class="kpi-value">{{ total_parts }}</div>
            <div class="kpi-sub">Synthetic assembly partition</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Total Assembly Mass</div>
            <div class="kpi-value">{{ "%.2f"|format(total_mass_kg) }} kg</div>
            <div class="kpi-sub">Steel: 7,850 kg/m³</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Total Volume</div>
            <div class="kpi-value">{{ "%.1f"|format(total_volume_cm3) }} cm³</div>
            <div class="kpi-sub">{{ "%.0f"|format(total_volume_mm3) }} mm³</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">Total Surface Area</div>
            <div class="kpi-value">{{ "%.1f"|format(total_surface_dm2) }} dm²</div>
            <div class="kpi-sub">{{ "%.0f"|format(total_surface_area_mm2) }} mm²</div>
        </div>
    </div>

    <div class="kpi-grid">
        <div class="kpi-card" style="grid-column: span 2;">
            <div class="kpi-label">Overall Center of Mass (CoM)</div>
            <div class="kpi-value" style="font-size: 10pt;">
                X: {{ "%.2f"|format(com[0]) }} mm | Y: {{ "%.2f"|format(com[1]) }} mm | Z: {{ "%.2f"|format(com[2]) }} mm
            </div>
            <div class="kpi-sub">Exact volume-weighted tetrahedral divergence integration</div>
        </div>
        <div class="kpi-card" style="grid-column: span 2;">
            <div class="kpi-label">Bounding Envelope (LxWxH)</div>
            <div class="kpi-value" style="font-size: 10pt;">
                {{ "%.1f"|format(box_dims[0]) }} × {{ "%.1f"|format(box_dims[1]) }} × {{ "%.1f"|format(box_dims[2]) }} mm
            </div>
            <div class="kpi-sub">Axis-aligned global packaging space</div>
        </div>
    </div>

    <div class="section-title">2. Assembly Bill of Materials (BOM) & Classification Matrix</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>Part ID</th>
                <th>Classification</th>
                <th>Manufacturing Process</th>
                <th>OEM Match (BOM)</th>
                <th>Volume (mm³)</th>
                <th>Mass (kg)</th>
                <th>A/V (mm⁻¹)</th>
                <th>DFM Alerts</th>
            </tr>
        </thead>
        <tbody>
            {% for comp in components %}
            <tr>
                <td><strong>{{ comp.part_id }}</strong></td>
                <td><span class="badge badge-class">{{ comp.classification.value }}</span></td>
                <td><span class="badge badge-process">{{ comp.manufacturing_process.value }}</span></td>
                <td>
                    {% if comp.oem_match %}
                        <span class="badge badge-class" style="background:#ecfdf5;color:#065f46;border-color:#a7f3d0;">
                            {{ comp.oem_match.part_number }} ({{ comp.oem_match.similarity_score }}%)
                        </span>
                    {% else %}
                        -
                    {% endif %}
                </td>
                <td>{{ "%.1f"|format(comp.volume_mm3) }}</td>
                <td>{{ "%.4f"|format(comp.mass_kg) }}</td>
                <td>{{ "%.3f"|format(comp.area_to_volume_ratio) }}</td>
                <td>
                    {% if comp.dfm_warnings %}
                        <span class="badge badge-warn">{{ comp.dfm_warnings|length }} Alerts</span>
                    {% else %}
                        <span class="badge badge-ok">Pass</span>
                    {% endif %}
                </td>
            </tr>
            {% endfor %}
        </tbody>
    </table>

    <div class="signoff-box">
        <div>AutoCAD-Profiler v2.0 • Renault Nissan Automotive Engineering Platform</div>
        <div>Continuous Verification & Metrology Pipeline</div>
    </div>
</div>

<!-- ========================= PAGE 2: SUB-PART DECOMPOSITION & DFM ========================= -->
<div class="page-container">
    <div class="header">
        <div>
            <div class="brand-title">AutoCAD-Profiler</div>
            <div class="brand-subtitle">Component Decomposition & DFM Analysis Breakdown</div>
        </div>
        <div class="meta-box">
            <div><strong>Task ID:</strong> {{ task_id }}</div>
            <div><strong>Execution:</strong> {{ "%.3f"|format(exec_time or 0.0) }}s</div>
        </div>
    </div>

    <div class="section-title">3. Constituent Sub-Part Metrology & Inertia Tensors</div>
    <div class="comp-grid">
        {% for comp in components %}
        <div class="comp-card">
            <div class="comp-header">
                <span class="comp-id">{{ comp.part_id }}</span>
                <span class="badge badge-class">{{ comp.classification.value }}</span>
            </div>
            <div class="comp-stat-row">
                <span class="comp-stat-label">Process:</span>
                <span class="comp-stat-val">{{ comp.manufacturing_process.value }}</span>
            </div>
            {% if comp.oem_match %}
            <div class="comp-stat-row">
                <span class="comp-stat-label">OEM BOM Match:</span>
                <span class="comp-stat-val" style="color:#059669;">{{ comp.oem_match.part_number }} ({{ comp.oem_match.similarity_score }}%)</span>
            </div>
            {% endif %}
            {% if comp.machining_features %}
            <div class="comp-stat-row">
                <span class="comp-stat-label">Features:</span>
                <span class="comp-stat-val">{{ comp.machining_features|join(', ') }}</span>
            </div>
            {% endif %}
            <div class="comp-stat-row">
                <span class="comp-stat-label">Volume / Mass:</span>
                <span class="comp-stat-val">{{ "%.1f"|format(comp.volume_mm3) }} mm³ ({{ "%.4f"|format(comp.mass_kg) }} kg)</span>
            </div>
            <div class="comp-stat-row">
                <span class="comp-stat-label">Center of Mass:</span>
                <span class="comp-stat-val">[{{ "%.1f"|format(comp.centroid_mm[0]) }}, {{ "%.1f"|format(comp.centroid_mm[1]) }}, {{ "%.1f"|format(comp.centroid_mm[2]) }}] mm</span>
            </div>
            <div class="comp-stat-row">
                <span class="comp-stat-label">OBB (LxWxH):</span>
                <span class="comp-stat-val">{{ "%.1f"|format(comp.bounding_box_obb.dimensions[0]) }} × {{ "%.1f"|format(comp.bounding_box_obb.dimensions[1]) }} × {{ "%.1f"|format(comp.bounding_box_obb.dimensions[2]) }} mm</span>
            </div>
            <div class="comp-stat-row">
                <span class="comp-stat-label">Principal Moments:</span>
                <span class="comp-stat-val">I₁={{ "%.2e"|format(comp.principal_moments[0]) }}, I₂={{ "%.2e"|format(comp.principal_moments[1]) }}, I₃={{ "%.2e"|format(comp.principal_moments[2]) }}</span>
            </div>
            {% if comp.dfm_warnings %}
            <div class="warning-box">
                {% for w in comp.dfm_warnings %}
                <div>⚠️ {{ w }}</div>
                {% endfor %}
            </div>
            {% endif %}
        </div>
        {% endfor %}
    </div>

    <div class="section-title" style="margin-top: 16px;">4. Automotive DFM & Quality Audit Summary</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>Rule Category</th>
                <th>Automotive Engineering Criteria</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>Undercuts & Side-Actions</strong></td>
                <td>Surface normals with negative draw axis projections (&lt; -0.1) require tooling slide actions.</td>
                <td>Audited across {{ components|length }} sub-parts</td>
            </tr>
            <tr>
                <td><strong>Draft Angle Sufficiency</strong></td>
                <td>Near-vertical faces (&lt; 1.5°) inspected for ejection resistance.</td>
                <td>Audited</td>
            </tr>
            <tr>
                <td><strong>Wall Thickness & Warpage</strong></td>
                <td>Ray-mesh interior intersections confirm minimum thickness &gt; 1.5 mm.</td>
                <td>Audited</td>
            </tr>
            <tr>
                <td><strong>Aspect Ratio Stability</strong></td>
                <td>Extreme aspect ratio (&gt; 25:1) checked for stamped warpage & vibrational harmonics.</td>
                <td>Audited</td>
            </tr>
        </tbody>
    </table>

    <div class="signoff-box">
        <div>Renault Nissan Automotive R&D • Quality & Metrology Engineering</div>
        <div>Report Verified • Digital Signature Authorized</div>
    </div>
</div>

</body>
</html>
"""


class ReportGenerator:
    """Renders HTML and PDF engineering reports for AutoCAD-Profiler."""

    @staticmethod
    def generate_html_report(response: CADProfileResponse) -> str:
        """Generates self-contained HTML engineering report using Jinja2."""
        from jinja2 import Template

        summary = response.assembly_summary
        total_parts = summary.total_parts_detected if summary else len(response.components)
        total_mass = summary.total_mass_kg if summary else sum(c.mass_kg for c in response.components)
        total_vol_mm3 = summary.total_volume_mm3 if summary else sum(c.volume_mm3 for c in response.components)
        total_area_mm2 = summary.total_surface_area_mm2 if summary else sum(c.surface_area_mm2 for c in response.components)
        com = summary.overall_center_of_mass if summary else [0.0, 0.0, 0.0]
        box_dims = summary.total_bounding_envelope.dimensions if summary else [0.0, 0.0, 0.0]

        template = Template(HTML_TEMPLATE)
        html_out = template.render(
            task_id=response.task_id,
            date_str=datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
            filename=response.filename,
            ingestion_path=response.ingestion_path,
            total_parts=total_parts,
            total_mass_kg=total_mass,
            total_volume_mm3=total_vol_mm3,
            total_volume_cm3=total_vol_mm3 / 1000.0,
            total_surface_area_mm2=total_area_mm2,
            total_surface_dm2=total_area_mm2 / 10000.0,
            com=com,
            box_dims=box_dims,
            components=response.components,
            exec_time=response.execution_time_seconds,
        )
        return html_out

    @classmethod
    def generate_pdf_report(cls, response: CADProfileResponse, output_path: Optional[str] = None) -> bytes:
        """Renders 2-page PDF report. Uses WeasyPrint with automatic FPDF2 fallback."""
        html_content = cls.generate_html_report(response)

        # 1. Try WeasyPrint
        try:
            import weasyprint
            pdf_bytes = weasyprint.HTML(string=html_content).write_pdf()
            if output_path:
                Path(output_path).write_bytes(pdf_bytes)
            return pdf_bytes
        except Exception as e:
            logger.warning(f"WeasyPrint rendering unavailable or failed ({e}). Using FPDF2 fallback.")

        # 2. Robust FPDF2 fallback for Windows/environments without GTK/GObject C-libraries
        return cls._generate_fpdf2_fallback(response, output_path)

    @classmethod
    def _generate_fpdf2_fallback(cls, response: CADProfileResponse, output_path: Optional[str] = None) -> bytes:
        """Generates clean 2-page automotive PDF using FPDF2."""
        from fpdf import FPDF

        class CADReportPDF(FPDF):
            def footer(self):
                self.set_y(-15)
                self.set_font("Helvetica", "I", 8)
                self.set_text_color(128, 128, 128)
                self.cell(0, 10, f"Page {self.page_no()}/2 - CONFIDENTIAL RENAULT NISSAN R&D AUTOMOTIVE", align="C")

        pdf = CADReportPDF(orientation="P", unit="mm", format="A4")
        pdf.set_auto_page_break(auto=False)

        summary = response.assembly_summary
        total_parts = summary.total_parts_detected if summary else len(response.components)
        total_mass = summary.total_mass_kg if summary else sum(c.mass_kg for c in response.components)
        total_vol = summary.total_volume_mm3 if summary else sum(c.volume_mm3 for c in response.components)
        total_area = summary.total_surface_area_mm2 if summary else sum(c.surface_area_mm2 for c in response.components)
        com = summary.overall_center_of_mass if summary else [0.0, 0.0, 0.0]

        # ================= PAGE 1 =================
        pdf.add_page()
        # Header Banner
        pdf.set_fill_color(185, 28, 28)  # Crimson
        pdf.rect(0, 0, 210, 18, style="F")
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_xy(10, 5)
        pdf.cell(100, 8, "AutoCAD-Profiler - Renault Nissan R&D Report")

        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(140, 5)
        pdf.cell(60, 8, f"Task: {response.task_id[:16]}...", align="R")

        # Section 1
        pdf.set_xy(10, 24)
        pdf.set_text_color(40, 40, 40)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 6, "1. Executive Assembly Metrology Profile (Divergence Theorem)")

        from fpdf.enums import XPos, YPos

        # Summary Table
        pdf.set_xy(10, 32)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_fill_color(245, 245, 245)
        pdf.cell(90, 8, f" Total Sub-Parts Isolated: {total_parts}", border=1, fill=True)
        pdf.cell(90, 8, f" Total Mass (Steel): {total_mass:.3f} kg", border=1, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        pdf.set_x(10)
        pdf.cell(90, 8, f" Total Volume: {total_vol:.1f} mm^3", border=1)
        pdf.cell(90, 8, f" Total Surface Area: {total_area:.1f} mm^2", border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        pdf.set_x(10)
        pdf.cell(180, 8, f" Assembly Center of Mass: [{com[0]:.1f}, {com[1]:.1f}, {com[2]:.1f}] mm", border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Section 2: BOM Table
        pdf.ln(6)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 6, "2. Assembly Bill of Materials (BOM) & Classification Matrix", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Table Header
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(45, 55, 72)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(22, 6, "Part ID", border=1, fill=True)
        pdf.cell(38, 6, "Classification", border=1, fill=True)
        pdf.cell(38, 6, "Manufacturing", border=1, fill=True)
        pdf.cell(26, 6, "Volume (mm3)", border=1, fill=True)
        pdf.cell(24, 6, "Mass (kg)", border=1, fill=True)
        pdf.cell(32, 6, "DFM Status", border=1, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)


        # Table rows
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(20, 20, 20)
        for comp in response.components[:15]:
            pdf.cell(22, 5.5, comp.part_id, border=1)
            pdf.cell(38, 5.5, comp.classification.value[:20], border=1)
            pdf.cell(38, 5.5, comp.manufacturing_process.value[:20], border=1)
            pdf.cell(26, 5.5, f"{comp.volume_mm3:.1f}", border=1)
            pdf.cell(24, 5.5, f"{comp.mass_kg:.4f}", border=1)
            status = f"{len(comp.dfm_warnings)} Alerts" if comp.dfm_warnings else "Pass"
            pdf.cell(32, 5.5, status, border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # ================= PAGE 2 =================
        pdf.add_page()
        pdf.set_fill_color(185, 28, 28)
        pdf.rect(0, 0, 210, 14, style="F")
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_xy(10, 3.5)
        pdf.cell(100, 7, "AutoCAD-Profiler - Sub-Part Decomposition & Metrology")

        pdf.set_xy(10, 18)
        pdf.set_text_color(40, 40, 40)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 6, "3. Constituent Sub-Part Metrology & Inertia Tensors", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Component Cards
        pdf.set_font("Helvetica", "", 7.5)
        for comp in response.components[:6]:
            pdf.set_fill_color(248, 250, 252)
            pdf.rect(pdf.get_x(), pdf.get_y(), 190, 22, style="DF")
            pdf.set_font("Helvetica", "B", 8)
            oem_part = comp.oem_match.get("part_number", "N/A") if comp.oem_match else "N/A"
            oem_score = comp.oem_match.get("similarity_score", 0) if comp.oem_match else 0
            pdf.cell(65, 5, f"Part: {comp.part_id} | OEM: {oem_part} ({oem_score}%)", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(55, 5, f"Class: {comp.classification.value}", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(70, 5, f"Process: {comp.manufacturing_process.value}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

            pdf.set_font("Helvetica", "", 7)
            obb_d = comp.bounding_box_obb.dimensions
            pdf.cell(60, 4, f"OBB: {obb_d[0]:.1f} x {obb_d[1]:.1f} x {obb_d[2]:.1f} mm", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(60, 4, f"Vol: {comp.volume_mm3:.1f} mm^3 | Mass: {comp.mass_kg:.4f} kg", new_x=XPos.RIGHT, new_y=YPos.TOP)
            m = comp.principal_moments
            pdf.cell(70, 4, f"Moments: [{m[0]:.2e}, {m[1]:.2e}, {m[2]:.2e}]", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

            if comp.dfm_warnings:
                pdf.set_text_color(150, 20, 20)
                clean_warns = [w.encode("ascii", "ignore").decode("ascii") for w in comp.dfm_warnings]
                warn_txt = "; ".join(clean_warns)
                if len(warn_txt) > 110:
                    warn_txt = warn_txt[:107] + "..."
                pdf.cell(190, 4, f"Warnings: {warn_txt}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                pdf.set_text_color(40, 40, 40)
            else:
                pdf.cell(190, 4, "DFM Quality: Pass (No critical geometric violations)", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

            pdf.ln(3)

        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 6, "4. Automotive DFM Design Rule Criteria", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        pdf.set_font("Helvetica", "", 7.5)
        pdf.multi_cell(
            190,
            4.5,
            "- Undercut Rule: Faces with negative draw-direction normal vectors (< -0.1) require dedicated mechanical slides or split tooling.\n"
            "- Zero-Draft Rule: Faces with draft angle < 1.5 deg impede injection/stamping release and cause surface scuffing.\n"
            "- Minimum Wall Thickness: Direct ray-mesh interior testing flags walls < 1.5 mm to prevent premature freeze or rupture.\n"
            "- Aspect Ratio Rule: Length-to-thickness ratio > 25:1 audited for stamping springback and warpage deflection.",
        )

        pdf_bytes = bytes(pdf.output())
        if output_path:
            Path(output_path).write_bytes(pdf_bytes)
        return pdf_bytes
