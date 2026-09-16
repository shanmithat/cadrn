/**
 * Client-Side Part Decomposition & In-Browser Deep Learning Inference Engine.
 * Segments merged/unioned solids at sharp concave seams and classifies parts
 * using onnxruntime-web (WebGPU with WebAssembly fallback) and geometric rules.
 */

import * as ort from 'onnxruntime-web';
import { ParsedMeshData } from './cadParser';
import { AnalyticalMetrology } from './metrology';
import {
  ComponentClass,
  ComponentProfile,
  ManufacturingProcess,
} from './types';

// Palette of distinct automotive engineering colors for sub-part visual distinction
export const PART_COLOR_PALETTE = [
  '#0284c7', // Sky blue
  '#e11d48', // Crimson red
  '#16a34a', // Emerald green
  '#d97706', // Amber orange
  '#7c3aed', // Royal purple
  '#0d9488', // Teal
  '#db2777', // Fuchsia pink
  '#ea580c', // Bright orange
  '#4f46e5', // Indigo
  '#65a30d', // Lime
];

export interface SegmentedMeshPart {
  partId: string;
  faceIndices: number[];
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  color: string;
}

export class PartDecompositionEngine {
  private static onnxSession: ort.InferenceSession | null = null;
  private static isModelLoading: boolean = false;

