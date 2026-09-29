/**
 * Core domain types for AutoCAD-Profiler Client-Side SPA.
 * Built for Renault Nissan Automotive R&D specification.
 * Supports the 3 Core AI/ML Tasks:
 * 1. Semantic & Boundary Disambiguation
 * 2. Multi-Task Classification (Semantic, Manufacturing, Machining Features)
 * 3. 512-D Metric Learning & OEM Catalog Retrieval
 */

export enum ComponentClass {
  FASTENER_BOLT = 'Fastener/Bolt',
  BRACKET = 'Bracket',
  FLANGE = 'Flange',
  HOUSING_CASING = 'Housing/Casing',
  SHAFT = 'Shaft',
  GEAR = 'Gear',
  SHEET_METAL_PANEL = 'Sheet Metal Panel',
  SUSPENSION_ARM = 'Suspension Arm',
  DUCT = 'Air/Fluid Duct',
  STRUCTURAL_FRAME = 'Structural Frame',
  UNKNOWN = 'Unknown / Custom Component',
}

export enum ManufacturingProcess {
  HPDC = 'High-Pressure Die Casting (HPDC)',
  CNC_3AXIS = '3-Axis CNC Milled',
  CNC_5AXIS = '5-Axis CNC Milled',
  STAMPING = 'Sheet Metal Stamping',
  ADDITIVE = 'Additive Manufacturing',
  INJECTION_MOLDED = 'Injection Molded',
  UNKNOWN = 'Unknown / Undetermined',
}

export enum MachiningFeature {
  THRU_HOLES = 'Thru-Holes',
  BLIND_HOLES = 'Blind Holes',
  POCKETS = 'Internal Pockets',
  CHAMFERS = 'Chamfers / Fillets',
  O_RING_GROOVES = 'O-Ring Seal Grooves',
}

export interface OEMPartMatch {
  partNumber: string;
  description: string;
  similarityPercent: number;
  catalogBOM: string;
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
  machiningFeatures: string[];
  oemMatch: OEMPartMatch;
  embedding512: number[];
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
  manufacturingFeatures?: ManufacturingFeaturesReport;
  gdtReport?: GDTReport;
}

export interface AssemblySummary {
  totalPartsDetected: number;
  totalBoundingEnvelope: BoundingEnvelope;
  overallCenterOfMass: [number, number, number];
  totalMassKg: number;
  totalVolumeMm3: number;
  totalSurfaceAreaMm2: number;
}

// =============================================================================
// Manufacturing Features & GD&T Types
// =============================================================================

export enum HoleType {
  THROUGH_HOLE = 'Through-Hole',
  BLIND_HOLE = 'Blind Hole',
  COUNTERBORED_HOLE = 'Counterbored Hole',
  COUNTERSUNK_HOLE = 'Countersunk Hole',
  STEPPED_BORE = 'Stepped Bearing Bore',
}

export enum PocketType {
  CLOSED_POCKET = 'Closed Internal Pocket',
  OPEN_POCKET = 'Open Pocket',
  THROUGH_SLOT = 'Through Slot',
  BLIND_SLOT = 'Blind Slot / Keyway',
  DEEP_CAVITY = 'Deep Cavity',
}

export enum GrooveType {
  O_RING_GROOVE = 'O-Ring Seal Groove',
  RETAINING_RING_GROOVE = 'Retaining Ring / Circlip Groove',
  SHOULDER_RELIEF = 'Shoulder Undercut / Neck Relief',
  OIL_GROOVE = 'Lubrication Oil Channel',
}

export enum ToolApproachDirection {
  POS_Z = '+Z (Top Face Approach)',
  NEG_Z = '-Z (Bottom Face Approach)',
  POS_X = '+X (Front Face Approach)',
  NEG_X = '-X (Rear Face Approach)',
  POS_Y = '+Y (Right Face Approach)',
  NEG_Y = '-Y (Left Face Approach)',
  COMPOUND_INCLINED = 'Inclined / Multi-Axis (5-Axis Required)',
}

export interface HoleFeature {
  holeId: string;
  diameterMm: number;
  radiusMm: number;
  depthMm: number;
  aspectRatio: number; // L/D
  axisVector: [number, number, number];
  entryPoint: [number, number, number];
  holeType: HoleType;
  counterboreDiaMm?: number;
  counterboreDepthMm?: number;
  threadDesignation?: string; // e.g. "M6 x 1.0"
  fitStandardIso286: string;
  toolApproach: ToolApproachDirection;
  isChatterRisk: boolean;
}

export interface HolePatternFeature {
  patternId: string;
  patternType: string; // e.g. "Bolt Circle (PCD)" or "Rectangular Mounting Flange Array"
  pitchCircleDiameterMm: number;
  holeCount: number;
  holeDiameterMm: number;
  patternCenter: [number, number, number];
  patternAxis: [number, number, number];
  angularSpacingDeg: number;
  isEquispaced: boolean;
  holeIds: string[];
}

