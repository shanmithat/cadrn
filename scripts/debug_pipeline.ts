/**
 * Debugging script to verify the entire CAD ingestion, decomposition,
 * metrology, and multi-task AI/ML profiling pipeline end-to-end.
 */

import { DiscreteCADParser } from '../src/core/cadParser';
import { PartDecompositionEngine } from '../src/core/segmentation';
import { AnalyticalMetrology } from '../src/core/metrology';

function generateBoxSTL(x0: number, y0: number, z0: number, dx: number, dy: number, dz: number): string {
  const p = [
    [x0, y0, z0], [x0 + dx, y0, z0], [x0 + dx, y0 + dy, z0], [x0, y0 + dy, z0],
    [x0, y0, z0 + dz], [x0 + dx, y0, z0 + dz], [x0 + dx, y0 + dy, z0 + dz], [x0, y0 + dy, z0 + dz]
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], // bottom
    [4, 5, 6], [4, 6, 7], // top
    [0, 1, 5], [0, 5, 4], // front
    [2, 3, 7], [2, 7, 6], // back
    [0, 4, 7], [0, 7, 3], // left
    [1, 2, 6], [1, 6, 5]  // right
  ];

  let stl = '';
  for (const [i0, i1, i2] of faces) {
    stl += `facet normal 0 0 1\nouter loop\n`;
    stl += `vertex ${p[i0][0]} ${p[i0][1]} ${p[i0][2]}\n`;
    stl += `vertex ${p[i1][0]} ${p[i1][1]} ${p[i1][2]}\n`;
    stl += `vertex ${p[i2][0]} ${p[i2][1]} ${p[i2][2]}\n`;
    stl += `endloop\nendfacet\n`;
  }
  return stl;
}

function generateSyntheticBracketSTL(): string {
  let stl = 'solid merged_bracket\n';
  // Horizontal base plate (60 x 30 x 10)
  stl += generateBoxSTL(0, 0, 0, 60, 30, 10);
  // Vertical upright arm (20 x 30 x 40) joined onto the base plate, forming sharp 90-degree concave seam
  stl += generateBoxSTL(40, 0, 10, 20, 30, 40);
  stl += 'endsolid merged_bracket\n';
  return stl;
}

function generateDisjointAssemblySTL(): string {
  let stl = 'solid disjoint_assembly\n';
  // Body 1: Base flange block (50 x 50 x 10)
  stl += generateBoxSTL(0, 0, 0, 50, 50, 10);
  // Body 2: Separate bolt 1 (at x=100, y=0, z=0)
  stl += generateBoxSTL(100, 0, 0, 10, 10, 30);
  // Body 3: Separate bolt 2 (at x=150, y=0, z=0)
  stl += generateBoxSTL(150, 0, 0, 10, 10, 30);
  stl += 'endsolid disjoint_assembly\n';
  return stl;
}

async function runPipelineDebug() {
  console.log('================================================================');
  console.log('TEST 1: Disjoint Assembly (3 Bodies in single CAD file)');
  console.log('================================================================');
  const disjointSTL = generateDisjointAssemblySTL();
  const buffer1 = Buffer.from(disjointSTL).buffer;
  const meshData1 = DiscreteCADParser.parseSTL(buffer1);
  console.log(`Parsed Disjoint Mesh: ${meshData1.vertices.length / 3} vertices, ${meshData1.indices.length / 3} triangles`);
  
  const parts1 = PartDecompositionEngine.segmentMesh(meshData1, 4);
  console.log(`Decomposition Result: ${parts1.length} individual parts detected!`);
  for (const part of parts1) {
    const profile = await PartDecompositionEngine.profileSegment(part);
    console.log(` -> [${profile.partId}] Class: ${profile.classification} | Process: ${profile.manufacturingProcess} | Vol: ${profile.volumeMm3} mm³ | OEM: ${profile.oemMatch?.partNumber} (${profile.oemMatch?.similarityPercent}%) | Features: ${profile.machiningFeatures.join(', ')}`);
  }

  console.log('\n================================================================');
  console.log('TEST 2: Synthetic Merged Bracket (2 Unioned Sub-Solids)');
  console.log('================================================================');
  const bracketSTL = generateSyntheticBracketSTL();
  const buffer2 = Buffer.from(bracketSTL).buffer;
  const meshData2 = DiscreteCADParser.parseSTL(buffer2);
  console.log(`Parsed Bracket Mesh: ${meshData2.vertices.length / 3} vertices, ${meshData2.indices.length / 3} triangles`);
  console.log(`Face Adjacency pairs: ${meshData2.faceAdjacency.length}, Concave edges: ${Array.from(meshData2.isConcaveEdge).filter(v => v === 1).length}`);

  const parts2 = PartDecompositionEngine.segmentMesh(meshData2, 4);
  console.log(`Decomposition Result: ${parts2.length} individual parts detected!`);
  console.log('\n================================================================');
  console.log('TEST 3: Real CAD Ingestion & Profiling ("GSD model 2.stp")');
  console.log('================================================================');
  const fs = await import('fs');
  const path = await import('path');
  const gsdPath = path.resolve('GSD model 2.stp');
  if (fs.existsSync(gsdPath)) {
    const text = fs.readFileSync(gsdPath, 'utf-8');
    const t0 = performance.now();
    const gsdMesh = DiscreteCADParser.parseSTEP(text);
    const tParse = performance.now() - t0;
    const assemblyProps = AnalyticalMetrology.computeExactMassProperties(gsdMesh.vertices, gsdMesh.indices, 1.15e-6);
    const aabb = AnalyticalMetrology.computeAABB(gsdMesh.vertices);
    const obb = AnalyticalMetrology.computeOrientedBoundingBox(gsdMesh.vertices);
    console.log(`Parsed STEP CAD: ${gsdMesh.vertices.length / 3} vertices, ${gsdMesh.indices.length / 3} triangles in ${tParse.toFixed(2)} ms`);
    console.log(`Assembly Shell Volume: ${assemblyProps.volumeMm3.toFixed(2)} mm³`);
    console.log(`Assembly Surface Area: ${assemblyProps.surfaceAreaMm2.toFixed(2)} mm²`);
    console.log(`Assembly Mass (1.15 g/cm³ eq.): ${(assemblyProps.massKg * 1000).toFixed(2)} g`);
    console.log(`Center of Mass: [${assemblyProps.centroidMm.map(c => c.toFixed(2)).join(', ')}] mm`);
    console.log(`AABB Dimensions: [${aabb.dimensions.map(d => d.toFixed(2)).join(' x ')}] mm`);
    console.log(`OBB Dimensions: [${obb.dimensions.map(d => d.toFixed(2)).join(' x ')}] mm`);

    const gsdParts = PartDecompositionEngine.segmentMesh(gsdMesh, 4);
    console.log(`Decomposition Result: ${gsdParts.length} individual part(s) detected!`);
    for (const part of gsdParts) {
      const profile = await PartDecompositionEngine.profileSegment(part);
      console.log(` -> [${profile.partId}] Class: ${profile.classification} | Process: ${profile.manufacturingProcess} | Vol: ${profile.volumeMm3} mm³ | OEM: ${profile.oemMatch?.partNumber} (${profile.oemMatch?.similarityPercent}%) | Features: ${profile.machiningFeatures.join(', ')}`);
      if (profile.dfmWarnings && profile.dfmWarnings.length > 0) {
        console.log(`    DFM Warnings: ${profile.dfmWarnings.join('; ')}`);
      }
    }
  } else {
    console.warn(`GSD model 2.stp not found at ${gsdPath}`);
  }
}

runPipelineDebug().catch(console.error);
