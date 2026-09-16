/**
 * High-performance In-Browser Discrete Mesh Parser (STL / OBJ).
 * Extracts raw vertices, normals, indices, and topological face-adjacency maps.
 */

export interface ParsedMeshData {
  vertices: Float32Array; // 3 * numVertices
  normals: Float32Array;  // 3 * numVertices
  indices: Uint32Array;   // 3 * numFaces
  faceNormals: Float32Array; // 3 * numFaces
  faceCenters: Float32Array; // 3 * numFaces
  faceAreas: Float32Array;   // numFaces
  faceAdjacency: Array<[number, number]>; // Array of [faceA, faceB]
  dihedralAngles: Float32Array; // Angle in radians between adjacent faces
  isConcaveEdge: Uint8Array;    // 1 if concave, 0 if convex/coplanar
}

export class DiscreteCADParser {
  /**
   * Parses binary or ASCII STL ArrayBuffer into high-performance Float32Arrays.
   */
  public static parseSTL(buffer: ArrayBuffer): ParsedMeshData {
    const isBinary = this.isBinarySTL(buffer);
    if (isBinary) {
      return this.parseBinarySTL(buffer);
    } else {
      const text = new TextDecoder().decode(buffer);
      return this.parseAsciiSTL(text);
    }
  }

  private static isBinarySTL(buffer: ArrayBuffer): boolean {
    if (buffer.byteLength < 84) return false;
    const reader = new DataView(buffer);
    const numFaces = reader.getUint32(80, true);
    // Exact binary STL file size formula: 80 bytes header + 4 bytes face count + numFaces * 50 bytes
    const expectedSize = 84 + numFaces * 50;
    return buffer.byteLength === expectedSize;
  }

  private static parseBinarySTL(buffer: ArrayBuffer): ParsedMeshData {
    const reader = new DataView(buffer);
    const numFaces = reader.getUint32(80, true);

    const rawVertices = new Float32Array(numFaces * 9);
    const rawNormals = new Float32Array(numFaces * 9);
    const faceNormals = new Float32Array(numFaces * 3);
    const faceCenters = new Float32Array(numFaces * 3);
    const faceAreas = new Float32Array(numFaces);

    let offset = 84;
    for (let f = 0; f < numFaces; f++) {
      // Normal vector in STL header
      let nx = reader.getFloat32(offset, true);
      let ny = reader.getFloat32(offset + 4, true);
      let nz = reader.getFloat32(offset + 8, true);
      offset += 12;

      // 3 vertices
      const v0x = reader.getFloat32(offset, true);
      const v0y = reader.getFloat32(offset + 4, true);
      const v0z = reader.getFloat32(offset + 8, true);
      offset += 12;

      const v1x = reader.getFloat32(offset, true);
      const v1y = reader.getFloat32(offset + 4, true);
      const v1z = reader.getFloat32(offset + 8, true);
      offset += 12;

      const v2x = reader.getFloat32(offset, true);
      const v2y = reader.getFloat32(offset + 4, true);
      const v2z = reader.getFloat32(offset + 8, true);
      offset += 14; // 12 bytes vertex + 2 bytes attribute byte count

      // Vector edges
      const e1x = v1x - v0x;
      const e1y = v1y - v0y;
      const e1z = v1z - v0z;

      const e2x = v2x - v0x;
      const e2y = v2y - v0y;
      const e2z = v2z - v0z;

      // Cross product for true face normal and area
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);

      if (crossLen > 1e-12) {
        nx = cx / crossLen;
        ny = cy / crossLen;
        nz = cz / crossLen;
      }
      const area = 0.5 * crossLen;

      // Store in buffers
      const vIdx = f * 9;
      rawVertices[vIdx] = v0x; rawVertices[vIdx + 1] = v0y; rawVertices[vIdx + 2] = v0z;
      rawVertices[vIdx + 3] = v1x; rawVertices[vIdx + 4] = v1y; rawVertices[vIdx + 5] = v1z;
      rawVertices[vIdx + 6] = v2x; rawVertices[vIdx + 7] = v2y; rawVertices[vIdx + 8] = v2z;

      rawNormals[vIdx] = nx; rawNormals[vIdx + 1] = ny; rawNormals[vIdx + 2] = nz;
      rawNormals[vIdx + 3] = nx; rawNormals[vIdx + 4] = ny; rawNormals[vIdx + 5] = nz;
      rawNormals[vIdx + 6] = nx; rawNormals[vIdx + 7] = ny; rawNormals[vIdx + 8] = nz;

      const fIdx = f * 3;
      faceNormals[fIdx] = nx; faceNormals[fIdx + 1] = ny; faceNormals[fIdx + 2] = nz;
      faceCenters[fIdx] = (v0x + v1x + v2x) / 3.0;
      faceCenters[fIdx + 1] = (v0y + v1y + v2y) / 3.0;
      faceCenters[fIdx + 2] = (v0z + v1z + v2z) / 3.0;
      faceAreas[f] = area;
    }

