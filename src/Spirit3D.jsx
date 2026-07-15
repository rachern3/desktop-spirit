import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import modelUrl from "../assets/models/desktop-spirit-animated.glb?url";
import baseColorUrl from "../assets/models/textures/base-color.png?url";
import normalUrl from "../assets/models/textures/normal.png?url";
import metallicRoughnessUrl from "../assets/models/textures/metallic-roughness.png?url";

const ACTION_CLIPS = {
  wave: "wave",
  focus: "focus",
  rest: "stretch",
  charge: "charge",
};

function sampleTrack(track, time) {
  const maxTime = track.times[track.times.length - 1] || 0;
  return Array.from(track.createInterpolant().evaluate(Math.min(time, maxTime)));
}

function createNaturalIdleClip(idleClip, waveClip) {
  if (!idleClip) return null;
  const waveTracks = new Map(waveClip?.tracks.map((track) => [track.name, track]) || []);
  const armPattern = /(?:Arm|ForeArm|Hand|Thumb|Index|Middle|Ring|Pinky)/i;
  const posturePattern = /(?:Hips|Spine|UpLeg|Leg|Foot|ToeBase)\.(?:quaternion)$/i;
  const tracks = idleClip.tracks.map((idleTrack) => {
    const waveTrack = waveTracks.get(idleTrack.name);
    const useWavePosture = waveTrack && posturePattern.test(idleTrack.name) && !armPattern.test(idleTrack.name);
    const sourceTrack = useWavePosture ? waveTrack : idleTrack;
    const sampleTime = useWavePosture ? Math.min(0.22, waveClip.duration * 0.18) : 0;
    const value = sampleTrack(sourceTrack, sampleTime);
    return new sourceTrack.constructor(
      sourceTrack.name,
      [0, 4],
      [...value, ...value],
      sourceTrack.getInterpolation(),
    );
  });
  return new THREE.AnimationClip("idle_natural", 4, tracks);
}

function createPoseTransitionClip(name, idleClip, poseClip, duration = 2.2) {
  if (!idleClip || !poseClip) return null;
  const poseTracks = new Map(poseClip.tracks.map((track) => [track.name, track]));
  const tracks = idleClip.tracks.map((idleTrack) => {
    const baseValue = sampleTrack(idleTrack, 0);
    const poseTrack = poseTracks.get(idleTrack.name);
    const poseValue = poseTrack ? sampleTrack(poseTrack, 0) : baseValue;
    const times = [0, 0.42, duration - 0.46, duration];
    return new idleTrack.constructor(
      idleTrack.name,
      times,
      [...baseValue, ...poseValue, ...poseValue, ...baseValue],
      idleTrack.getInterpolation(),
    );
  });
  return new THREE.AnimationClip(name, duration, tracks);
}

function createStabilizedFocusClip(focusClip, idleClip) {
  if (!focusClip || !idleClip) return focusClip || null;
  const idleTracks = new Map(idleClip.tracks.map((track) => [track.name, track]));
  const headPattern = /(?:Neck|Head)\.quaternion$/i;
  const tracks = focusClip.tracks.map((focusTrack) => {
    const idleTrack = idleTracks.get(focusTrack.name);
    if (!idleTrack || !headPattern.test(focusTrack.name)) return focusTrack.clone();
    const value = sampleTrack(idleTrack, 0);
    return new focusTrack.constructor(
      focusTrack.name,
      [0, focusClip.duration],
      [...value, ...value],
      focusTrack.getInterpolation(),
    );
  });
  return new THREE.AnimationClip("focus", focusClip.duration, tracks);
}

