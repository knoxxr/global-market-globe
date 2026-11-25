"use client";

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import countriesAtlas from "world-atlas/countries-50m.json";
import type {
  AnyMarketAsset,
  AssetCategory,
  CommodityAsset,
  EquityIndexAsset,
  FxPairAsset,
  GeoPoint,
} from "@/lib/market/types";

export interface GlobeFocusTarget {
  lat: number;
  lng: number;
  distance?: number;
  nonce: number;
}

interface GlobeCanvasProps {
  indices: EquityIndexAsset[];
  fx: FxPairAsset[];
  commodities: CommodityAsset[];
  activeFilter: "all" | AssetCategory;
  selectedAssetId: string | null;
  autoRotate: boolean;
  showDayNight: boolean;
  focusTarget: GlobeFocusTarget | null;
  onSelectAsset: (asset: AnyMarketAsset | null) => void;
}

const GLOBE_RADIUS = 1.0;

/**
 * Exact match for Three.js SphereGeometry UV coordinates:
 * u = (lng + 180) / 360 -> phi = u * 2*PI
 * v = (90 - lat) / 180  -> theta = v * PI
 */
function latLngToVector3(lat: number, lng: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const phi = ((lng + 180) * Math.PI) / 180;
  const theta = ((90 - lat) * Math.PI) / 180;
  const sinTheta = Math.sin(theta);
  return new THREE.Vector3(
    -radius * Math.cos(phi) * sinTheta,
    radius * Math.cos(theta),
    radius * Math.sin(phi) * sinTheta
  );
}

/**
 * Computes approximate real-time subsolar unit vector from current UTC clock.
 */
function getSubsolarDirection(date: Date = new Date()): THREE.Vector3 {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - startOfYear) / 86_400_000;
  // Axial tilt declination (-23.44° to +23.44°)
  const declinationDeg = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  // Subsolar longitude: 12:00 UTC is 0°, moving westward at 15°/hr
  const subsolarLng = (12 - utcHours) * 15;
  return latLngToVector3(declinationDeg, subsolarLng, 1).normalize();
}

/**
 * Midpoint on the great-circle path between two coordinates (used to focus FX corridors).
 */
export function getMidpointCoords(a: GeoPoint, b: GeoPoint): GeoPoint {
  const va = latLngToVector3(a.lat, a.lng, 1);
  const vb = latLngToVector3(b.lat, b.lng, 1);
  const mid = va.add(vb).normalize();
  const lat = 90 - (Math.acos(THREE.MathUtils.clamp(mid.y, -1, 1)) * 180) / Math.PI;
  let phi = Math.atan2(mid.z, -mid.x);
  if (phi < 0) phi += Math.PI * 2;
  const lng = (phi * 180) / Math.PI - 180;
  return { lat, lng };
}

/**
 * Builds high-resolution (4096x2048 when supported) anti-aliased day/night Earth textures
 * AND true 3D vector LineSegments for coastlines & country borders from Natural Earth 50m data.
 * Result: buttery-smooth coastlines with zero pixelation even at maximum zoom.
 */
