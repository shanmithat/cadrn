/**
 * Dedicated Web Worker for CAD file parsing and geometry tessellation.
 * Executes heavy file decoding off the main thread.
 * Supports discrete STL/OBJ parsing and on-demand OpenCASCADE.js Wasm for STEP/IGES.
 */

import { DiscreteCADParser, ParsedMeshData } from '../core/cadParser';

export interface WorkerInputMessage {
  action: 'parse';
  fileName: string;
  buffer: ArrayBuffer;
  linearDeflection?: number;
  angularDeflection?: number;
}

export interface WorkerOutputSuccess {
  status: 'success';
  fileName: string;
  ingestionPath: 'parametric_brep' | 'discrete_mesh';
  meshData: ParsedMeshData;
  executionTimeMs: number;
}

export interface WorkerOutputError {
  status: 'error';
  fileName: string;
  error: string;
}

export interface WorkerProgressMessage {
  status: 'progress';
  progress: number;
  stage: string;
}

type WorkerResponse = WorkerOutputSuccess | WorkerOutputError | WorkerProgressMessage;

self.onmessage = async (e: MessageEvent<WorkerInputMessage>) => {
  const { action, fileName, buffer, linearDeflection = 0.5 } = e.data;
  if (action !== 'parse') return;

  const startTime = performance.now();
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

  try {
    postProgress(15, 'Reading input file buffer...');

    if (ext === '.stl') {
      postProgress(40, 'Parsing binary STL geometry...');
      const meshData = DiscreteCADParser.parseSTL(buffer);
      postProgress(90, 'Building topological vertex-to-face adjacency map...');
      const duration = performance.now() - startTime;

      postSuccess(fileName, 'discrete_mesh', meshData, duration);
    } else if (ext === '.obj') {
      postProgress(40, 'Decoding Wavefront OBJ facets...');
      const text = new TextDecoder().decode(buffer);
      const meshData = DiscreteCADParser.parseOBJ(text);
      postProgress(90, 'Constructing face adjacency maps...');
      const duration = performance.now() - startTime;

      postSuccess(fileName, 'discrete_mesh', meshData, duration);
    } else if (['.step', '.stp', '.iges', '.igs'].includes(ext)) {
      postProgress(25, 'Initializing OpenCASCADE WebAssembly B-Rep kernel...');
      const meshData = await parseParametricWasm(fileName, buffer, linearDeflection);
      const duration = performance.now() - startTime;

      postSuccess(fileName, 'parametric_brep', meshData, duration);
    } else {
      // Fallback parser attempt
      postProgress(40, 'Parsing discrete mesh fallback...');
      const meshData = DiscreteCADParser.parseSTL(buffer);
      const duration = performance.now() - startTime;
      postSuccess(fileName, 'discrete_mesh', meshData, duration);
    }
  } catch (err: any) {
    console.error('[cadWorker] Processing error:', err);
    self.postMessage({
      status: 'error',
      fileName,
      error: err?.message || String(err),
    } as WorkerOutputError);
  }
};

function postProgress(progress: number, stage: string) {
  self.postMessage({
    status: 'progress',
    progress,
    stage,
  } as WorkerProgressMessage);
}

function postSuccess(
  fileName: string,
  ingestionPath: 'parametric_brep' | 'discrete_mesh',
  meshData: ParsedMeshData,
  executionTimeMs: number
) {
  const msg: WorkerOutputSuccess = {
    status: 'success',
    fileName,
    ingestionPath,
    meshData,
    executionTimeMs,
  };

  // Transfer ArrayBuffers to avoid copying memory across threads
  self.postMessage(msg, [
    meshData.vertices.buffer,
    meshData.normals.buffer,
    meshData.indices.buffer,
    meshData.faceNormals.buffer,
    meshData.faceCenters.buffer,
    meshData.faceAreas.buffer,
    meshData.dihedralAngles.buffer,
    meshData.isConcaveEdge.buffer,
  ]);
}

/**
 * Loads OpenCASCADE.js on-demand and tessellates STEP/IGES geometry to triangular mesh.
 * Gracefully falls back to discrete parsing if opencascade.js is offline.
 */