    return this.buildIndexedMesh(rawVertices, rawNormals, faceNormals, faceCenters, faceAreas, numFaces);
  }

  private static parseAsciiSTL(text: string): ParsedMeshData {
    const lines = text.split('\n');
    const verticesList: number[] = [];
    const normalsList: number[] = [];

    let currentNormal = [0, 0, 1];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('facet normal')) {
        const parts = line.split(/\s+/).slice(2).map(Number);
        if (parts.length === 3) currentNormal = parts;
      } else if (line.startsWith('vertex')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        if (parts.length === 3) {
          verticesList.push(parts[0], parts[1], parts[2]);
          normalsList.push(currentNormal[0], currentNormal[1], currentNormal[2]);
        }
      }
    }

    const numFaces = Math.floor(verticesList.length / 9);
    const rawVertices = new Float32Array(verticesList);
    const rawNormals = new Float32Array(normalsList);
    const faceNormals = new Float32Array(numFaces * 3);
    const faceCenters = new Float32Array(numFaces * 3);
    const faceAreas = new Float32Array(numFaces);

    for (let f = 0; f < numFaces; f++) {
      const vIdx = f * 9;
      const v0x = rawVertices[vIdx], v0y = rawVertices[vIdx + 1], v0z = rawVertices[vIdx + 2];
      const v1x = rawVertices[vIdx + 3], v1y = rawVertices[vIdx + 4], v1z = rawVertices[vIdx + 5];
      const v2x = rawVertices[vIdx + 6], v2y = rawVertices[vIdx + 7], v2z = rawVertices[vIdx + 8];

      const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
      const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const area = 0.5 * crossLen;

      const fIdx = f * 3;
      faceNormals[fIdx] = crossLen > 1e-12 ? cx / crossLen : rawNormals[vIdx];
      faceNormals[fIdx + 1] = crossLen > 1e-12 ? cy / crossLen : rawNormals[vIdx + 1];
      faceNormals[fIdx + 2] = crossLen > 1e-12 ? cz / crossLen : rawNormals[vIdx + 2];

      faceCenters[fIdx] = (v0x + v1x + v2x) / 3.0;
      faceCenters[fIdx + 1] = (v0y + v1y + v2y) / 3.0;
      faceCenters[fIdx + 2] = (v0z + v1z + v2z) / 3.0;
      faceAreas[f] = area;
    }

    return this.buildIndexedMesh(rawVertices, rawNormals, faceNormals, faceCenters, faceAreas, numFaces);
  }

  public static parseOBJ(text: string): ParsedMeshData {
    const lines = text.split('\n');
    const v: number[][] = [];
    const vn: number[][] = [];
    const faces: number[][] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('v ')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        v.push(parts);
      } else if (line.startsWith('vn ')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        vn.push(parts);
      } else if (line.startsWith('f ')) {
        const parts = line.split(/\s+/).slice(1);
        const fIndices = parts.map(p => {
          const idx = parseInt(p.split('/')[0], 10);
          return idx > 0 ? idx - 1 : v.length + idx;
        });
        if (fIndices.length === 3) {
          faces.push(fIndices);
        } else if (fIndices.length === 4) {
          // Triangulate quad
          faces.push([fIndices[0], fIndices[1], fIndices[2]]);
          faces.push([fIndices[0], fIndices[2], fIndices[3]]);
        }
      }
    }

    const numFaces = faces.length;
    const rawVertices = new Float32Array(numFaces * 9);
    const rawNormals = new Float32Array(numFaces * 9);
    const faceNormals = new Float32Array(numFaces * 3);
    const faceCenters = new Float32Array(numFaces * 3);
    const faceAreas = new Float32Array(numFaces);

    for (let f = 0; f < numFaces; f++) {
      const [i0, i1, i2] = faces[f];
      const p0 = v[i0] || [0, 0, 0];
      const p1 = v[i1] || [0, 0, 0];
      const p2 = v[i2] || [0, 0, 0];

      const vIdx = f * 9;
      rawVertices[vIdx] = p0[0]; rawVertices[vIdx + 1] = p0[1]; rawVertices[vIdx + 2] = p0[2];
      rawVertices[vIdx + 3] = p1[0]; rawVertices[vIdx + 4] = p1[1]; rawVertices[vIdx + 5] = p1[2];
      rawVertices[vIdx + 6] = p2[0]; rawVertices[vIdx + 7] = p2[1]; rawVertices[vIdx + 8] = p2[2];

      const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
      const e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const nx = crossLen > 1e-12 ? cx / crossLen : 0;
      const ny = crossLen > 1e-12 ? cy / crossLen : 0;
      const nz = crossLen > 1e-12 ? cz / crossLen : 1;

      rawNormals[vIdx] = nx; rawNormals[vIdx + 1] = ny; rawNormals[vIdx + 2] = nz;
      rawNormals[vIdx + 3] = nx; rawNormals[vIdx + 4] = ny; rawNormals[vIdx + 5] = nz;
      rawNormals[vIdx + 6] = nx; rawNormals[vIdx + 7] = ny; rawNormals[vIdx + 8] = nz;

      const fIdx = f * 3;
      faceNormals[fIdx] = nx; faceNormals[fIdx + 1] = ny; faceNormals[fIdx + 2] = nz;
      faceCenters[fIdx] = (p0[0] + p1[0] + p2[0]) / 3.0;
      faceCenters[fIdx + 1] = (p0[1] + p1[1] + p2[1]) / 3.0;
      faceCenters[fIdx + 2] = (p0[2] + p1[2] + p2[2]) / 3.0;
      faceAreas[f] = 0.5 * crossLen;
    }

    return this.buildIndexedMesh(rawVertices, rawNormals, faceNormals, faceCenters, faceAreas, numFaces);
  }

  /**
   * Fast In-Browser Discrete STEP (ISO-10303-21) Entity Parser.
   * Extracts Cartesian points, vertices, and polyloop / planar face facets.
   */
  public static parseSTEP(text: string): ParsedMeshData {
    const cartesianPoints = new Map<number, [number, number, number]>();
    const pointRegex = /#(\d+)\s*=\s*CARTESIAN_POINT\s*\([^,]*,\s*\(\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*\)\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = pointRegex.exec(text)) !== null) {
      const id = parseInt(match[1], 10);
      const x = parseFloat(match[2]);
      const y = parseFloat(match[3]);
      const z = parseFloat(match[4]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        cartesianPoints.set(id, [x, y, z]);
      }
    }

    const vertexPoints = new Map<number, number>();
    const vertexRegex = /#(\d+)\s*=\s*VERTEX_POINT\s*\([^,]*,\s*#(\d+)\s*\)/g;
    while ((match = vertexRegex.exec(text)) !== null) {
      const vId = parseInt(match[1], 10);
      const pId = parseInt(match[2], 10);
      vertexPoints.set(vId, pId);
    }

    const resolvePoint = (id: number): [number, number, number] | null => {
      if (cartesianPoints.has(id)) return cartesianPoints.get(id)!;
      if (vertexPoints.has(id)) {
        const pId = vertexPoints.get(id)!;
        if (cartesianPoints.has(pId)) return cartesianPoints.get(pId)!;
      }
      return null;
    };

    const triangles: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [];
    const polyLoopRegex = /#\d+\s*=\s*POLY_LOOP\s*\([^,]*,\s*\(([^)]+)\)\s*\)/g;
    while ((match = polyLoopRegex.exec(text)) !== null) {
      const refs = match[1].match(/#(\d+)/g);
      if (refs && refs.length >= 3) {
        const loopPts: Array<[number, number, number]> = [];
        for (const ref of refs) {
          const id = parseInt(ref.replace('#', ''), 10);
          const pt = resolvePoint(id);
          if (pt) loopPts.push(pt);
        }
        if (loopPts.length >= 3) {
          const p0 = loopPts[0];
          for (let i = 1; i < loopPts.length - 1; i++) {
            triangles.push([p0, loopPts[i], loopPts[i + 1]]);
          }
        }
      }
    }

    // If no POLY_LOOPs found, parse Advanced B-Rep Topology (ADVANCED_FACE -> FACE_OUTER_BOUND -> EDGE_LOOP -> ORIENTED_EDGE -> EDGE_CURVE)
    if (triangles.length === 0) {
      const edgeCurves = new Map<number, [number, number]>();
      const edgeCurveRegex = /#(\d+)\s*=\s*EDGE_CURVE\s*\([^,]*,\s*#(\d+)\s*,\s*#(\d+)/g;
      while ((match = edgeCurveRegex.exec(text)) !== null) {
        edgeCurves.set(parseInt(match[1], 10), [parseInt(match[2], 10), parseInt(match[3], 10)]);
      }

      const orientedEdges = new Map<number, { cid: number; sense: boolean }>();
      const orientedEdgeRegex = /#(\d+)\s*=\s*ORIENTED_EDGE\s*\([^,]*,[^,]*,[^,]*,\s*#(\d+)\s*,\s*\.([TF])\./g;
      while ((match = orientedEdgeRegex.exec(text)) !== null) {
        orientedEdges.set(parseInt(match[1], 10), {
          cid: parseInt(match[2], 10),
          sense: match[3] === 'T',
        });
      }

      const edgeLoops = new Map<number, number[]>();
      const edgeLoopRegex = /#(\d+)\s*=\s*EDGE_LOOP\s*\([^,]*,\s*\(([^)]+)\)\s*\)/g;
      while ((match = edgeLoopRegex.exec(text)) !== null) {
        const loopId = parseInt(match[1], 10);
        const refs = match[2].match(/#(\d+)/g);
        if (refs) {
          edgeLoops.set(loopId, refs.map(r => parseInt(r.slice(1), 10)));
        }
      }

      const faceBounds = new Map<number, number>();
      const faceBoundRegex = /#(\d+)\s*=\s*(?:FACE_OUTER_BOUND|FACE_BOUND)\s*\([^,]*,\s*#(\d+)/g;
      while ((match = faceBoundRegex.exec(text)) !== null) {
        faceBounds.set(parseInt(match[1], 10), parseInt(match[2], 10));
      }

      const advancedFaceRegex = /#\d+\s*=\s*ADVANCED_FACE\s*\([^,]*,\s*\(([^)]+)\)/g;
      while ((match = advancedFaceRegex.exec(text)) !== null) {
        const boundRefs = match[1].match(/#(\d+)/g);
        if (!boundRefs) continue;
        for (const bRef of boundRefs) {
          const bId = parseInt(bRef.slice(1), 10);
          const loopId = faceBounds.get(bId);
          if (loopId === undefined) continue;
          const oeIds = edgeLoops.get(loopId);
          if (!oeIds) continue;

          const polyPts: Array<[number, number, number]> = [];
          for (const oeId of oeIds) {
            const oe = orientedEdges.get(oeId);
            if (!oe) continue;
            const ec = edgeCurves.get(oe.cid);
            if (!ec) continue;
            const targetV = oe.sense ? ec[1] : ec[0];
            const pt = resolvePoint(targetV);
            if (pt) polyPts.push(pt);
          }

          if (polyPts.length >= 3) {
            const p0 = polyPts[0];
            for (let t = 1; t < polyPts.length - 1; t++) {
              triangles.push([p0, polyPts[t], polyPts[t + 1]]);
            }
          }
        }
      }
    }

    if (triangles.length === 0 && cartesianPoints.size >= 4) {
      const pts = Array.from(cartesianPoints.values());
      for (let i = 0; i < pts.length - 2; i += 3) {
        triangles.push([pts[i], pts[i + 1], pts[i + 2]]);
      }
      if (triangles.length === 0 && pts.length >= 4) {
        triangles.push([pts[0], pts[1], pts[2]]);
        triangles.push([pts[0], pts[2], pts[3]]);
        triangles.push([pts[0], pts[3], pts[1]]);
        triangles.push([pts[1], pts[2], pts[3]]);
      }
    }

    const numFaces = triangles.length;
    const rawVertices = new Float32Array(numFaces * 9);
    const rawNormals = new Float32Array(numFaces * 9);
    const faceNormals = new Float32Array(numFaces * 3);
    const faceCenters = new Float32Array(numFaces * 3);
    const faceAreas = new Float32Array(numFaces);

    for (let f = 0; f < numFaces; f++) {
      const [p0, p1, p2] = triangles[f];
      const vIdx = f * 9;
      rawVertices[vIdx] = p0[0]; rawVertices[vIdx + 1] = p0[1]; rawVertices[vIdx + 2] = p0[2];
      rawVertices[vIdx + 3] = p1[0]; rawVertices[vIdx + 4] = p1[1]; rawVertices[vIdx + 5] = p1[2];
      rawVertices[vIdx + 6] = p2[0]; rawVertices[vIdx + 7] = p2[1]; rawVertices[vIdx + 8] = p2[2];

      const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
      const e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const nx = crossLen > 1e-12 ? cx / crossLen : 0;
      const ny = crossLen > 1e-12 ? cy / crossLen : 0;
      const nz = crossLen > 1e-12 ? cz / crossLen : 1;

      rawNormals[vIdx] = nx; rawNormals[vIdx + 1] = ny; rawNormals[vIdx + 2] = nz;
      rawNormals[vIdx + 3] = nx; rawNormals[vIdx + 4] = ny; rawNormals[vIdx + 5] = nz;
      rawNormals[vIdx + 6] = nx; rawNormals[vIdx + 7] = ny; rawNormals[vIdx + 8] = nz;

      const fIdx = f * 3;
      faceNormals[fIdx] = nx; faceNormals[fIdx + 1] = ny; faceNormals[fIdx + 2] = nz;
      faceCenters[fIdx] = (p0[0] + p1[0] + p2[0]) / 3.0;
      faceCenters[fIdx + 1] = (p0[1] + p1[1] + p2[1]) / 3.0;
      faceCenters[fIdx + 2] = (p0[2] + p1[2] + p2[2]) / 3.0;
      faceAreas[f] = 0.5 * crossLen;
    }

    return this.buildIndexedMesh(rawVertices, rawNormals, faceNormals, faceCenters, faceAreas, numFaces);
  }

  /**
   * Fast In-Browser Discrete IGES Entity Parser.
   * Parses IGES (ASME Y14.26M) copious data, points, and planar facets.
   */
  public static parseIGES(text: string): ParsedMeshData {
    const lines = text.split('\n');
    const points: Array<[number, number, number]> = [];

    for (const line of lines) {
      if (line.length < 73) continue;
      const section = line[72];
      if (section === 'P') {
        const params = line.slice(0, 64).split(/[,;]/).map(s => s.trim()).filter(Boolean);
        for (let i = 0; i < params.length - 2; i += 3) {
          const x = parseFloat(params[i]);
          const y = parseFloat(params[i + 1]);
          const z = parseFloat(params[i + 2]);
          if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            points.push([x, y, z]);
          }
        }
      }
    }

    const triangles: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [];
    for (let i = 0; i < points.length - 2; i += 3) {
      triangles.push([points[i], points[i + 1], points[i + 2]]);
    }

    const numFaces = triangles.length;
    const rawVertices = new Float32Array(numFaces * 9);
    const rawNormals = new Float32Array(numFaces * 9);
    const faceNormals = new Float32Array(numFaces * 3);
    const faceCenters = new Float32Array(numFaces * 3);
    const faceAreas = new Float32Array(numFaces);

    for (let f = 0; f < numFaces; f++) {
      const [p0, p1, p2] = triangles[f];
      const vIdx = f * 9;
      rawVertices[vIdx] = p0[0]; rawVertices[vIdx + 1] = p0[1]; rawVertices[vIdx + 2] = p0[2];
      rawVertices[vIdx + 3] = p1[0]; rawVertices[vIdx + 4] = p1[1]; rawVertices[vIdx + 5] = p1[2];
      rawVertices[vIdx + 6] = p2[0]; rawVertices[vIdx + 7] = p2[1]; rawVertices[vIdx + 8] = p2[2];

      const e1x = p1[0] - p0[0], e1y = p1[1] - p0[1], e1z = p1[2] - p0[2];
      const e2x = p2[0] - p0[0], e2y = p2[1] - p0[1], e2z = p2[2] - p0[2];
      const cx = e1y * e2z - e1z * e2y;
      const cy = e1z * e2x - e1x * e2z;
      const cz = e1x * e2y - e1y * e2x;
      const crossLen = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const nx = crossLen > 1e-12 ? cx / crossLen : 0;
      const ny = crossLen > 1e-12 ? cy / crossLen : 0;
      const nz = crossLen > 1e-12 ? cz / crossLen : 1;

      rawNormals[vIdx] = nx; rawNormals[vIdx + 1] = ny; rawNormals[vIdx + 2] = nz;
      rawNormals[vIdx + 3] = nx; rawNormals[vIdx + 4] = ny; rawNormals[vIdx + 5] = nz;
      rawNormals[vIdx + 6] = nx; rawNormals[vIdx + 7] = ny; rawNormals[vIdx + 8] = nz;

      const fIdx = f * 3;
      faceNormals[fIdx] = nx; faceNormals[fIdx + 1] = ny; faceNormals[fIdx + 2] = nz;
      faceCenters[fIdx] = (p0[0] + p1[0] + p2[0]) / 3.0;
      faceCenters[fIdx + 1] = (p0[1] + p1[1] + p2[1]) / 3.0;
      faceCenters[fIdx + 2] = (p0[2] + p1[2] + p2[2]) / 3.0;
      faceAreas[f] = 0.5 * crossLen;
    }

    return this.buildIndexedMesh(rawVertices, rawNormals, faceNormals, faceCenters, faceAreas, numFaces);
  }

  /**
   * Deduplicates vertices using a precision-grid spatial hash and constructs face adjacency maps.
   */
  public static buildIndexedMesh(
    rawVertices: Float32Array,
    rawNormals: Float32Array,
    faceNormals: Float32Array,
    faceCenters: Float32Array,
    faceAreas: Float32Array,
    numFaces: number
  ): ParsedMeshData {
    const precision = 10000; // 0.1 micron precision grid
    const vertexMap = new Map<string, number>();
    const uniqueVertices: number[] = [];
    const uniqueNormals: number[] = [];
    const indices = new Uint32Array(numFaces * 3);

    const edgeToFaceMap = new Map<string, number[]>();

    for (let i = 0; i < rawVertices.length; i += 3) {
      const vx = rawVertices[i];
      const vy = rawVertices[i + 1];
      const vz = rawVertices[i + 2];
      const key = `${Math.round(vx * precision)},${Math.round(vy * precision)},${Math.round(vz * precision)}`;

      let vIdx = vertexMap.get(key);
      if (vIdx === undefined) {
        vIdx = uniqueVertices.length / 3;
        vertexMap.set(key, vIdx);
        uniqueVertices.push(vx, vy, vz);
        uniqueNormals.push(rawNormals[i], rawNormals[i + 1], rawNormals[i + 2]);
      }
      const triangleIndex = Math.floor(i / 3);
      indices[triangleIndex] = vIdx;
    }

    // Build edge-to-face adjacency
    for (let f = 0; f < numFaces; f++) {
      const i0 = indices[f * 3];
      const i1 = indices[f * 3 + 1];
      const i2 = indices[f * 3 + 2];

      const edges = [
        i0 < i1 ? `${i0}_${i1}` : `${i1}_${i0}`,
        i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`,
        i2 < i0 ? `${i2}_${i0}` : `${i0}_${i2}`,
      ];

      for (const eKey of edges) {
        let fList = edgeToFaceMap.get(eKey);
        if (!fList) {
          fList = [];
          edgeToFaceMap.set(eKey, fList);
        }
        fList.push(f);
      }
    }

    // Identify adjacent face pairs and calculate dihedral angles & concavity
    const faceAdjacency: Array<[number, number]> = [];
    const dihedralList: number[] = [];
    const isConcaveList: number[] = [];

    for (const [_, fList] of edgeToFaceMap) {
      if (fList.length === 2) {
        const fA = fList[0];
        const fB = fList[1];
        faceAdjacency.push([fA, fB]);

        // Normals
        const nAx = faceNormals[fA * 3], nAy = faceNormals[fA * 3 + 1], nAz = faceNormals[fA * 3 + 2];
        const nBx = faceNormals[fB * 3], nBy = faceNormals[fB * 3 + 1], nBz = faceNormals[fB * 3 + 2];

        const dot = Math.max(-1.0, Math.min(1.0, nAx * nBx + nAy * nBy + nAz * nBz));
        const angle = Math.acos(dot);
        dihedralList.push(angle);

        // Concavity test: vector from center A to center B dotted with (nA + nB)
        const dCx = faceCenters[fB * 3] - faceCenters[fA * 3];
        const dCy = faceCenters[fB * 3 + 1] - faceCenters[fA * 3 + 1];
        const dCz = faceCenters[fB * 3 + 2] - faceCenters[fA * 3 + 2];
        const sumNx = nAx + nBx;
        const sumNy = nAy + nBy;
        const sumNz = nAz + nBz;
        const concavityDot = dCx * sumNx + dCy * sumNy + dCz * sumNz;

        // If angle is significant and dot product points inwards, mark concave seam
        const isConcave = angle > 0.35 && concavityDot < -1e-4 ? 1 : 0;
        isConcaveList.push(isConcave);
      }
    }

    return {
      vertices: new Float32Array(uniqueVertices),
      normals: new Float32Array(uniqueNormals),
      indices,
      faceNormals,
      faceCenters,
      faceAreas,
      faceAdjacency,
      dihedralAngles: new Float32Array(dihedralList),
      isConcaveEdge: new Uint8Array(isConcaveList),
    };
  }
}
