/**
 * Interactive 3D Viewport using Three.js.
 * Renders decomposed sub-components with distinct colors, orbit controls,
 * part isolation/highlighting, wireframe toggles, and exploded assembly views.
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box, Eye, Layers, Maximize2, RotateCcw, Sparkles } from 'lucide-react';
import { ComponentProfile } from '../core/types';

interface CADViewerProps {
  components: ComponentProfile[];
  selectedPartId: string | null;
  onSelectPart: (partId: string | null) => void;
}

export const CADViewer: React.FC<CADViewerProps> = ({
  components,
  selectedPartId,
  onSelectPart,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const partMeshesMap = useRef<Map<string, { mesh: THREE.Mesh; origColor: THREE.Color; center: THREE.Vector3 }>>(new Map());

  const [wireframe, setWireframe] = useState<boolean>(false);
  const [explodeFactor, setExplodeFactor] = useState<number>(0);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(100, 100, 150);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controlsRef.current = controls;

    // Lighting (Studio automotive setup)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(150, 200, 150);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6);
    dirLight2.position.set(-150, -100, -150);
    scene.add(dirLight2);

    // Subtle Ground Grid
    const gridHelper = new THREE.GridHelper(300, 30, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -20;
    scene.add(gridHelper);

    // Group for CAD components
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !renderer || !camera) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Geometry Meshes when components change
  useEffect(() => {
    if (!meshGroupRef.current || !cameraRef.current || !controlsRef.current) return;

    const group = meshGroupRef.current;

    // Dispose previous meshes to prevent GPU memory leaks
    while (group.children.length > 0) {
      const obj = group.children[0] as THREE.Mesh;
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
      group.remove(obj);
    }
    partMeshesMap.current.clear();

    if (components.length === 0) return;

    const globalBox = new THREE.Box3();

    components.forEach((comp) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(comp.vertices, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(comp.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(comp.indices, 1));
      geometry.computeVertexNormals();

      const color = new THREE.Color(comp.color);
      const material = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.25,
        roughness: 0.35,
        wireframe,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = comp.partId;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Calculate part center for explode offset
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      if (geometry.boundingBox) {
        geometry.boundingBox.getCenter(center);
        globalBox.union(geometry.boundingBox);
      }

      group.add(mesh);
      partMeshesMap.current.set(comp.partId, { mesh, origColor: color, center });
    });

    // Auto-fit camera to bounding envelope
    const sphere = new THREE.Sphere();
    globalBox.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 10);

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    controls.target.copy(sphere.center);
    camera.position.set(
      sphere.center.x + radius * 1.6,
      sphere.center.y + radius * 1.4,
      sphere.center.z + radius * 1.8
    );
    camera.near = radius * 0.01;
    camera.far = radius * 50;
    camera.updateProjectionMatrix();
    controls.update();
  }, [components]);

  // Update wireframe mode
  useEffect(() => {
    partMeshesMap.current.forEach(({ mesh }) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.wireframe = wireframe;
        mat.needsUpdate = true;
      }
    });
  }, [wireframe]);

  // Update Explode View translation
  useEffect(() => {
    if (components.length <= 1) return;

    // Global centroid of all parts
    const globalCenter = new THREE.Vector3();
    let count = 0;
    partMeshesMap.current.forEach(({ center }) => {
      globalCenter.add(center);
      count++;
    });
    if (count > 0) globalCenter.divideScalar(count);

    partMeshesMap.current.forEach(({ mesh, center }) => {
      const dir = new THREE.Vector3().subVectors(center, globalCenter).normalize();
      const dist = explodeFactor * 40; // Max 40mm explosion displacement
      mesh.position.copy(dir.multiplyScalar(dist));
    });
  }, [explodeFactor, components]);

  // Update Selection & Hover Highlights
  useEffect(() => {
    partMeshesMap.current.forEach(({ mesh, origColor }, partId) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) return;

      const isSelected = selectedPartId === partId;
      const isHovered = hoveredPartId === partId;
      const isAnySelected = selectedPartId !== null;

      if (isSelected) {
        mat.color.set('#f59e0b'); // Amber highlight for selected component
        mat.emissive.set('#78350f');
        mat.opacity = 1.0;
        mat.transparent = false;
      } else if (isHovered) {
        mat.color.copy(origColor).offsetHSL(0, 0, 0.15);
        mat.emissive.set('#1e293b');
        mat.opacity = 1.0;
        mat.transparent = false;
      } else if (isAnySelected) {
        // Dim unselected parts for isolation view
        mat.color.copy(origColor);
        mat.emissive.set('#000000');
        mat.opacity = 0.25;
        mat.transparent = true;
      } else {
        mat.color.copy(origColor);
        mat.emissive.set('#000000');
        mat.opacity = 1.0;
        mat.transparent = false;
      }
      mat.needsUpdate = true;
    });
  }, [selectedPartId, hoveredPartId]);

  // Raycasting for Hover & Click selection
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mountRef.current || !cameraRef.current || !sceneRef.current) return;

    const rect = mountRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    const meshes = Array.from(partMeshesMap.current.values()).map(p => p.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh;
      const hitPartId = hitMesh.name;
      onSelectPart(selectedPartId === hitPartId ? null : hitPartId);
    } else {
      onSelectPart(null);
    }
  };

  const resetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    controlsRef.current.reset();
  };

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col">
      {/* 3D Canvas Mount */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Viewport Floating HUD Controls */}
      <div className="absolute top-4 left-4 flex flex-wrap gap-2 pointer-events-auto">
        <button
          onClick={() => setWireframe(!wireframe)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border backdrop-blur-md transition-all ${
            wireframe
              ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
              : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
          }`}
          title="Toggle Mesh Wireframe"
        >
          <Layers className="w-3.5 h-3.5" />
          Wireframe
        </button>

        <button
          onClick={resetCamera}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-900/80 text-slate-300 backdrop-blur-md hover:bg-slate-800 transition-all"
          title="Reset Camera View"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset View
        </button>

        {selectedPartId && (
          <button
            onClick={() => onSelectPart(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/50 bg-amber-500/20 text-amber-300 backdrop-blur-md hover:bg-amber-500/30 transition-all"
            title="Clear Part Isolation"
          >
            <Eye className="w-3.5 h-3.5" />
            Show All ({components.length})
          </button>
        )}
      </div>

      {/* Exploded View Slider Controls */}
      {components.length > 1 && (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-lg p-3 text-xs flex flex-col gap-2">
          <div className="flex justify-between items-center text-slate-300">
            <span className="font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              Exploded Assembly View
            </span>
            <span className="text-slate-400 font-mono">{(explodeFactor * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={explodeFactor}
            onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
            className="w-full accent-sky-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
          />
        </div>
      )}

      {/* Active Component Pill */}
      {selectedPartId && (
        <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-md border border-amber-500/40 rounded-lg px-3 py-2 text-xs">
          <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Isolated Component</div>
          <div className="font-bold text-slate-100 flex items-center gap-2 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            {selectedPartId}
          </div>
        </div>
      )}
    </div>
  );
};