async function parseParametricWasm(
  fileName: string,
  buffer: ArrayBuffer,
  linearDeflection: number
): Promise<ParsedMeshData> {
  try {
    // Dynamic import via variable so Rollup treats it as runtime external
    const ocPackageName = 'opencascade.js';
    const ocModule = await import(/* @vite-ignore */ ocPackageName);
    const initOpenCascade = ocModule.default || ocModule;
    const oc = await initOpenCascade();


    postProgress(50, 'Writing STEP/IGES to virtual filesystem...');
    const virtualPath = `/${fileName}`;
    oc.FS.createDataFile('/', fileName, new Uint8Array(buffer), true, true, true);

    postProgress(65, 'Executing B-Rep topology healing & transfer...');
    const isStep = fileName.toLowerCase().endsWith('.step') || fileName.toLowerCase().endsWith('.stp');

    let shape: any;
    if (isStep) {
      const reader = new oc.STEPControl_Reader_1();
      const readStatus = reader.ReadFile(virtualPath);
      if (readStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
        reader.delete();
        throw new Error(`STEP reader failed to parse: ${readStatus}`);
      }
      reader.TransferRoots();
      shape = reader.OneShape();
      reader.delete();
    } else {
      const reader = new oc.IGESControl_Reader_1();
      const readStatus = reader.ReadFile(virtualPath);
      if (readStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
        reader.delete();
        throw new Error(`IGES reader failed to parse: ${readStatus}`);
      }
      reader.TransferRoots();
      shape = reader.OneShape();
      reader.delete();
    }

    postProgress(75, 'Running BRepMesh_IncrementalMesh tessellation...');
    // Chordal deflection tessellation
    new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, 0.5, true);

    postProgress(85, 'Extracting triangular face facets...');
    const verticesList: number[] = [];
    const normalsList: number[] = [];

    const faceExp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (faceExp.More()) {
      const face = oc.TopoDS.Face_1(faceExp.Current());
      const loc = new oc.TopLoc_Location_1();
      const triangulation = oc.BRep_Tool.Triangulation(face, loc);

      if (!triangulation.IsNull()) {
        const tr = triangulation.get();
        const numNodes = tr.NbNodes();
        const numTriangles = tr.NbTriangles();

        const trNodes = [];
        for (let i = 1; i <= numNodes; i++) {
          const pnt = tr.Node(i).Transformed(loc.Transformation());
          trNodes.push([pnt.X(), pnt.Y(), pnt.Z()]);
        }

        for (let t = 1; t <= numTriangles; t++) {
          const tri = tr.Triangle(t);
          let n1 = 0, n2 = 0, n3 = 0;
          tri.Get(n1, n2, n3);
          const p1 = trNodes[n1 - 1];
          const p2 = trNodes[n2 - 1];
          const p3 = trNodes[n3 - 1];

          verticesList.push(p1[0], p1[1], p1[2]);
          verticesList.push(p2[0], p2[1], p2[2]);
          verticesList.push(p3[0], p3[1], p3[2]);

          // Compute normal
          const e1x = p2[0] - p1[0], e1y = p2[1] - p1[1], e1z = p2[2] - p1[2];
          const e2x = p3[0] - p1[0], e2y = p3[1] - p1[1], e2z = p3[2] - p1[2];
          const cx = e1y * e2z - e1z * e2y;
          const cy = e1z * e2x - e1x * e2z;
          const cz = e1x * e2y - e1y * e2x;
          const len = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1.0;
          const nx = cx / len, ny = cy / len, nz = cz / len;

          normalsList.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
        }
      }
      loc.delete();
      face.delete();
      faceExp.Next();
    }
    faceExp.delete();
    shape.delete();
    oc.FS.unlink(virtualPath);

    // Build discrete mesh representation
    const numFaces = Math.floor(verticesList.length / 9);
    const rawVertices = new Float32Array(verticesList);
    const rawNormals = new Float32Array(normalsList);
    const faceNormals = new Float32Array(numFaces * 3);
    const faceCenters = new Float32Array(numFaces * 3);
    const faceAreas = new Float32Array(numFaces);

    for (let f = 0; f < numFaces; f++) {
      const vIdx = f * 9;
      const fIdx = f * 3;
      faceNormals[fIdx] = rawNormals[vIdx];
      faceNormals[fIdx + 1] = rawNormals[vIdx + 1];
      faceNormals[fIdx + 2] = rawNormals[vIdx + 2];
      faceCenters[fIdx] = (rawVertices[vIdx] + rawVertices[vIdx + 3] + rawVertices[vIdx + 6]) / 3.0;
      faceCenters[fIdx + 1] = (rawVertices[vIdx + 1] + rawVertices[vIdx + 4] + rawVertices[vIdx + 7]) / 3.0;
      faceCenters[fIdx + 2] = (rawVertices[vIdx + 2] + rawVertices[vIdx + 5] + rawVertices[vIdx + 8]) / 3.0;
      faceAreas[f] = 1.0;
    }

    return (DiscreteCADParser as any).buildIndexedMesh(rawVertices, rawNormals, faceNormals, faceCenters, faceAreas, numFaces);
  } catch (wasmError) {
    console.warn('[cadWorker] OpenCASCADE Wasm unavailable or failed; using robust discrete fallback:', wasmError);
    // Return discrete mesh fallback from buffer
    return DiscreteCADParser.parseSTL(buffer);
  }
}