  /**
   * Initializes the ONNX Runtime Web session for model_quant.onnx.
   */
  public static async initONNX(modelPath: string = 'models/model_quant.onnx'): Promise<void> {
    if (this.onnxSession || this.isModelLoading) return;
    this.isModelLoading = true;

    try {
      // Configure ONNX Web to try WebGPU first, then Wasm with multi-threading / SIMD
      ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
      ort.env.wasm.simd = true;

      this.onnxSession = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
      });
      console.log('[AutoCAD-Profiler] ONNX Web session initialized successfully.');
    } catch (err) {
      console.warn('[AutoCAD-Profiler] WebGPU/ONNX model load warning, falling back to Wasm/rules:', err);
      try {
        this.onnxSession = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['wasm'],
        });
      } catch (wasmErr) {
        console.warn('[AutoCAD-Profiler] ONNX model offline, heuristic classification active:', wasmErr);
      }
    } finally {
      this.isModelLoading = false;
    }
  }

  /**
   * Decomposes merged CAD geometry into constituent sub-components via concave seam cuts.
   */
  public static segmentMesh(meshData: ParsedMeshData, minFacesPerPart: number = 8): SegmentedMeshPart[] {
    const numFaces = Math.floor(meshData.indices.length / 3);
    if (numFaces <= minFacesPerPart) {
      return [this.createSubMesh(meshData, Array.from({ length: numFaces }, (_, i) => i), 'PART_001', 0)];
    }

    // Build face adjacency graph omitting concave boundary seams
    const adjList: number[][] = Array.from({ length: numFaces }, () => []);

    for (let i = 0; i < meshData.faceAdjacency.length; i++) {
      const [fA, fB] = meshData.faceAdjacency[i];
      const isConcave = meshData.isConcaveEdge[i];
      const angle = meshData.dihedralAngles[i];

      // Seam cut: If angle is sharply concave (angle > 30 deg and isConcave), cut the link
      if (isConcave && angle > 0.45) {
        continue; // Boundary seam cut between joined parts
      }

      adjList[fA].push(fB);
      adjList[fB].push(fA);
    }

    // Connected component labeling (Breadth-First Search)
    const visited = new Uint8Array(numFaces);
    const rawClusters: number[][] = [];

    for (let f = 0; f < numFaces; f++) {
      if (visited[f]) continue;

      const cluster: number[] = [];
      const queue: number[] = [f];
      visited[f] = 1;

      while (queue.length > 0) {
        const curr = queue.shift()!;
        cluster.push(curr);

        for (const neighbor of adjList[curr]) {
          if (!visited[neighbor]) {
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }

      if (cluster.length >= minFacesPerPart) {
        rawClusters.push(cluster);
      }
    }

    // If all faces were filtered into tiny disconnected fragments or single body
    if (rawClusters.length === 0) {
      return [this.createSubMesh(meshData, Array.from({ length: numFaces }, (_, i) => i), 'PART_001', 0)];
    }

    // Convert clusters to sub-mesh parts
    const parts: SegmentedMeshPart[] = [];
    for (let i = 0; i < rawClusters.length; i++) {
      const partId = `PART_${(i + 1).toString().padStart(3, '0')}`;
      parts.push(this.createSubMesh(meshData, rawClusters[i], partId, i));
    }

    return parts;
  }

  /**
   * Constructs an isolated Three.js-compatible indexed sub-mesh from face indices.
   */
  private static createSubMesh(
    meshData: ParsedMeshData,
    faceIndices: number[],
    partId: string,
    paletteIndex: number
  ): SegmentedMeshPart {
    const vMap = new Map<number, number>();
    const subVertices: number[] = [];
    const subNormals: number[] = [];
    const subIndices: number[] = [];

    for (const f of faceIndices) {
      for (let k = 0; k < 3; k++) {
        const origVIdx = meshData.indices[f * 3 + k];
        let newVIdx = vMap.get(origVIdx);
        if (newVIdx === undefined) {
          newVIdx = subVertices.length / 3;
          vMap.set(origVIdx, newVIdx);
          subVertices.push(
            meshData.vertices[origVIdx * 3],
            meshData.vertices[origVIdx * 3 + 1],
            meshData.vertices[origVIdx * 3 + 2]
          );
          subNormals.push(
            meshData.normals[origVIdx * 3],
            meshData.normals[origVIdx * 3 + 1],
            meshData.normals[origVIdx * 3 + 2]
          );
        }
        subIndices.push(newVIdx);
      }
    }

    const color = PART_COLOR_PALETTE[paletteIndex % PART_COLOR_PALETTE.length];

    return {
      partId,
      faceIndices,
      vertices: new Float32Array(subVertices),
      normals: new Float32Array(subNormals),
      indices: new Uint32Array(subIndices),
      color,
    };
  }

  /**
   * Furthest Point Sampling (FPS) to extract N = 2048 uniformly distributed points [x, y, z, nx, ny, nz].
   */
  public static furthestPointSampling(
    vertices: Float32Array,
    normals: Float32Array,
    numSamples: number = 2048
  ): Float32Array {
    const totalPoints = Math.floor(vertices.length / 3);
    const result = new Float32Array(numSamples * 6);

    if (totalPoints === 0) return result;

    if (totalPoints <= numSamples) {
      // If fewer points than numSamples, repeat/pad
      for (let i = 0; i < numSamples; i++) {
        const idx = (i % totalPoints) * 3;
        const outIdx = i * 6;
        result[outIdx] = vertices[idx];
        result[outIdx + 1] = vertices[idx + 1];
        result[outIdx + 2] = vertices[idx + 2];
        result[outIdx + 3] = normals[idx];
        result[outIdx + 4] = normals[idx + 1];
        result[outIdx + 5] = normals[idx + 2];
      }
      return result;
    }

    const sampledIndices = new Int32Array(numSamples);
    const minDists = new Float32Array(totalPoints).fill(Infinity);

    // Initial point: furthest from origin
    let furthestIdx = 0;
    let maxD = -1;
    for (let i = 0; i < totalPoints; i++) {
      const x = vertices[i * 3], y = vertices[i * 3 + 1], z = vertices[i * 3 + 2];
      const d = x * x + y * y + z * z;
      if (d > maxD) {
        maxD = d;
        furthestIdx = i;
      }
    }
    sampledIndices[0] = furthestIdx;

    for (let k = 1; k < numSamples; k++) {
      const lastIdx = sampledIndices[k - 1];
      const lx = vertices[lastIdx * 3];
      const ly = vertices[lastIdx * 3 + 1];
      const lz = vertices[lastIdx * 3 + 2];

      let nextFurthest = 0;
      let nextMaxDist = -1;

      // Update distance to nearest sampled point so far
      for (let i = 0; i < totalPoints; i++) {
        const dx = vertices[i * 3] - lx;
        const dy = vertices[i * 3 + 1] - ly;
        const dz = vertices[i * 3 + 2] - lz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < minDists[i]) {
          minDists[i] = distSq;
        }

        if (minDists[i] > nextMaxDist) {
          nextMaxDist = minDists[i];
          nextFurthest = i;
        }
      }

      sampledIndices[k] = nextFurthest;
    }

    // Populate result buffer [x, y, z, nx, ny, nz]
    for (let i = 0; i < numSamples; i++) {
      const sIdx = sampledIndices[i] * 3;
      const rIdx = i * 6;
      result[rIdx] = vertices[sIdx];
      result[rIdx + 1] = vertices[sIdx + 1];
      result[rIdx + 2] = vertices[sIdx + 2];
      result[rIdx + 3] = normals[sIdx];
      result[rIdx + 4] = normals[sIdx + 1];
      result[rIdx + 5] = normals[sIdx + 2];
    }

    return result;
  }

  /**
   * Runs in-browser deep learning classification using onnxruntime-web.
   */
  public static async classifySegment(
    part: SegmentedMeshPart,
    volume: number,
    area: number
  ): Promise<{ classification: ComponentClass; manufacturingProcess: ManufacturingProcess }> {
    const obb = AnalyticalMetrology.computeOrientedBoundingBox(part.vertices);

    // If ONNX session is loaded, execute WebGPU/Wasm neural inference
    if (this.onnxSession) {
      try {
        const fpsPoints = this.furthestPointSampling(part.vertices, part.normals, 2048);
        // Reshape to [1, 6, 2048] for PointNet/PointNeXt Conv1d
        const tensorData = new Float32Array(1 * 6 * 2048);
        for (let c = 0; c < 6; c++) {
          for (let p = 0; p < 2048; p++) {
            tensorData[c * 2048 + p] = fpsPoints[p * 6 + c];
          }
        }

        const inputTensor = new ort.Tensor('float32', tensorData, [1, 6, 2048]);
        const feeds: Record<string, ort.Tensor> = { point_cloud: inputTensor };
        const results = await this.onnxSession.run(feeds);

        const outputTensor = results.logits || Object.values(results)[0];
        if (outputTensor && outputTensor.data) {
          const logits = Array.from(outputTensor.data as Float32Array);
          const maxIdx = logits.indexOf(Math.max(...logits));

          const classMap = [
            ComponentClass.FASTENER_BOLT,
            ComponentClass.BRACKET,
            ComponentClass.FLANGE,
            ComponentClass.HOUSING_CASING,
            ComponentClass.SHEET_METAL_PANEL,
          ];

          const predictedClass = classMap[maxIdx] || ComponentClass.UNKNOWN;
          const processMap: Record<ComponentClass, ManufacturingProcess> = {
            [ComponentClass.FASTENER_BOLT]: ManufacturingProcess.CNC_MILLED,
            [ComponentClass.BRACKET]: ManufacturingProcess.STAMPED_FORMED,
            [ComponentClass.FLANGE]: ManufacturingProcess.CNC_MILLED,
            [ComponentClass.HOUSING_CASING]: ManufacturingProcess.HIGH_PRESSURE_DIE_CAST,
            [ComponentClass.SHEET_METAL_PANEL]: ManufacturingProcess.STAMPED_FORMED,
            [ComponentClass.SHAFT]: ManufacturingProcess.CNC_MILLED,
            [ComponentClass.GEAR]: ManufacturingProcess.CNC_MILLED,
            [ComponentClass.STRUCTURAL_FRAME]: ManufacturingProcess.STAMPED_FORMED,
            [ComponentClass.UNKNOWN]: ManufacturingProcess.UNKNOWN,
          };

          return {
            classification: predictedClass,
            manufacturingProcess: processMap[predictedClass] || ManufacturingProcess.UNKNOWN,
          };
        }
      } catch (err) {
        console.warn('[AutoCAD-Profiler] ONNX inference error; using analytical classifier fallback:', err);
      }
    }

    // Heuristic classification fallback
    const ruleResult = AnalyticalMetrology.classifyComponent(volume, area, obb);
    return {
      classification: ruleResult.classification,
      manufacturingProcess: ruleResult.process,
    };
  }

  /**
   * Generates a full ComponentProfile for a segmented sub-part.
   */
  public static async profileSegment(part: SegmentedMeshPart): Promise<ComponentProfile> {
    const massProps = AnalyticalMetrology.computeExactMassProperties(part.vertices, part.indices);
    const obb = AnalyticalMetrology.computeOrientedBoundingBox(part.vertices);
    const dfm = AnalyticalMetrology.evaluateDFM(part.normals, obb, massProps.volumeMm3, massProps.surfaceAreaMm2);

    const { classification, manufacturingProcess } = await this.classifySegment(
      part,
      massProps.volumeMm3,
      massProps.surfaceAreaMm2
    );

    const areaToVol = massProps.surfaceAreaMm2 / Math.max(massProps.volumeMm3, 1e-6);

    return {
      partId: part.partId,
      classification,
      manufacturingProcess,
      volumeMm3: Math.round(massProps.volumeMm3 * 10) / 10,
      surfaceAreaMm2: Math.round(massProps.surfaceAreaMm2 * 10) / 10,
      centroidMm: [
        Math.round(massProps.centroidMm[0] * 100) / 100,
        Math.round(massProps.centroidMm[1] * 100) / 100,
        Math.round(massProps.centroidMm[2] * 100) / 100,
      ],
      principalMoments: [
        Number(massProps.principalMoments[0].toExponential(3)),
        Number(massProps.principalMoments[1].toExponential(3)),
        Number(massProps.principalMoments[2].toExponential(3)),
      ],
      boundingBoxObb: obb,
      dfmWarnings: dfm.warnings,
      areaToVolumeRatio: Math.round(areaToVol * 1000) / 1000,
      massKg: Math.round(massProps.massKg * 10000) / 10000,
      faceCount: Math.floor(part.indices.length / 3),
      vertices: part.vertices,
      normals: part.normals,
      indices: part.indices,
      color: part.color,
    };
  }
}
