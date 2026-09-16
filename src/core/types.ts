/**
 * Core domain types for AutoCAD-Profiler Client-Side SPA.
 * Built for Renault Nissan Automotive R&D specification.
 */

export enum ComponentClass {
  FASTENER_BOLT = 'Fastener/Bolt',
  BRACKET = 'Bracket',
  FLANGE = 'Flange',
  HOUSING_CASING = 'Housing/Casing',
  SHAFT = 'Shaft',
  GEAR = 'Gear',
  SHEET_METAL_PANEL = 'Sheet Metal Panel',
  STRUCTURAL_FRAME = 'Structural Frame',
  UNKNOWN = 'Unknown / Custom Component',
}

export enum ManufacturingProcess {
  STAMPED_FORMED = 'Stamped/Formed',
  CNC_MILLED = 'CNC Milled',
  HIGH_PRESSURE_DIE_CAST = 'High-Pressure Die Cast',
  ADDITIVE = 'Additive Manufacturing',
  UNKNOWN = 'Unknown / Undetermined',
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingEnvelope {
  minPt: [number, number, number];
  maxPt: [number, number, number];
  dimensions: [number, number, number];
}

export interface OrientedBoundingBox {
  center: [number, number, number];
  dimensions: [number, number, number]; // [Length, Width, Height]
  principalAxes: [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
}

export interface DFMReport {
  hasUndercuts: boolean;
  hasZeroDraft: boolean;
  aspectRatio: number;
  isExtremeAspectRatio: boolean;
  minWallThicknessMm: number | null;
  isThinWallCritical: boolean;
  warnings: string[];
}

export interface ComponentProfile {
  partId: string;
  classification: ComponentClass;
  manufacturingProcess: ManufacturingProcess;
  volumeMm3: number;
  surfaceAreaMm2: number;
  centroidMm: [number, number, number];
  principalMoments: [number, number, number];
  boundingBoxObb: OrientedBoundingBox;
  dfmWarnings: string[];
  areaToVolumeRatio: number;
  massKg: number;
  faceCount: number;
  // Sub-mesh geometry buffers for Three.js rendering
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  color: string;
}

export interface AssemblySummary {
  totalPartsDetected: number;
  totalBoundingEnvelope: BoundingEnvelope;
  overallCenterOfMass: [number, number, number];
  totalMassKg: number;
  totalVolumeMm3: number;
  totalSurfaceAreaMm2: number;
}

export interface CADModelProfile {
  fileName: string;
  fileSizeBytes: number;
  ingestionPath: 'parametric_brep' | 'discrete_mesh';
  assemblySummary: AssemblySummary;
  components: ComponentProfile[];
  rawVertices: Float32Array;
  rawNormals: Float32Array;
  rawIndices: Uint32Array;
  executionTimeMs: number;
}

export interface CADProcessingProgress {
  stage: 'reading' | 'tessellating' | 'segmenting' | 'inferring' | 'profiling' | 'completed' | 'error';
  progressPercent: number;
  message: string;
}