export interface PocketFeature {
  pocketId: string;
  pocketType: PocketType;
  depthMm: number;
  floorAreaMm2: number;
  lengthMm: number;
  widthMm: number;
  minCornerRadiusMm: number;
  maxToolDiameterMm: number; // 2 * minCornerRadiusMm
  depthToWidthRatio: number;
  toolApproach: ToolApproachDirection;
  isDeepCavity: boolean;
  hasSharpInternalCorners: boolean;
}

export interface GrooveFeature {
  grooveId: string;
  grooveType: GrooveType;
  innerDiameterMm: number;
  outerDiameterMm: number;
  widthMm: number;
  depthMm: number;
  axisVector: [number, number, number];
  centerPoint: [number, number, number];
  standardSpecification: string;
}

export interface PlanarFaceFeature {
  faceId: string;
  normalVector: [number, number, number];
  orientation: ToolApproachDirection;
  surfaceAreaMm2: number;
  centerPoint: [number, number, number];
  isPrimaryDatumCandidate: boolean;
  isSecondaryDatumCandidate: boolean;
  isTertiaryDatumCandidate: boolean;
}

export interface FilletFeature {
  filletId: string;
  radiusMm: number;
  isInternalConcave: boolean;
  lengthMm: number;
  toolCutterRisk: boolean;
}

export interface CNCSetupSummary {
  uniqueApproachDirections: string[];
  minimumSetups3Axis: number;
  is5AxisRequired: boolean;
  minMillingToolDiameterMm: number;
  maxHoleDepthMm: number;
  maxToolAspectRatioLd: number;
  surfaceFinishRecommendations: Record<string, string>;
  dfmCriticalFlags: string[];
  dfmWarnings: string[];
}

export interface ManufacturingFeaturesReport {
  totalHolesCount: number;
  holes: HoleFeature[];
  holePatterns: HolePatternFeature[];
  totalPocketsCount: number;
  pockets: PocketFeature[];
  totalGroovesCount: number;
  grooves: GrooveFeature[];
  totalPlanarFacesCount: number;
  planarFaces: PlanarFaceFeature[];
  fillets: FilletFeature[];
  toolingAndSetups: CNCSetupSummary;
}

export enum GDTSymbol {
  FLATNESS = 'Flatness [Flat]',
  CYLINDRICITY = 'Cylindricity [Cyl]',
  CIRCULARITY = 'Circularity / Roundness [Circ]',
  STRAIGHTNESS = 'Straightness [Str]',
  PERPENDICULARITY = 'Perpendicularity [Perp]',
  PARALLELISM = 'Parallelism [//]',
  ANGULARITY = 'Angularity [Ang]',
  POSITION = 'True Position [Pos]',
  COAXIALITY = 'Coaxiality / Concentricity [Coax]',
  RUNOUT = 'Circular Runout [Runout]',
}

export enum ToleranceZoneShape {
  DIAMETRAL = 'Diametral Zone (Dia)',
  PLANAR = 'Two Parallel Planes',
  CYLINDRICAL = 'Cylindrical Boundary',
}

export enum GDTStatus {
  PASS = 'PASS (Within Tolerance)',
  REVIEW = 'REVIEW (Borderline Tolerance)',
  FAIL = 'FAIL (Out of Tolerance)',
}

export interface DatumDefinition {
  datumLabel: string; // "A", "B", "C"
  datumType: string;
  featureId: string;
  normalOrAxis: [number, number, number];
  originPoint: [number, number, number];
  surfaceAreaMm2?: number;
  roleDescription: string;
}

export interface FeatureControlFrame {
  characteristic: GDTSymbol;
  featureId: string;
  featureName: string;
  toleranceZone: ToleranceZoneShape;
  specifiedToleranceMm: number;
  measuredDeviationMm: number;
  datumsReferenced: string[]; // e.g. ["A", "B", "C"]
  status: GDTStatus;
  engineeringRationale: string;
  isoStandardReference: string;
}

export interface ISO286FitRecommendation {
  featureId: string;
  nominalSizeMm: number;
  fitDesignation: string; // "H7/g6", "H6/k6"
  holeToleranceZone: string;
  shaftToleranceZone: string;
  fitType: string;
  functionalApplication: string;
}

export interface SurfaceFinishCallout {
  featureId: string;
  featureDescription: string;
  requiredRaUm: number;
  processCapability: string;
  sealingCritical: boolean;
}

export interface GDTReport {
  datumReferenceFrame: DatumDefinition[];
  featureControlFrames: FeatureControlFrame[];
  iso286Fits: ISO286FitRecommendation[];
  surfaceFinishCallouts: SurfaceFinishCallout[];
  generalToleranceClass: string;
  totalGdtCalloutsCount: number;
  passedCount: number;
  reviewCount: number;
}

export interface CADModelProfile {
  fileName: string;
  fileSizeBytes: number;
  ingestionPath: 'parametric_brep' | 'discrete_mesh';
  assemblySummary: AssemblySummary;
  components: ComponentProfile[];
  manufacturingFeatures?: ManufacturingFeaturesReport;
  gdtReport?: GDTReport;
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
