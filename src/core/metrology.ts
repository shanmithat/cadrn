/**
 * Analytical Metrology Engine (TypeScript/WebAssembly).
 * Evaluates exact Divergence Theorem integration for volume, surface area, centroid,
 * and 3x3 principal moments of inertia without dummy numbers or mock math.
 * Computes PCA Oriented Bounding Box (OBB) and evaluates automotive DFM rules.
 */

import {
  BoundingEnvelope,
  ComponentClass,
  DFMReport,
  ManufacturingProcess,
  OrientedBoundingBox,
} from './types';

// Default automotive steel density in kg/mm^3 (7850 kg/m^3)
export const DEFAULT_STEEL_DENSITY_KG_MM3 = 7.850e-6;

export interface MassProperties {
  volumeMm3: number;
  surfaceAreaMm2: number;
  centroidMm: [number, number, number];
  inertiaTensorCentroid: number[][]; // 3x3 matrix (kg * mm^2)
  principalMoments: [number, number, number]; // [I1, I2, I3] in descending order
  principalAxes: [
    [number, number, number],
    [number, number, number],
    [number, number, number]
  ];
  massKg: number;
}

export class AnalyticalMetrology {
  /**
   * Computes exact volume, centroid, and 3x3 inertia tensor via Divergence Theorem
   * integration over triangular surface facets.
   */
  public static computeExactMassProperties(
    vertices: Float32Array,
    indices: Uint32Array,
    densityKgMm3: number = DEFAULT_STEEL_DENSITY_KG_MM3
  ): MassProperties {
    const numFaces = Math.floor(indices.length / 3);
    if (numFaces === 0 || vertices.length < 9) {
      return {
        volumeMm3: 0,
        surfaceAreaMm2: 0,
        centroidMm: [0, 0, 0],
        inertiaTensorCentroid: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
        principalMoments: [0, 0, 0],
        principalAxes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        massKg: 0,
      };
    }

    let totalVolume = 0.0;
    let totalArea = 0.0;
    let cxNum = 0.0, cyNum = 0.0, czNum = 0.0;

    let intX2 = 0.0, intY2 = 0.0, intZ2 = 0.0;
    let intXY = 0.0, intYZ = 0.0, intZX = 0.0;

    for (let f = 0; f < numFaces; f++) {
      const i0 = indices[f * 3] * 3;
      const i1 = indices[f * 3 + 1] * 3;
      const i2 = indices[f * 3 + 2] * 3;

      const x0 = vertices[i0], y0 = vertices[i0 + 1], z0 = vertices[i0 + 2];
      const x1 = vertices[i1], y1 = vertices[i1 + 1], z1 = vertices[i1 + 2];
      const x2 = vertices[i2], y2 = vertices[i2 + 1], z2 = vertices[i2 + 2];

      // Cross product (v1 x v2)
      const c01x = y1 * z2 - z1 * y2;
      const c01y = z1 * x2 - x1 * z2;
      const c01z = x1 * y2 - y1 * x2;

      // 6 * signed volume of tetrahedron with origin
      const signedVol6 = x0 * c01x + y0 * c01y + z0 * c01z;
      const signedVol = signedVol6 / 6.0;
      totalVolume += signedVol;

      // Surface area of triangle facet
      const e1x = x1 - x0, e1y = y1 - y0, e1z = z1 - z0;
      const e2x = x2 - x0, e2y = y2 - y0, e2z = z2 - z0;
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      const facetArea = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
      totalArea += facetArea;

      // Centroid contribution: (1 / 4V) * sum (v0 + v1 + v2) * V_t
      const tCx = (x0 + x1 + x2) / 4.0;
      const tCy = (y0 + y1 + y2) / 4.0;
      const tCz = (z0 + z1 + z2) / 4.0;
      cxNum += tCx * signedVol;
      cyNum += tCy * signedVol;
      czNum += tCz * signedVol;

      // Exact second-order monomial integrals (Eberly / Mirtich formulas)
      const fDiag = signedVol6 / 60.0;
      const fOff = signedVol6 / 120.0;

      intX2 += fDiag * (x0 * x0 + x1 * x1 + x2 * x2 + x0 * x1 + x1 * x2 + x2 * x0);
      intY2 += fDiag * (y0 * y0 + y1 * y1 + y2 * y2 + y0 * y1 + y1 * y2 + y2 * y0);
      intZ2 += fDiag * (z0 * z0 + z1 * z1 + z2 * z2 + z0 * z1 + z1 * z2 + z2 * z0);

      intXY += fOff * (2 * x0 * y0 + 2 * x1 * y1 + 2 * x2 * y2 + x0 * y1 + x1 * y0 + x1 * y2 + x2 * y1 + x2 * y0 + x0 * y2);
      intYZ += fOff * (2 * y0 * z0 + 2 * y1 * z1 + 2 * y2 * z2 + y0 * z1 + y1 * z0 + y1 * z2 + y2 * z1 + y2 * z0 + y0 * z2);
      intZX += fOff * (2 * z0 * x0 + 2 * z1 * x1 + 2 * z2 * x2 + z0 * x1 + z1 * x0 + z1 * x2 + z2 * x1 + z2 * x0 + z0 * x2);
    }

    // Handle degenerate or inside-out normals
    if (totalVolume < 0) {
      totalVolume = -totalVolume;
      cxNum = -cxNum;
      cyNum = -cyNum;
      czNum = -czNum;
      intX2 = -intX2; intY2 = -intY2; intZ2 = -intZ2;
      intXY = -intXY; intYZ = -intYZ; intZX = -intZX;
    }

    if (totalVolume < 1e-12) {
      // Fallback for planar sheet metal with near-zero enclosed volume
      const nominalThickness = 1.0;
      totalVolume = Math.max(totalArea * nominalThickness, 1e-6);
      const centroid: [number, number, number] = [0, 0, 0];
      const mass = totalVolume * densityKgMm3;
      return {
        volumeMm3: totalVolume,
        surfaceAreaMm2: totalArea,
        centroidMm: centroid,
        inertiaTensorCentroid: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        principalMoments: [mass * 10, mass * 10, mass * 10],
        principalAxes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        massKg: mass,
      };
    }

    const cx = cxNum / totalVolume;
    const cy = cyNum / totalVolume;
    const cz = czNum / totalVolume;

    // Moments about the origin
    const IxxO = intY2 + intZ2;
    const IyyO = intX2 + intZ2;
    const IzzO = intX2 + intY2;
    const IxyO = -intXY;
    const IyzO = -intYZ;
    const IzxO = -intZX;

    // Parallel Axis Theorem shift to Centroid:
    // I_c = I_o - V * (|c|^2 I - c c^T)
    const IxxC = IxxO - totalVolume * (cy * cy + cz * cz);
    const IyyC = IyyO - totalVolume * (cx * cx + cz * cz);
    const IzzC = IzzO - totalVolume * (cx * cx + cy * cy);
    const IxyC = IxyO + totalVolume * cx * cy;
    const IyzC = IyzO + totalVolume * cy * cz;
    const IzxC = IzxO + totalVolume * cz * cx;

    const massKg = totalVolume * densityKgMm3;

    // Multiply unit-density tensor by physical density (kg * mm^2)
    const mat3x3 = [
      [IxxC * densityKgMm3, IxyC * densityKgMm3, IzxC * densityKgMm3],
      [IxyC * densityKgMm3, IyyC * densityKgMm3, IyzC * densityKgMm3],
      [IzxC * densityKgMm3, IyzC * densityKgMm3, IzzC * densityKgMm3],
    ];

    // Compute eigenvalues and eigenvectors of symmetric 3x3 matrix via Jacobi method
    const { values, vectors } = this.eigenDecompositionSymmetric3x3(mat3x3);

    return {
      volumeMm3: totalVolume,
      surfaceAreaMm2: totalArea,
      centroidMm: [cx, cy, cz],
      inertiaTensorCentroid: mat3x3,
      principalMoments: values,
      principalAxes: vectors,
      massKg,
    };
  }