function createCrystalSweep(curve, width, depth, crystalMaterials, veinMaterial, edgeMaterial) {
  const segments = 22;
  const radialSegments = 8;
  const positions = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const widthAxis = new THREE.Vector3();
  const depthAxis = new THREE.Vector3();
  const point = new THREE.Vector3();

  for (let segment = 0; segment <= segments; segment += 1) {
    const t = segment / segments;
    curve.getPoint(t, point);
    curve.getTangent(t, tangent).normalize();
    widthAxis.set(-tangent.y, tangent.x, 0).normalize();
    depthAxis.crossVectors(tangent, widthAxis).normalize();
    const leafProfile = segment === segments
      ? 0.01
      : (0.2 + Math.pow(Math.sin(Math.PI * t), 0.66) * 0.96) * (1 - t * 0.15);
    const depthProfile = segment === segments
      ? 0.02
      : (0.42 + Math.pow(Math.sin(Math.PI * t), 0.72) * 0.58) * (1 - t * 0.1);
    const widthAtT = width * leafProfile;
    const depthAtT = depth * depthProfile;

    for (let radial = 0; radial < radialSegments; radial += 1) {
      const angle = radial / radialSegments * Math.PI * 2;
      const radialWidth = Math.cos(angle) * widthAtT;
      const radialDepth = Math.sin(angle) * depthAtT;
      positions.push(
        point.x + widthAxis.x * radialWidth + depthAxis.x * radialDepth,
        point.y + widthAxis.y * radialWidth + depthAxis.y * radialDepth,
        point.z + widthAxis.z * radialWidth + depthAxis.z * radialDepth,
      );
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const nextRadial = (radial + 1) % radialSegments;
      const a = segment * radialSegments + radial;
      const b = segment * radialSegments + nextRadial;
      const c = (segment + 1) * radialSegments + nextRadial;
      const d = (segment + 1) * radialSegments + radial;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  for (let segment = 0; segment < segments; segment += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const quadIndex = (segment * radialSegments + radial) * 6;
      geometry.addGroup(quadIndex, 6, radial % crystalMaterials.length);
    }
  }

  const group = new THREE.Group();
  const crystal = new THREE.Mesh(geometry, crystalMaterials);
  crystal.renderOrder = 1;
  group.add(crystal);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 18), edgeMaterial);
  edge.renderOrder = 2;
  group.add(edge);

  const veinPoints = [];
  for (let segment = 1; segment < segments; segment += 1) {
    const t = segment / segments;
    const veinPoint = curve.getPoint(t);
    veinPoint.z -= depth * 1.02;
    veinPoints.push(veinPoint);
  }
  const veinCurve = new THREE.CatmullRomCurve3(veinPoints);
  const vein = new THREE.Mesh(new THREE.TubeGeometry(veinCurve, 20, 0.00125, 5, false), veinMaterial);
  vein.renderOrder = 3;
  group.add(vein);
  return group;
}

function createCrystalBlade(reach, rise, width, depth, crystalMaterials, veinMaterial, edgeMaterial, direction = 1) {
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(direction * reach * 0.16, rise * 0.02, -depth * 0.32),
    new THREE.Vector3(direction * reach * 0.56, rise * 0.58, -depth * 0.7),
    new THREE.Vector3(direction * reach, rise, 0),
  );
  return createCrystalSweep(curve, width, depth, crystalMaterials, veinMaterial, edgeMaterial);
}

function createMetalPlate(silverMaterial, goldMaterial, darkMaterial) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.118);
  shape.lineTo(0.054, 0.072);
  shape.lineTo(0.061, -0.018);
  shape.lineTo(0.035, -0.115);
  shape.lineTo(0, -0.166);
  shape.lineTo(-0.035, -0.115);
  shape.lineTo(-0.061, -0.018);
  shape.lineTo(-0.054, 0.072);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.011,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.006,
    bevelThickness: 0.005,
    curveSegments: 18,
  });
  geometry.translate(0, 0, -0.009);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, darkMaterial));
  const silverInset = new THREE.Mesh(geometry.clone(), silverMaterial);
  silverInset.scale.set(0.68, 0.82, 0.72);
  silverInset.position.set(0, -0.006, -0.012);
  group.add(silverInset);

  for (const side of [-1, 1]) {
    const darkRail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.125, 0.007), darkMaterial);
    darkRail.position.set(side * 0.021, -0.064, -0.021);
    darkRail.rotation.z = side * -0.19;
    group.add(darkRail);
  }

  const upperPanelGeometry = new THREE.BoxGeometry(0.026, 0.112, 0.008);
  for (const side of [-1, 1]) {
    const upperPanel = new THREE.Mesh(upperPanelGeometry, silverMaterial);
    upperPanel.position.set(side * 0.034, 0.034, -0.014);
    upperPanel.rotation.z = side * -0.18;
    group.add(upperPanel);

    const lowerPanel = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.09, 0.008), silverMaterial);
    lowerPanel.position.set(side * 0.022, -0.091, -0.014);
    lowerPanel.rotation.z = side * -0.24;
    group.add(lowerPanel);
  }

  const goldSpine = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.007, 0.212, 6), goldMaterial);
  goldSpine.position.set(0, -0.043, -0.026);
  group.add(goldSpine);
  return group;
}