function buildEarthAssets(
  hubs: GeoPoint[],
  maxTextureSize: number,
  maxAnisotropy: number
): {
  dayMap: THREE.CanvasTexture;
  nightMap: THREE.CanvasTexture;
  coastlineGeom: THREE.BufferGeometry;
  borderGeom: THREE.BufferGeometry;
} {
  const width = maxTextureSize >= 4096 ? 4096 : 2048;
  const height = width / 2;
  const scale = width / 2048;

  const dayCanvas = document.createElement("canvas");
  dayCanvas.width = width;
  dayCanvas.height = height;
  const ctx = dayCanvas.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Smooth maritime ocean gradient with subtle bathymetry depth
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, "#102846");
  oceanGrad.addColorStop(0.5, "#0c1f39");
  oceanGrad.addColorStop(1, "#102846");
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Delicate latitude/longitude graticule
  ctx.strokeStyle = "rgba(148, 197, 240, 0.11)";
  ctx.lineWidth = 1.0 * scale;
  for (let lng = -150; lng <= 180; lng += 30) {
    const x = ((lng + 180) / 360) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Equator accent
  ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
  ctx.lineWidth = 1.1 * scale;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  // Extract high-detail 50m GeoJSON features & meshes
  const topology = countriesAtlas as unknown as Topology<{
    countries: GeometryCollection;
  }>;
  const geo = topojson.feature(topology, topology.objects.countries);
  const coastlines = topojson.mesh(
    topology,
    topology.objects.countries,
    (a, b) => a === b
  );
  const interiorBorders = topojson.mesh(
    topology,
    topology.objects.countries,
    (a, b) => a !== b
  );

  const projectX = (lng: number) => ((lng + 180) / 360) * width;
  const projectY = (lat: number) => ((90 - lat) / 180) * height;

  const drawPathOnCtx = (targetCtx: CanvasRenderingContext2D, ring: number[][]) => {
    if (ring.length === 0) return;
    targetCtx.moveTo(projectX(ring[0][0]), projectY(ring[0][1]));
    for (let i = 1; i < ring.length; i++) {
      const prevLng = ring[i - 1][0];
      const currLng = ring[i][0];
      const x = projectX(currLng);
      const y = projectY(ring[i][1]);
      if (Math.abs(currLng - prevLng) > 180) {
        targetCtx.moveTo(x, y);
      } else {
        targetCtx.lineTo(x, y);
      }
    }
  };

  // Fill continents with subtle coastal shelf halo for crisp, anti-aliased separation
  ctx.save();
  ctx.shadowColor = "rgba(56, 189, 248, 0.34)";
  ctx.shadowBlur = 7 * scale;
  ctx.fillStyle = "#294b6e";
  if (geo.type === "FeatureCollection") {
    for (const feature of geo.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      ctx.beginPath();
      if (geom.type === "Polygon") {
        for (const ring of geom.coordinates) drawPathOnCtx(ctx, ring);
      } else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates) {
          for (const ring of poly) drawPathOnCtx(ctx, ring);
        }
      }
      ctx.fill();
    }
  }
  ctx.restore();

  // Readable Night Hemisphere Canvas
  const nightCanvas = document.createElement("canvas");
  nightCanvas.width = width;
  nightCanvas.height = height;
  const nctx = nightCanvas.getContext("2d")!;
  nctx.lineJoin = "round";
  nctx.lineCap = "round";

  const nightOceanGrad = nctx.createLinearGradient(0, 0, 0, height);
  nightOceanGrad.addColorStop(0, "#0b1a2e");
  nightOceanGrad.addColorStop(0.5, "#081426");
  nightOceanGrad.addColorStop(1, "#0b1a2e");
  nctx.fillStyle = nightOceanGrad;
  nctx.fillRect(0, 0, width, height);

  // Subtle night graticule
  nctx.strokeStyle = "rgba(100, 155, 205, 0.07)";
  nctx.lineWidth = 1.0 * scale;
  for (let lng = -150; lng <= 180; lng += 30) {
    const x = ((lng + 180) / 360) * width;
    nctx.beginPath();
    nctx.moveTo(x, 0);
    nctx.lineTo(x, height);
    nctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * height;
    nctx.beginPath();
    nctx.moveTo(0, y);
    nctx.lineTo(width, y);
    nctx.stroke();
  }

  // Night continents with soft coastal glow
  nctx.save();
  nctx.shadowColor = "rgba(56, 189, 248, 0.22)";
  nctx.shadowBlur = 5 * scale;
  nctx.fillStyle = "#1b3452";
  if (geo.type === "FeatureCollection") {
    for (const feature of geo.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      nctx.beginPath();
      if (geom.type === "Polygon") {
        for (const ring of geom.coordinates) drawPathOnCtx(nctx, ring);
      } else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates) {
          for (const ring of poly) drawPathOnCtx(nctx, ring);
        }
      }
      nctx.fill();
    }
  }
  nctx.restore();

  // Warm golden city-light bloom around global financial hubs on night side
  const hubRadius = 30 * scale;
  for (const hub of hubs) {
    const cx = projectX(hub.lng);
    const cy = projectY(hub.lat);
    const grad = nctx.createRadialGradient(cx, cy, 1, cx, cy, hubRadius);
    grad.addColorStop(0, "rgba(251, 191, 36, 0.72)");
    grad.addColorStop(0.35, "rgba(245, 158, 11, 0.28)");
    grad.addColorStop(1, "rgba(245, 158, 11, 0)");
    nctx.fillStyle = grad;
    nctx.beginPath();
    nctx.arc(cx, cy, hubRadius, 0, Math.PI * 2);
    nctx.fill();
  }

  const dayMap = new THREE.CanvasTexture(dayCanvas);
  dayMap.colorSpace = THREE.SRGBColorSpace;
  dayMap.generateMipmaps = true;
  dayMap.minFilter = THREE.LinearMipmapLinearFilter;
  dayMap.magFilter = THREE.LinearFilter;
  dayMap.anisotropy = Math.min(16, maxAnisotropy);

  const nightMap = new THREE.CanvasTexture(nightCanvas);
  nightMap.colorSpace = THREE.SRGBColorSpace;
  nightMap.generateMipmaps = true;
  nightMap.minFilter = THREE.LinearMipmapLinearFilter;
  nightMap.magFilter = THREE.LinearFilter;
  nightMap.anisotropy = Math.min(16, maxAnisotropy);

  // Build infinite-resolution 3D vector LineSegments directly on the sphere
  const buildVectorLineGeometry = (
    mesh: { type: "MultiLineString"; coordinates: number[][][] },
    radius: number
  ): THREE.BufferGeometry => {
    let segCount = 0;
    for (const line of mesh.coordinates) {
      if (line.length > 1) segCount += line.length - 1;
    }
    const positions = new Float32Array(segCount * 2 * 3);
    let offset = 0;

    for (const line of mesh.coordinates) {
      if (line.length < 2) continue;
      let prev = latLngToVector3(line[0][1], line[0][0], radius);
      for (let i = 1; i < line.length; i++) {
        const curr = latLngToVector3(line[i][1], line[i][0], radius);
        positions[offset++] = prev.x;
        positions[offset++] = prev.y;
        positions[offset++] = prev.z;
        positions[offset++] = curr.x;
        positions[offset++] = curr.y;
        positions[offset++] = curr.z;
        prev = curr;
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geom;
  };

  const coastlineGeom = buildVectorLineGeometry(coastlines, GLOBE_RADIUS + 0.0014);
  const borderGeom = buildVectorLineGeometry(interiorBorders, GLOBE_RADIUS + 0.0011);

  return { dayMap, nightMap, coastlineGeom, borderGeom };
}

interface IndexedMarkerObjects {
  id: string;
  asset: AnyMarketAsset;
  anchorPos: THREE.Vector3;
  normal: THREE.Vector3;
  hitMesh?: THREE.Mesh;
  barMesh?: THREE.Mesh;
  ringMesh?: THREE.Mesh;
  diamondMesh?: THREE.Mesh;
  arcLine?: THREE.Line;
  arcCurve?: THREE.QuadraticBezierCurve3;
  flowParticles?: THREE.Mesh[];
  flowDirection?: number;
}

export default function GlobeCanvas({
  indices,
  fx,
  commodities,
  activeFilter,
  selectedAssetId,
  autoRotate,
  showDayNight,
  focusTarget,
  onSelectAsset,
}: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelContainerRef = useRef<HTMLDivElement | null>(null);

  // Refs synced to latest props via useEffect so WebGL loop runs at 60fps without recreating Three.js context
  const propsRef = useRef({
    indices,
    fx,
    commodities,
    activeFilter,
    selectedAssetId,
    autoRotate,
    showDayNight,
    onSelectAsset,
  });

  // Camera spherical state ref
  const cameraStateRef = useRef({
    // Default focus on Asia-Europe corridor (Korea/Europe visible)
    targetLng: 40,
    targetLat: 24,
    targetDistance: 2.85,
    currentLng: 40,
    currentLat: 24,
    currentDistance: 2.85,
    isDragging: false,
    userInteractedAt: 0,
  });

  // Update camera target whenever focusTarget changes
  useEffect(() => {
    if (!focusTarget) return;
    const cam = cameraStateRef.current;
    // Take shortest longitude path
    const deltaLng = ((focusTarget.lng - cam.currentLng + 540) % 360) - 180;
    cam.targetLng = cam.currentLng + deltaLng;
    cam.targetLat = THREE.MathUtils.clamp(focusTarget.lat, -70, 70);
    if (focusTarget.distance) {
      cam.targetDistance = THREE.MathUtils.clamp(focusTarget.distance, 1.68, 4.1);
    }
    cam.userInteractedAt = Date.now();
  }, [focusTarget]);

  const allAssets = useMemo<AnyMarketAsset[]>(() => {
    if (activeFilter === "index") return indices;
    if (activeFilter === "fx") return fx;
    if (activeFilter === "commodity") return commodities;
    return [...indices, ...fx, ...commodities];
  }, [indices, fx, commodities, activeFilter]);

  // Ref for dynamic scene update function exposed by main Three.js effect
  const syncSceneDataRef = useRef<(() => void) | null>(null);
  const labelElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    propsRef.current = {
      indices,
      fx,
      commodities,
      activeFilter,
      selectedAssetId,
      autoRotate,
      showDayNight,
      onSelectAsset,
    };
    syncSceneDataRef.current?.();
  }, [indices, fx, commodities, activeFilter, selectedAssetId, autoRotate, showDayNight, onSelectAsset]);

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();

    const initialW = container.clientWidth || window.innerWidth;
    const initialH = container.clientHeight || window.innerHeight;
    const isSmallScreen = initialW < 768;
    if (isSmallScreen) {
      cameraStateRef.current.targetDistance = 3.25;
      cameraStateRef.current.currentDistance = 3.25;
    }

    const camera = new THREE.PerspectiveCamera(42, initialW / initialH, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initialW, initialH);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // Subtle deep-space starfield (sparse, calm observatory tone)
    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 14 + Math.random() * 24;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.06,
      transparent: true,
      opacity: 0.42,
      sizeAttenuation: true,
    });
    scene.add(new THREE.Points(starGeom, starMat));

    // Earth Textures & Infinite-Resolution 3D Vector Coastlines
    const allHubCoords: GeoPoint[] = [
      ...propsRef.current.indices.map((i) => i.coords),
      ...propsRef.current.commodities.map((c) => c.coords),
    ];
    const { dayMap, nightMap, coastlineGeom, borderGeom } = buildEarthAssets(
      allHubCoords,
      renderer.capabilities.maxTextureSize,
      renderer.capabilities.getMaxAnisotropy()
    );

    const earthUniforms = {
      uDayMap: { value: dayMap },
      uNightMap: { value: nightMap },
      uSunDir: { value: getSubsolarDirection() },
      uShowDayNight: { value: propsRef.current.showDayNight ? 1.0 : 0.0 },
    };

    const earthMat = new THREE.ShaderMaterial({
      uniforms: earthUniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D uDayMap;
        uniform sampler2D uNightMap;
        uniform vec3 uSunDir;
        uniform float uShowDayNight;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;

        void main() {
          vec3 N = normalize(vWorldNormal);
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 dayColor = texture2D(uDayMap, vUv).rgb;
          vec3 nightColor = texture2D(uNightMap, vUv).rgb;

          float sunDot = dot(N, normalize(uSunDir));
          float dayFactor = smoothstep(-0.22, 0.26, sunDot);
          float twilight = exp(-pow(sunDot * 4.6, 2.0)) * 0.14;

          // Balanced daylight boost + ocean specular sheen
          vec3 litDay = dayColor * (1.12 + 0.28 * max(sunDot, 0.0));
          vec3 litNight = nightColor * 1.15;
          vec3 H = normalize(normalize(uSunDir) + V);
          float spec = pow(max(dot(N, H), 0.0), 24.0) * 0.12 * dayFactor;

          vec3 blended = mix(litNight, litDay, dayFactor) + vec3(0.08, 0.22, 0.42) * twilight + vec3(0.35, 0.62, 0.90) * spec;
          vec3 flatMode = dayColor * 1.18;

          vec3 finalColor = mix(flatMode, blended, uShowDayNight);

          // Crisp cyan-blue atmospheric Fresnel limb
          float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          finalColor += vec3(0.12, 0.42, 0.78) * rim * 0.55;

          gl_FragColor = vec4(finalColor, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    const earthGeom = new THREE.SphereGeometry(GLOBE_RADIUS, 128, 96);
    const earthMesh = new THREE.Mesh(earthGeom, earthMat);
    scene.add(earthMesh);

    // True 3D vector coastlines & interior country borders (zero pixelation at any zoom)
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x6ba1cf,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    const borderMesh = new THREE.LineSegments(borderGeom, borderMat);
    scene.add(borderMesh);

    const coastlineMat = new THREE.LineBasicMaterial({
      color: 0x8cd0ff,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    });
    const coastlineMesh = new THREE.LineSegments(coastlineGeom, coastlineMat);
    scene.add(coastlineMesh);

    // Outer atmospheric halo
    const atmoGeom = new THREE.SphereGeometry(GLOBE_RADIUS * 1.068, 96, 64);
    const atmoMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float intensity = pow(0.68 - dot(vNormal, vViewDir), 3.2);
          gl_FragColor = vec4(0.16, 0.62, 0.95, 1.0) * max(intensity, 0.0) * 0.65;
        }
      `,
    });
    const atmoMesh = new THREE.Mesh(atmoGeom, atmoMat);
    scene.add(atmoMesh);

    // Ambient + directional light for 3D metallic markers (commodities / beacons)
    const ambLight = new THREE.AmbientLight(0xdbeafe, 0.95);
    scene.add(ambLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.25);
    dirLight.position.set(4, 3, 4);
    scene.add(dirLight);

    // Dynamic Data Layer Group
    const dataGroup = new THREE.Group();
    scene.add(dataGroup);

    const markerRegistry = new Map<string, IndexedMarkerObjects>();
    let clickableMeshes: THREE.Object3D[] = [];

    // Shared geometries to minimize GPU memory churn
    const barUnitGeom = new THREE.CylinderGeometry(0.0085, 0.011, 1, 10);
    barUnitGeom.translate(0, 0.5, 0);
    const hitSphereGeom = new THREE.SphereGeometry(0.048, 12, 12);
    const ringGeom = new THREE.RingGeometry(0.015, 0.022, 24);
    const diamondGeom = new THREE.OctahedronGeometry(0.024, 0);
    const stemGeom = new THREE.CylinderGeometry(0.003, 0.003, 0.07, 6);
    stemGeom.translate(0, 0.035, 0);
    const flowDotGeom = new THREE.SphereGeometry(0.011, 10, 10);
    const upAxis = new THREE.Vector3(0, 1, 0);

    const rebuildDataLayers = () => {
      // Clear previous meshes
      while (dataGroup.children.length > 0) {
        const child = dataGroup.children[0];
        dataGroup.remove(child);
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          if (
            child.geometry !== barUnitGeom &&
            child.geometry !== hitSphereGeom &&
            child.geometry !== ringGeom &&
            child.geometry !== diamondGeom &&
            child.geometry !== stemGeom &&
            child.geometry !== flowDotGeom
          ) {
            child.geometry.dispose();
          }
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
      markerRegistry.clear();
      clickableMeshes = [];

      const {
        indices: curIndices,
        fx: curFx,
        commodities: curCmds,
        activeFilter: curFilter,
        selectedAssetId: curSelected,
        showDayNight: curDayNight,
      } = propsRef.current;

      earthUniforms.uShowDayNight.value = curDayNight ? 1.0 : 0.0;

      // 1) GLOBAL STOCK INDICES — Glowing vertical column beacons + live pulse rings
      if (curFilter === "all" || curFilter === "index") {
        for (const idx of curIndices) {
          const surfacePos = latLngToVector3(idx.coords.lat, idx.coords.lng, GLOBE_RADIUS + 0.003);
          const normal = surfacePos.clone().normalize();
          const isPositive = idx.changePercent >= 0;
          const isSelected = curSelected === idx.id;

          const colorHex = isPositive ? 0x10b981 : 0xf43f5e;
          const barHeight = THREE.MathUtils.clamp(
            0.045 + Math.abs(idx.changePercent) * 0.055,
            0.045,
            0.22
          );

          const quat = new THREE.Quaternion().setFromUnitVectors(upAxis, normal);

          const barMat = new THREE.MeshBasicMaterial({
            color: isSelected ? 0x38bdf8 : colorHex,
            transparent: true,
            opacity: isSelected ? 1.0 : idx.isOpen ? 0.92 : 0.65,
          });
          const barMesh = new THREE.Mesh(barUnitGeom, barMat);
          barMesh.position.copy(surfacePos);
          barMesh.quaternion.copy(quat);
          barMesh.scale.set(isSelected ? 1.35 : 1, barHeight, isSelected ? 1.35 : 1);
          dataGroup.add(barMesh);

          // Surface pulse ring
          const ringMat = new THREE.MeshBasicMaterial({
            color: isSelected ? 0x38bdf8 : idx.isOpen ? colorHex : 0x64748b,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: isSelected ? 0.95 : idx.isOpen ? 0.8 : 0.35,
          });
          const ringMesh = new THREE.Mesh(ringGeom, ringMat);
          ringMesh.position.copy(
            latLngToVector3(idx.coords.lat, idx.coords.lng, GLOBE_RADIUS + 0.005)
          );
          ringMesh.lookAt(surfacePos.clone().multiplyScalar(2));
          dataGroup.add(ringMesh);

          // Invisible generous hit target for effortless mobile tap
          const hitMat = new THREE.MeshBasicMaterial({ visible: false });
          const hitMesh = new THREE.Mesh(hitSphereGeom, hitMat);
          hitMesh.position.copy(
            surfacePos.clone().add(normal.clone().multiplyScalar(barHeight * 0.6))
          );
          hitMesh.userData = { assetId: idx.id };
          dataGroup.add(hitMesh);
          clickableMeshes.push(hitMesh);

          markerRegistry.set(idx.id, {
            id: idx.id,
            asset: idx,
            anchorPos: surfacePos.clone().add(normal.clone().multiplyScalar(barHeight + 0.03)),
            normal,
            hitMesh,
            barMesh,
            ringMesh,
          });
        }
      }

      // 2) REAL-TIME FX CORRIDORS — Elevated 3D Geodesic Arcs + Animated Flow Packets
      if (curFilter === "all" || curFilter === "fx") {
        for (const pair of curFx) {
          const start = latLngToVector3(pair.fromCoords.lat, pair.fromCoords.lng, GLOBE_RADIUS + 0.006);
          const end = latLngToVector3(pair.toCoords.lat, pair.toCoords.lng, GLOBE_RADIUS + 0.006);
          const chordDist = start.distanceTo(end);
          const altitude = GLOBE_RADIUS + THREE.MathUtils.clamp(chordDist * 0.24, 0.12, 0.44);
          const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(altitude);

          const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
          const points = curve.getPoints(44);
          const arcGeom = new THREE.BufferGeometry().setFromPoints(points);

          const isSelected = curSelected === pair.id;
          const isPositive = pair.changePercent >= 0;
          const arcColor = isSelected ? 0x38bdf8 : isPositive ? 0x34d399 : 0xfb7185;
          const baseOpacity =
            curSelected && !isSelected
              ? 0.2
              : curFilter === "fx"
              ? 0.85
              : 0.52;

          const arcMat = new THREE.LineBasicMaterial({
            color: arcColor,
            transparent: true,
            opacity: isSelected ? 1.0 : baseOpacity,
          });
          const arcLine = new THREE.Line(arcGeom, arcMat);
          dataGroup.add(arcLine);

          // Traveling flow particles along the geodesic arc
          const particleCount = isSelected ? 3 : 2;
          const flowParticles: THREE.Mesh[] = [];
          for (let p = 0; p < particleCount; p++) {
            const dotMat = new THREE.MeshBasicMaterial({
              color: isSelected ? 0x7dd3fc : arcColor,
              transparent: true,
              opacity: isSelected ? 1.0 : curFilter === "fx" ? 0.95 : 0.8,
            });
            const dot = new THREE.Mesh(flowDotGeom, dotMat);
            dot.scale.setScalar(isSelected ? 1.35 : 0.9);
            dataGroup.add(dot);
            flowParticles.push(dot);
          }

          // Hit target at apex of arc
          const apexPos = curve.getPoint(0.5);
          const hitMat = new THREE.MeshBasicMaterial({ visible: false });
          const hitMesh = new THREE.Mesh(hitSphereGeom, hitMat);
          hitMesh.position.copy(apexPos);
          hitMesh.userData = { assetId: pair.id };
          dataGroup.add(hitMesh);
          clickableMeshes.push(hitMesh);

          markerRegistry.set(pair.id, {
            id: pair.id,
            asset: pair,
            anchorPos: apexPos.clone().multiplyScalar(1.03),
            normal: apexPos.clone().normalize(),
            hitMesh,
            arcLine,
            arcCurve: curve,
            flowParticles,
            flowDirection: isPositive ? 1 : -1,
          });
        }
      }

      // 3) COMMODITIES — Rotating metallic diamond beacons at global origin hubs
      if (curFilter === "all" || curFilter === "commodity") {
        for (const cmd of curCmds) {
          const surfacePos = latLngToVector3(cmd.coords.lat, cmd.coords.lng, GLOBE_RADIUS + 0.004);
          const normal = surfacePos.clone().normalize();
          const isSelected = curSelected === cmd.id;
          const quat = new THREE.Quaternion().setFromUnitVectors(upAxis, normal);

          // Delicate anchor stem
          const stemMat = new THREE.MeshBasicMaterial({
            color: isSelected ? 0x38bdf8 : cmd.colorHex,
            transparent: true,
            opacity: 0.72,
          });
          const stemMesh = new THREE.Mesh(stemGeom, stemMat);
          stemMesh.position.copy(surfacePos);
          stemMesh.quaternion.copy(quat);
          dataGroup.add(stemMesh);

          // Metallic octahedral gem
          const gemColor = new THREE.Color(isSelected ? "#38bdf8" : cmd.colorHex);
          const gemMat = new THREE.MeshStandardMaterial({
            color: gemColor,
            emissive: gemColor,
            emissiveIntensity: isSelected ? 0.75 : 0.35,
            roughness: 0.25,
            metalness: 0.75,
          });
          const diamondPos = surfacePos.clone().add(normal.clone().multiplyScalar(0.08));
          const diamondMesh = new THREE.Mesh(diamondGeom, gemMat);
          diamondMesh.position.copy(diamondPos);
          diamondMesh.scale.setScalar(isSelected ? 1.45 : 1.05);
          dataGroup.add(diamondMesh);

          const hitMat = new THREE.MeshBasicMaterial({ visible: false });
          const hitMesh = new THREE.Mesh(hitSphereGeom, hitMat);
          hitMesh.position.copy(diamondPos);
          hitMesh.userData = { assetId: cmd.id };
          dataGroup.add(hitMesh);
          clickableMeshes.push(hitMesh);

          markerRegistry.set(cmd.id, {
            id: cmd.id,
            asset: cmd,
            anchorPos: diamondPos.clone().add(normal.clone().multiplyScalar(0.04)),
            normal,
            hitMesh,
            diamondMesh,
          });
        }
      }
    };

    syncSceneDataRef.current = rebuildDataLayers;
    rebuildDataLayers();

    // Pointer & Multi-Touch Controls (Smooth mobile pinch + drag + raycast tap)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const activePointers = new Map<number, { x: number; y: number }>();
    let dragStart = { x: 0, y: 0 };
    let movedDistance = 0;
    let lastPinchDist = 0;

    const canvasEl = renderer.domElement;

    const handlePointerDown = (e: PointerEvent) => {
      canvasEl.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cameraStateRef.current.userInteractedAt = Date.now();

      if (activePointers.size === 1) {
        cameraStateRef.current.isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        movedDistance = 0;
      } else if (activePointers.size === 2) {
        cameraStateRef.current.isDragging = false;
        const pts = Array.from(activePointers.values());
        lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const prev = activePointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointers.size === 1 && cameraStateRef.current.isDragging) {
        movedDistance += Math.hypot(dx, dy);
        const cam = cameraStateRef.current;
        const sensitivity = 0.22 * (cam.currentDistance / 2.8);
        cam.targetLng -= dx * sensitivity;
        cam.targetLat = THREE.MathUtils.clamp(cam.targetLat + dy * sensitivity, -72, 72);
        cam.userInteractedAt = Date.now();
      } else if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (lastPinchDist > 0) {
          const delta = (lastPinchDist - dist) * 0.008;
          cameraStateRef.current.targetDistance = THREE.MathUtils.clamp(
            cameraStateRef.current.targetDistance + delta,
            1.65,
            4.2
          );
        }
        lastPinchDist = dist;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2) lastPinchDist = 0;
      if (activePointers.size === 0) {
        const wasTap =
          movedDistance < 7 &&
          Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) < 7;
        cameraStateRef.current.isDragging = false;

        if (wasTap) {
          const rect = canvasEl.getBoundingClientRect();
          pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointerNdc, camera);
          const hits = raycaster.intersectObjects(clickableMeshes, false);
          if (hits.length > 0) {
            const hitId = hits[0].object.userData?.assetId as string | undefined;
            if (hitId) {
              const found = markerRegistry.get(hitId);
              if (found) {
                propsRef.current.onSelectAsset(found.asset);
                return;
              }
            }
          }
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraStateRef.current.targetDistance = THREE.MathUtils.clamp(
        cameraStateRef.current.targetDistance + e.deltaY * 0.0014,
        1.65,
        4.2
      );
      cameraStateRef.current.userInteractedAt = Date.now();
    };

    canvasEl.addEventListener("pointerdown", handlePointerDown);
    canvasEl.addEventListener("pointermove", handlePointerMove);
    canvasEl.addEventListener("pointerup", handlePointerUp);
    canvasEl.addEventListener("pointercancel", handlePointerUp);
    canvasEl.addEventListener("wheel", handleWheel, { passive: false });

    // ResizeObserver for crisp layout adaptation across desktop/mobile rotation
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width <= 0 || height <= 0) continue;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    });
    resizeObserver.observe(container);

    // 60FPS Animation Loop
    let rafId = 0;
    const clock = new THREE.Clock();
    const projectedVec = new THREE.Vector3();
    const camDirVec = new THREE.Vector3();
    let sunTimer = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      // Periodically refresh real solar angle every 30s
      sunTimer += dt;
      if (sunTimer > 30) {
        sunTimer = 0;
        earthUniforms.uSunDir.value.copy(getSubsolarDirection());
      }

      const cam = cameraStateRef.current;
      const idleMs = Date.now() - cam.userInteractedAt;

      // Gentle auto-rotation when enabled & user is not actively inspecting an asset
      if (
        propsRef.current.autoRotate &&
        !cam.isDragging &&
        !propsRef.current.selectedAssetId &&
        idleMs > 3500
      ) {
        cam.targetLng += dt * 4.2;
      }

      // Exponentially damped spherical interpolation
      const damping = 1 - Math.exp(-dt * 6.5);
      cam.currentLng += (cam.targetLng - cam.currentLng) * damping;
      cam.currentLat += (cam.targetLat - cam.currentLat) * damping;
      cam.currentDistance += (cam.targetDistance - cam.currentDistance) * damping;

      const camPos = latLngToVector3(cam.currentLat, cam.currentLng, cam.currentDistance);
      camera.position.copy(camPos);
      camera.lookAt(0, 0, 0);
      camDirVec.copy(camera.position).normalize();

      const viewW = container.clientWidth;
      const viewH = container.clientHeight;
      const isCompact = viewW < 640;

      // Animate 3D data markers + project HTML labels directly without React re-renders
      markerRegistry.forEach((item) => {
        // Index live pulse ring
        if (item.ringMesh && item.asset.category === "index") {
          const isOpen = item.asset.isOpen;
          const isSelected = propsRef.current.selectedAssetId === item.id;
          if (isOpen || isSelected) {
            const phase = (elapsed * 0.9 + item.id.charCodeAt(4) * 0.17) % 1;
            const s = 1 + phase * (isSelected ? 2.4 : 1.7);
            item.ringMesh.scale.setScalar(s);
            const mat = item.ringMesh.material as THREE.MeshBasicMaterial;
            mat.opacity = (1 - phase) * (isSelected ? 0.95 : 0.72);
          }
        }

        // Commodity rotating metallic diamonds
        if (item.diamondMesh) {
          item.diamondMesh.rotation.y = elapsed * 1.15;
          item.diamondMesh.rotation.x = Math.sin(elapsed * 0.9) * 0.25;
        }

        // FX flowing packets along geodesic curves
        if (item.arcCurve && item.flowParticles) {
          const speed = propsRef.current.selectedAssetId === item.id ? 0.34 : 0.22;
          const dir = item.flowDirection ?? 1;
          const count = item.flowParticles.length;
          for (let i = 0; i < count; i++) {
            let t = (elapsed * speed + i / count) % 1;
            if (dir < 0) t = 1 - t;
            item.flowParticles[i].position.copy(item.arcCurve.getPoint(t));
          }
        }

        // Update crisp HTML overlay label position
        const el = labelElementsRef.current.get(item.id);
        if (el) {
          const facing = item.normal.dot(camDirVec);
          const isSelected = propsRef.current.selectedAssetId === item.id;
          const curFilter = propsRef.current.activeFilter;

          // Smart decluttering: when showing "all" on compact screens, prioritize key markers or zoomed view
          let shouldShow = facing > 0.18;
          if (
            shouldShow &&
            !isSelected &&
            curFilter === "all" &&
            isCompact &&
            cam.currentDistance > 2.55
          ) {
            // Keep flagship hubs visible on zoomed-out mobile so labels stay readable
            const flagship =
              item.id === "idx-sp500" ||
              item.id === "idx-kospi" ||
              item.id === "idx-nikkei" ||
              item.id === "idx-ftse" ||
              item.id === "idx-dax" ||
              item.id === "fx-usdkrw" ||
              item.id === "fx-eurusd" ||
              item.id === "cmd-gold" ||
              item.id === "cmd-wti";
            shouldShow = flagship;
          }

          if (!shouldShow) {
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
          } else {
            projectedVec.copy(item.anchorPos).project(camera);
            const x = (projectedVec.x * 0.5 + 0.5) * viewW;
            const y = (-projectedVec.y * 0.5 + 0.5) * viewH;

            // Keep inside viewport bounds
            if (x < -40 || x > viewW + 40 || y < -20 || y > viewH + 20) {
              el.style.opacity = "0";
              el.style.pointerEvents = "none";
            } else {
              const edgeFade = THREE.MathUtils.smoothstep(facing, 0.18, 0.42);
              el.style.opacity = String(isSelected ? 1 : edgeFade * 0.94);
              el.style.pointerEvents = "auto";
              el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
              el.style.zIndex = isSelected ? "30" : String(Math.round(facing * 20));
            }
          }
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      canvasEl.removeEventListener("pointerdown", handlePointerDown);
      canvasEl.removeEventListener("pointermove", handlePointerMove);
      canvasEl.removeEventListener("pointerup", handlePointerUp);
      canvasEl.removeEventListener("pointercancel", handlePointerUp);
      canvasEl.removeEventListener("wheel", handleWheel);

      dayMap.dispose();
      nightMap.dispose();
      coastlineGeom.dispose();
      coastlineMat.dispose();
      borderGeom.dispose();
      borderMat.dispose();
      earthGeom.dispose();
      earthMat.dispose();
      atmoGeom.dispose();
      atmoMat.dispose();
      starGeom.dispose();
      starMat.dispose();
      barUnitGeom.dispose();
      hitSphereGeom.dispose();
      ringGeom.dispose();
      diamondGeom.dispose();
      stemGeom.dispose();
      flowDotGeom.dispose();
      renderer.dispose();
      if (canvasEl.parentNode === container) {
        container.removeChild(canvasEl);
      }
    };
  }, []);

  return (
    <div className="globe-stage">
      <div
        ref={containerRef}
        className="globe-webgl-host"
        aria-label="실시간 글로벌 금융 3D 지구본"
      />
      <div ref={labelContainerRef} className="globe-labels-layer" aria-hidden="false">
        {allAssets.map((asset) => {
          const isPositive = asset.changePercent >= 0;
          const isSelected = selectedAssetId === asset.id;
          return (
            <button
              key={asset.id}
              type="button"
              ref={(el) => {
                if (el) {
                  labelElementsRef.current.set(asset.id, el);
                } else {
                  labelElementsRef.current.delete(asset.id);
                }
              }}
              className={`globe-pin-label globe-pin-${asset.category} ${
                isSelected ? "is-selected" : ""
              }`}
              onClick={() => onSelectAsset(asset)}
            >
              <span
                className={`pin-dot ${
                  asset.category === "commodity"
                    ? "dot-commodity"
                    : isPositive
                    ? "dot-up"
                    : "dot-down"
                }`}
              />
              <span className="pin-symbol">{asset.symbol}</span>
              <span className={`pin-pct ${isPositive ? "text-up" : "text-down"}`}>
                {isPositive ? "+" : ""}
                {asset.changePercent.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