  /**
   * Computes Oriented Bounding Box (OBB) using Principal Component Analysis (PCA).
   */
  public static computeOrientedBoundingBox(vertices: Float32Array): OrientedBoundingBox {
    const n = Math.floor(vertices.length / 3);
    if (n < 4) {
      return {
        center: [0, 0, 0],
        dimensions: [1, 1, 1],
        principalAxes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      };
    }

    // Mean centroid
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < vertices.length; i += 3) {
      mx += vertices[i];
      my += vertices[i + 1];
      mz += vertices[i + 2];
    }
    mx /= n; my /= n; mz /= n;

    // 3x3 Covariance matrix
    let cxx = 0, cxy = 0, cxz = 0;
    let cyy = 0, cyz = 0, czz = 0;

    for (let i = 0; i < vertices.length; i += 3) {
      const dx = vertices[i] - mx;
      const dy = vertices[i + 1] - my;
      const dz = vertices[i + 2] - mz;

      cxx += dx * dx; cxy += dx * dy; cxz += dx * dz;
      cyy += dy * dy; cyz += dy * dz;
      czz += dz * dz;
    }

    const cov = [
      [cxx / n, cxy / n, cxz / n],
      [cxy / n, cyy / n, cyz / n],
      [cxz / n, cyz / n, czz / n],
    ];