function createHipCrescent(crystalMaterials, veinMaterial, edgeMaterial, direction) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(direction * 0.052, 0.026, -0.004),
    new THREE.Vector3(direction * 0.112, 0.014, -0.009),
    new THREE.Vector3(direction * 0.162, -0.032, -0.008),
    new THREE.Vector3(direction * 0.187, -0.094, -0.004),
    new THREE.Vector3(direction * 0.174, -0.151, -0.002),
    new THREE.Vector3(direction * 0.145, -0.198, 0),
  ]);
  return createCrystalSweep(curve, 0.019, 0.0038, crystalMaterials, veinMaterial, edgeMaterial);
}

function createEnergyAccessories(model) {
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x00755e,
    emissive: 0x003f34,
    emissiveIntensity: 0.22,
    roughness: 0.24,
    metalness: 0.04,
    transmission: 0.04,
    thickness: 0.14,
    ior: 1.46,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.93,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const crystalFacetMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x11a98b,
    emissive: 0x004f42,
    emissiveIntensity: 0.2,
    roughness: 0.17,
    metalness: 0.03,
    transmission: 0.03,
    thickness: 0.11,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const crystalMaterials = [crystalMaterial, crystalFacetMaterial];
  const veinMaterial = new THREE.MeshBasicMaterial({
    color: 0xb6fff0,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x5de6c7,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });
  const silverMaterial = new THREE.MeshStandardMaterial({
    color: 0xc6ccd2,
    metalness: 0.82,
    roughness: 0.2,
  });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xd6ae57,
    metalness: 0.72,
    roughness: 0.22,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x4d585e,
    metalness: 0.72,
    roughness: 0.24,
  });
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0xff9c38,
    emissive: 0xc65108,
    emissiveIntensity: 0.85,
    metalness: 0.2,
    roughness: 0.15,
  });

  const spine = model.getObjectByName("mixamorigSpine2") || model.getObjectByName("mixamorigSpine1");
  const animatedGroups = [];

  if (spine) {
    const backPlate = createMetalPlate(silverMaterial, goldMaterial, darkMaterial);
    backPlate.position.set(0, -0.035, -0.068);
    backPlate.scale.setScalar(0.62);
    spine.add(backPlate);

    const core = new THREE.Group();
    core.position.set(0, 0.035, -0.088);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.011, 12, 40), silverMaterial);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 10, 32), goldMaterial);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.019, 24, 16), coreMaterial);
    gem.scale.z = 0.62;
    core.add(outerRing, innerRing, gem);
    core.scale.setScalar(0.7);
    spine.add(core);

    for (const side of [-1, 1]) {
      const sideGroup = new THREE.Group();
      sideGroup.position.set(side * 0.024, -0.015, -0.078);
      sideGroup.userData.baseY = side * -0.075;
      sideGroup.rotation.y = sideGroup.userData.baseY;

      const bladeSpecs = [
        { reach: 0.182, rise: 0.305, width: 0.024, depth: 0.0038, y: 0.006 },
        { reach: 0.245, rise: 0.235, width: 0.027, depth: 0.0041, y: -0.026 },
        { reach: 0.288, rise: 0.14, width: 0.029, depth: 0.0044, y: -0.064 },
      ];
      for (const [index, spec] of bladeSpecs.entries()) {
        const blade = createCrystalBlade(
          spec.reach,
          spec.rise,
          spec.width,
          spec.depth,
          crystalMaterials,
          veinMaterial,
          edgeMaterial,
          side,
        );
        blade.position.y = spec.y;
        blade.rotation.set(0.012 * index, side * -0.018 * index, -0.018 * index);
        sideGroup.add(blade);

        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.042, 7), silverMaterial);
        collar.position.set(side * 0.018, spec.y, 0.002);
        collar.rotation.z = side * -Math.PI * 0.5;
        sideGroup.add(collar);
      }

      // Keep the lower crescent on the same back rig as the main crystal blades.
      // A shared root rail and overlapping collar make the four silhouettes read
      // as one wing assembly instead of a separate hip ornament.
      const lowerWing = createHipCrescent(crystalMaterials, veinMaterial, edgeMaterial, side);
      lowerWing.position.set(0, -0.061, 0.001);
      lowerWing.rotation.set(0.018, side * -0.016, side * 0.025);
      sideGroup.add(lowerWing);

      const lowerCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.015, 0.05, 7), silverMaterial);
      lowerCollar.position.set(side * 0.018, -0.063, 0.002);
      lowerCollar.rotation.z = side * -Math.PI * 0.5;
      sideGroup.add(lowerCollar);

      const rootRail = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.18, 7), silverMaterial);
      rootRail.position.set(side * 0.011, -0.027, 0.006);
      rootRail.rotation.z = side * -0.045;
      sideGroup.add(rootRail);

      const shoulderBrace = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.014, 0.115, 8), silverMaterial);
      shoulderBrace.position.set(side * 0.047, 0.075, 0.006);
      shoulderBrace.rotation.z = side * -0.58;
      sideGroup.add(shoulderBrace);

      spine.add(sideGroup);
      animatedGroups.push({ group: sideGroup, phase: side > 0 ? 0 : Math.PI });
    }
  }

  return { crystalMaterial, crystalFacetMaterial, veinMaterial, coreMaterial, animatedGroups, boost: 0 };
}

function shortestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export default function Spirit3D({ activeAction, idleMotion, rotationDegrees, energyBurst, lookX = 0, lookY = 0 }) {
  const canvasRef = useRef(null);
  const runtimeRef = useRef(null);
  const targetRotationRef = useRef(THREE.MathUtils.degToRad(rotationDegrees || 0));
  const idleMotionRef = useRef(idleMotion);
  const energyBurstRef = useRef(energyBurst);
  const lookTargetRef = useRef({ x: lookX, y: lookY });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    targetRotationRef.current = THREE.MathUtils.degToRad(rotationDegrees || 0);
  }, [rotationDegrees]);

  useEffect(() => {
    idleMotionRef.current = idleMotion;
  }, [idleMotion]);

  useEffect(() => {
    energyBurstRef.current = energyBurst;
  }, [energyBurst]);

  useEffect(() => {
    lookTargetRef.current = { x: lookX, y: lookY };
  }, [lookX, lookY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.74;

    const scene = new THREE.Scene();
    const roomEnvironment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.035);
    scene.environment = environmentTarget.texture;
    roomEnvironment.dispose();
    const camera = new THREE.PerspectiveCamera(27, 1, 0.01, 20);
    camera.position.set(0, 0.59, 2.82);
    camera.lookAt(0, 0.59, 0);

    scene.add(new THREE.HemisphereLight(0xfff8f2, 0x263e46, 0.52));
    const key = new THREE.DirectionalLight(0xffeadf, 1.15);
    key.position.set(2.8, 4, 4.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xccecff, 0.34);
    fill.position.set(-3, 2.2, 2.4);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x7effd8, 0.52);
    rim.position.set(0, 2.7, -3.2);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);
    const clock = new THREE.Clock();
    let frame = 0;
    let resizeObserver = null;
    let disposed = false;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const width = Math.max(1, parent.clientWidth);
      const height = Math.max(1, parent.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.parentElement || canvas);
    resize();

    const textureLoader = new THREE.TextureLoader();
    const onTextureError = () => {
      if (!disposed) setFailed(true);
    };
    const baseColorMap = textureLoader.load(baseColorUrl, undefined, undefined, onTextureError);
    const normalMap = textureLoader.load(normalUrl, undefined, undefined, onTextureError);
    const metallicRoughnessMap = textureLoader.load(metallicRoughnessUrl, undefined, undefined, onTextureError);
    baseColorMap.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [baseColorMap, normalMap, metallicRoughnessMap]) {
      texture.flipY = false;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }

    const loader = new GLTFLoader();
    loader.load(modelUrl, (gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material) continue;
          material.map = baseColorMap;
          material.normalMap = normalMap;
          material.metalnessMap = metallicRoughnessMap;
          material.roughnessMap = metallicRoughnessMap;
          material.metalness = 1;
          material.roughness = 1;
          material.envMapIntensity = 0.72;
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        }
      });
      pivot.add(model);

      const mixer = new THREE.AnimationMixer(model);
      const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
      const naturalIdleClip = createNaturalIdleClip(clips.get("idle_breathing"), clips.get("wave"));
      if (naturalIdleClip) {
        clips.set(naturalIdleClip.name, naturalIdleClip);
        const focusClip = createStabilizedFocusClip(clips.get("focus"), naturalIdleClip);
        if (focusClip) clips.set("focus", focusClip);
        for (const poseClip of [
          createPoseTransitionClip("stretch", naturalIdleClip, clips.get("stretch_source"), 2.25),
          createPoseTransitionClip("charge", naturalIdleClip, clips.get("charge_source"), 2.45),
        ]) {
          if (poseClip) clips.set(poseClip.name, poseClip);
        }
      }
      const actions = new Map();
      for (const [name, clip] of clips) actions.set(name, mixer.clipAction(clip));
      const idleAction = actions.get("idle_natural") || actions.get("idle_breathing");
      idleAction?.setLoop(THREE.LoopRepeat, Infinity).play();
      const energy = createEnergyAccessories(model);
      const neck = model.getObjectByName("mixamorigNeck");
      const head = model.getObjectByName("mixamorigHead");

      const runtime = {
        renderer,
        scene,
        camera,
        pivot,
        model,
        mixer,
        actions,
        currentAction: idleAction || null,
        idleAction: idleAction || null,
        modelBaseX: model.position.x,
        modelBaseY: model.position.y,
        modelBaseRotationZ: model.rotation.z,
        chargeBlend: 0,
        stretchBlend: 0,
        energy,
        neck,
        head,
        lookX: 0,
        lookY: 0,
        neckOffset: new THREE.Quaternion(),
        headOffset: new THREE.Quaternion(),
        neckInverse: new THREE.Quaternion(),
        headInverse: new THREE.Quaternion(),
        gazeEuler: new THREE.Euler(),
        startedAt: performance.now(),
      };
      runtimeRef.current = runtime;
      canvas.dataset.clips = [...actions.keys()].join(",");
      canvas.dataset.currentClip = idleAction?._clip?.name || "";

      mixer.addEventListener("finished", (event) => {
        if (event.action !== runtime.currentAction || !runtime.idleAction) return;
        event.action.fadeOut(0.24);
        runtime.idleAction.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.28).play();
        runtime.currentAction = runtime.idleAction;
        canvas.dataset.currentClip = runtime.idleAction._clip?.name || "idle";
      });
      setReady(true);
    }, undefined, () => {
      if (!disposed) setFailed(true);
    });

    const animate = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const runtime = runtimeRef.current;
      if (runtime) {
        runtime.pivot.rotation.y += shortestAngle(runtime.pivot.rotation.y, targetRotationRef.current) * Math.min(1, delta * 15);
        const isIdle = runtime.currentAction === runtime.idleAction;
        if (runtime.neck) runtime.neck.quaternion.multiply(runtime.neckInverse.copy(runtime.neckOffset).invert());
        if (runtime.head) runtime.head.quaternion.multiply(runtime.headInverse.copy(runtime.headOffset).invert());
        runtime.mixer.update(isIdle && !idleMotionRef.current ? 0 : delta);

        const time = performance.now() * 0.001;
        const gazeTarget = isIdle ? lookTargetRef.current : { x: 0, y: 0 };
        runtime.lookX += (gazeTarget.x - runtime.lookX) * Math.min(1, delta * 5.8);
        runtime.lookY += (gazeTarget.y - runtime.lookY) * Math.min(1, delta * 5.8);
        const quietGaze = Math.abs(gazeTarget.x) + Math.abs(gazeTarget.y) < 0.025;
        const aliveYaw = quietGaze && idleMotionRef.current ? Math.sin(time * 0.42) * 0.018 : 0;
        const aliveRoll = quietGaze && idleMotionRef.current ? Math.sin(time * 0.31 + 0.7) * 0.008 : 0;
        const yaw = runtime.lookX * 0.13 + aliveYaw;
        const pitch = 0.035 + runtime.lookY * 0.065;
        const roll = runtime.lookX * -0.018 + aliveRoll;
        if (runtime.neck) {
          runtime.neckOffset.setFromEuler(runtime.gazeEuler.set(pitch * 0.34, yaw * 0.34, roll * 0.35));
          runtime.neck.quaternion.multiply(runtime.neckOffset);
        }
        if (runtime.head) {
          runtime.headOffset.setFromEuler(runtime.gazeEuler.set(pitch * 0.66, yaw * 0.66, roll * 0.65));
          runtime.head.quaternion.multiply(runtime.headOffset);
        }

        const boosted = energyBurstRef.current ? 1 : 0;
        runtime.energy.boost += (boosted - runtime.energy.boost) * Math.min(1, delta * 7);
        const shimmer = 0.04 * (0.5 + 0.5 * Math.sin(time * 2.1));
        runtime.energy.crystalMaterial.emissiveIntensity = 0.38 + shimmer + runtime.energy.boost * 0.72;
        runtime.energy.crystalMaterial.opacity = 0.9 + runtime.energy.boost * 0.08;
        runtime.energy.crystalFacetMaterial.emissiveIntensity = 0.24 + shimmer + runtime.energy.boost * 0.62;
        runtime.energy.crystalFacetMaterial.opacity = 0.84 + runtime.energy.boost * 0.14;
        runtime.energy.veinMaterial.opacity = 0.58 + shimmer + runtime.energy.boost * 0.28;
        runtime.energy.coreMaterial.emissiveIntensity = 0.78 + runtime.energy.boost * 1.1;
        for (const item of runtime.energy.animatedGroups) {
          const amount = 0.012;
          item.group.rotation.y = item.group.userData.baseY + Math.sin(time * 1.8 + item.phase) * amount;
        }
        const layoutClip = runtime.currentAction?._clip?.name || "";
        const chargeTarget = layoutClip === "charge" ? 1 : 0;
        const stretchTarget = layoutClip === "stretch" ? 1 : 0;
        runtime.chargeBlend += (chargeTarget - runtime.chargeBlend) * Math.min(1, delta * 5.2);
        runtime.stretchBlend += (stretchTarget - runtime.stretchBlend) * Math.min(1, delta * 6.2);
        const actionScale = 1 - runtime.chargeBlend * 0.28 - runtime.stretchBlend * 0.12;
        runtime.model.scale.setScalar(actionScale);
        runtime.model.rotation.z = runtime.modelBaseRotationZ + runtime.chargeBlend * 0.48;
        runtime.model.position.x = runtime.modelBaseX - runtime.chargeBlend * 0.025;
        const idleFloat = isIdle && idleMotionRef.current ? Math.sin(time * 1.3) * 0.0018 : 0;
        runtime.model.position.y = runtime.modelBaseY + idleFloat + runtime.chargeBlend * 0.23 - runtime.stretchBlend * 0.11;
      }
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      runtimeRef.current?.mixer?.stopAllAction();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
        else object.material?.dispose?.();
      });
      environmentTarget.dispose();
      pmremGenerator.dispose();
      baseColorMap.dispose();
      normalMap.dispose();
      metallicRoughnessMap.dispose();
      renderer.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const clipName = ACTION_CLIPS[activeAction];
    const nextAction = clipName ? runtime.actions.get(clipName) : runtime.idleAction;
    if (!nextAction || nextAction === runtime.currentAction) return;
    const current = runtime.currentAction;
    nextAction.reset();
    if (clipName) {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
      nextAction.setEffectiveTimeScale({ wave: 0.62, focus: 0.78, stretch: 1, charge: 1 }[clipName] || 1);
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.setEffectiveTimeScale(1);
    }
    nextAction.fadeIn(0.28).play();
    current?.fadeOut(0.24);
    runtime.currentAction = nextAction;
    canvasRef.current.dataset.currentClip = nextAction._clip?.name || clipName || "idle";
  }, [activeAction, ready]);

  return (
    <span className={`spirit-3d ${ready ? "is-ready" : ""} ${failed ? "is-failed" : ""}`}>
      <canvas ref={canvasRef} aria-label="可旋转、可执行动作的三维桌面精灵"></canvas>
      {!ready && !failed && <span className="model-loading">正在唤醒精灵…</span>}
      {failed && <span className="model-loading">3D 模型载入失败</span>}
    </span>
  );
}