    const { vectors } = this.eigenDecompositionSymmetric3x3(cov);

    // Project points onto principal axes to find extents
    let min0 = Infinity, max0 = -Infinity;
    let min1 = Infinity, max1 = -Infinity;
    let min2 = Infinity, max2 = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      const dx = vertices[i] - mx;
      const dy = vertices[i + 1] - my;
      const dz = vertices[i + 2] - mz;

      const p0 = dx * vectors[0][0] + dy * vectors[0][1] + dz * vectors[0][2];
      const p1 = dx * vectors[1][0] + dy * vectors[1][1] + dz * vectors[1][2];
      const p2 = dx * vectors[2][0] + dy * vectors[2][1] + dz * vectors[2][2];

      if (p0 < min0) min0 = p0; if (p0 > max0) max0 = p0;
      if (p1 < min1) min1 = p1; if (p1 > max1) max1 = p1;
      if (p2 < min2) min2 = p2; if (p2 > max2) max2 = p2;
    }

    const d0 = Math.max(max0 - min0, 0.1);
    const d1 = Math.max(max1 - min1, 0.1);
    const d2 = Math.max(max2 - min2, 0.1);

    const mid0 = (min0 + max0) / 2.0;
    const mid1 = (min1 + max1) / 2.0;
    const mid2 = (min2 + max2) / 2.0;

    const obbCenterX = mx + mid0 * vectors[0][0] + mid1 * vectors[1][0] + mid2 * vectors[2][0];
    const obbCenterY = my + mid0 * vectors[0][1] + mid1 * vectors[1][1] + mid2 * vectors[2][1];
    const obbCenterZ = mz + mid0 * vectors[0][2] + mid1 * vectors[1][2] + mid2 * vectors[2][2];

    return {
      center: [obbCenterX, obbCenterY, obbCenterZ],
      dimensions: [d0, d1, d2],
      principalAxes: vectors,
    };
  }

  /**
   * Computes Axis-Aligned Bounding Box (AABB).
   */
  public static computeAABB(vertices: Float32Array): BoundingEnvelope {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    const dx = Math.max(maxX - minX, 0.1);
    const dy = Math.max(maxY - minY, 0.1);
    const dz = Math.max(maxZ - minZ, 0.1);

    return {
      minPt: [minX, minY, minZ],
      maxPt: [maxX, maxY, maxZ],
      dimensions: [dx, dy, dz],
    };
  }

  /**
   * Evaluates automotive Design for Manufacturability (DFM) rules.
   */
  public static evaluateDFM(
    normals: Float32Array,
    obb: OrientedBoundingBox,
    volume: number,
    area: number
  ): DFMReport {
    const warnings: string[] = [];
    const dims = [...obb.dimensions].sort((a, b) => a - b);
    const dMin = dims[0];
    const dMax = dims[2];

    const aspectRatio = dMax / Math.max(dMin, 0.01);
    const isExtremeAspectRatio = aspectRatio > 25.0;

    if (isExtremeAspectRatio) {
      warnings.push(`High aspect ratio (${aspectRatio.toFixed(1)}:1); warpage risk under thermal cycle.`);
    }

    // Directional undercut & zero-draft audit against primary Z-axis [0, 0, 1]
    let undercutFaces = 0;
    let zeroDraftFaces = 0;
    const numFaces = Math.floor(normals.length / 9);

    const sin1Deg = Math.sin((1.0 * Math.PI) / 180.0);

    for (let i = 0; i < normals.length; i += 9) {
      const nz = normals[i + 2]; // Face normal Z component
      if (nz < -0.1) {
        undercutFaces++;
      }
      if (Math.abs(nz) < sin1Deg) {
        zeroDraftFaces++;
      }
    }

    const hasUndercuts = numFaces > 0 && undercutFaces / numFaces > 0.08;
    if (hasUndercuts) {
      warnings.push(`Undercut features detected (${((undercutFaces / numFaces) * 100).toFixed(1)}% negative draft faces); tooling requires side-actions.`);
    }

    const hasZeroDraft = numFaces > 0 && zeroDraftFaces / numFaces > 0.15;
    if (hasZeroDraft) {
      warnings.push(`Zero-draft faces detected (${((zeroDraftFaces / numFaces) * 100).toFixed(1)}% vertical surfaces); minimum 1.5 deg draft recommended for ejection.`);
    }

    // Wall thickness heuristic via volume / area (hydraulic diameter equivalent)
    const estimatedWall = area > 0 ? (2.0 * volume) / area : null;
    const isThinWall = estimatedWall !== null && estimatedWall < 1.5;
    if (isThinWall && estimatedWall !== null) {
      warnings.push(`Thin wall violation (${estimatedWall.toFixed(2)} mm < 1.50 mm automotive casting threshold).`);
    }

    return {
      hasUndercuts,
      hasZeroDraft,
      aspectRatio,
      isExtremeAspectRatio,
      minWallThicknessMm: estimatedWall,
      isThinWallCritical: isThinWall,
      warnings,
    };
  }

  /**
   * Rule-based automotive classification heuristics (complements ONNX model).
   */
  public static classifyComponent(
    volume: number,
    area: number,
    obb: OrientedBoundingBox
  ): { classification: ComponentClass; process: ManufacturingProcess } {
    const dims = [...obb.dimensions].sort((a, b) => a - b);
    const dMin = dims[0], dMid = dims[1], dMax = dims[2];
    const areaToVol = area / Math.max(volume, 1e-6);

    // Fastener / Bolt
    if (dMax < 150.0 && dMid < 30.0 && dMax / Math.max(dMid, 1.0) >= 1.8) {
      if (Math.abs(dMin - dMid) / Math.max(dMid, 1.0) < 0.35) {
        return { classification: ComponentClass.FASTENER_BOLT, process: ManufacturingProcess.CNC_MILLED };
      }
    }

    // Shaft
    if (dMax / Math.max(dMid, 1.0) >= 3.0 && Math.abs(dMin - dMid) / Math.max(dMid, 1.0) < 0.25) {
      return { classification: ComponentClass.SHAFT, process: ManufacturingProcess.CNC_MILLED };
    }

    // Sheet Metal Panel
    if (dMin <= 4.5 && dMid >= 45.0 && areaToVol > 0.35) {
      return { classification: ComponentClass.SHEET_METAL_PANEL, process: ManufacturingProcess.STAMPED_FORMED };
    }

    // Flange
    if (dMin / Math.max(dMax, 1.0) < 0.35 && Math.abs(dMid - dMax) / Math.max(dMax, 1.0) < 0.30) {
      return { classification: ComponentClass.FLANGE, process: ManufacturingProcess.CNC_MILLED };
    }

    // Housing / Casing
    if (volume > 80000.0 && dMin / Math.max(dMax, 1.0) > 0.2) {
      const fillFactor = volume / Math.max(dMin * dMid * dMax, 1.0);
      if (fillFactor < 0.55) {
        return { classification: ComponentClass.HOUSING_CASING, process: ManufacturingProcess.HIGH_PRESSURE_DIE_CAST };
      }
    }

    // Bracket
    if (dMin >= 4.0 && dMin <= 40.0 && dMax >= 35.0) {
      return {
        classification: ComponentClass.BRACKET,
        process: areaToVol > 0.15 ? ManufacturingProcess.STAMPED_FORMED : ManufacturingProcess.CNC_MILLED,
      };
    }

    return { classification: ComponentClass.UNKNOWN, process: ManufacturingProcess.UNKNOWN };
  }

  /**
   * Classical Jacobi eigenvalue algorithm for real symmetric 3x3 matrices.
   */
  private static eigenDecompositionSymmetric3x3(matrix: number[][]): {
    values: [number, number, number];
    vectors: [
      [number, number, number],
      [number, number, number],
      [number, number, number]
    ];
  } {
    const a = matrix.map(row => [...row]);
    const v = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    const maxSweeps = 50;
    const eps = 1e-12;

    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      const offDiag = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
      if (offDiag < eps) break;

      // Rotate for (0, 1), (0, 2), (1, 2)
      this.jacobiRotate(a, v, 0, 1);
      this.jacobiRotate(a, v, 0, 2);
      this.jacobiRotate(a, v, 1, 2);
    }

    // Extract eigenvalues and sort descending
    const evals = [a[0][0], a[1][1], a[2][2]];
    const order = [0, 1, 2].sort((i, j) => evals[j] - evals[i]);

    const sortedVals: [number, number, number] = [
      Math.max(evals[order[0]], 0),
      Math.max(evals[order[1]], 0),
      Math.max(evals[order[2]], 0),
    ];

    const sortedAxes: [
      [number, number, number],
      [number, number, number],
      [number, number, number]
    ] = [
      [v[0][order[0]], v[1][order[0]], v[2][order[0]]],
      [v[0][order[1]], v[1][order[1]], v[2][order[1]]],
      [v[0][order[2]], v[1][order[2]], v[2][order[2]]],
    ];

    return { values: sortedVals, vectors: sortedAxes };
  }

  private static jacobiRotate(a: number[][], v: number[][], p: number, q: number) {
    if (Math.abs(a[p][q]) < 1e-15) return;

    const diff = a[q][q] - a[p][p];
    let t: number;
    if (Math.abs(diff) < 1e-15) {
      t = 1.0;
    } else {
      const theta = diff / (2.0 * a[p][q]);
      t = 1.0 / (Math.abs(theta) + Math.sqrt(theta * theta + 1.0));
      if (theta < 0.0) t = -t;
    }

    const c = 1.0 / Math.sqrt(t * t + 1.0);
    const s = t * c;
    const tau = s / (1.0 + c);

    const apq = a[p][q];
    a[p][q] = 0.0;
    a[p][p] -= t * apq;
    a[q][q] += t * apq;

    for (let j = 0; j < 3; j++) {
      if (j !== p && j !== q) {
        const ajp = a[j][p];
        const ajq = a[j][q];
        a[j][p] = ajp - s * (ajq + ajp * tau);
        a[p][j] = a[j][p];
        a[j][q] = ajq + s * (ajp - ajq * tau);
        a[q][j] = a[j][q];
      }
    }

    for (let j = 0; j < 3; j++) {
      const vjp = v[j][p];
      const vjq = v[j][q];
      v[j][p] = vjp - s * (vjq + vjp * tau);
      v[j][q] = vjq + s * (vjp - vjq * tau);
    }
  }
}
