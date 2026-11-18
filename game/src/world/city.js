// Builds Solmar City from a seed: streets, sidewalks, buildings, trees, lamps,
// props, beach and harbour, all as InstancedMesh batches so the whole city costs
// well under 100 draw calls. Layout data comes from data/city.js; this file only
// turns that data into geometry. Everything is deterministic: the same seed builds
// the same city, byte for byte.
//
// buildCity(seed) returns { graph, buildings, districts, landmarks } plus the
// render group, parked-car spots and helpers the other systems need.

import * as THREE from 'three';
import { CITY, PALETTE } from '../config.js';
import { createRandom, hashSeed, randRange, randInt, randPick, randChance } from '../random.js';
import {
  DISTRICTS,
  LANDMARKS,
  STREET_COORDS,
  blockX,
  blockZ,
  districtAt,
  landmarkAt,
  landmarkPos,
  districtBounds,
} from '../data/city.js';
import { RoadGraph } from './roadgraph.js';
import {
  makeFacadeTexture,
  makeLowFacadeTexture,
  makeAsphaltTexture,
  makeAsphaltPlainTexture,
  makeZebraTexture,
  makeSidewalkTexture,
  makeGrassTexture,
  makeSandTexture,
  makeSignTexture,
  makeBlobShadowTexture,
} from './textures.js';

export function buildCity(seed = 1) {
  const rng = createRandom(seed);
  const graph = new RoadGraph();
  const group = new THREE.Group();
  group.name = 'SolmarCity';

  // ---- Layout: buildings, trees, lamps, props (data first, meshes after) ----
  const buildings = [];
  const trees = []; // { x, z, palm, scale }
  const lamps = []; // { x, z }
  const hydrants = [];
  const containers = []; // { x, z, rotY, color, stack }
  const awnings = []; // { x, y, z, w, rotY, color }
  const roofs = []; // pitched roofs { x, y, z, w, d, h, rotY, color }
  const roofCaps = []; // flat roof caps { x, y, z, w, d, color }
  const signs = []; // { text, sub, bg, fg, x, y, z, w, h, rotY }
  const lawns = []; // grass patches { x, z, size }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const landmark = landmarkAt(col, row);
      const districtId = districtAt(col, row);
      const cx = blockX(col);
      const cz = blockZ(row);
      const blockRng = createRandom(hashSeed(`props:${col},${row}`));
      if (landmark) {
        buildings.push(...generateLandmarkBuildings(landmark));
      } else {
        buildings.push(...generateBlockBuildings(col, row, districtId));
      }
      // Street trees at the block corners.
      const treeCount = districtId === 'palmbeach' ? 3 : randInt(blockRng, 1, 3);
      for (let i = 0; i < treeCount; i++) {
        const corner = randInt(blockRng, 0, 3);
        const sx = corner % 2 === 0 ? -1 : 1;
        const sz = corner < 2 ? -1 : 1;
        trees.push({
          x: cx + sx * 26 + randRange(blockRng, -2, 2),
          z: cz + sz * 26 + randRange(blockRng, -2, 2),
          palm: districtId === 'palmbeach' || randChance(blockRng, 0.25),
          scale: randRange(blockRng, 0.85, 1.25),
        });
      }
      // Lawns for Vista Hills houses.
      if (districtId === 'vistahills' && !landmark) lawns.push({ x: cx, z: cz, size: 56 });
      // Containers in harbour blocks.
      if (districtId === 'harbor' && !landmark) {
        const count = randInt(blockRng, 3, 7);
        for (let i = 0; i < count; i++) {
          containers.push({
            x: cx + randRange(blockRng, -24, 24),
            z: cz + randRange(blockRng, -24, 24),
            rotY: randChance(blockRng, 0.5) ? 0 : Math.PI / 2,
            color: randPick(blockRng, [0xb03a2e, 0x2e6da4, 0x3a7d44, 0xc47f17, 0x7d3c98, 0x8a8d91]),
            stack: randChance(blockRng, 0.3) ? 2 : 1,
          });
        }
      }
    }
  }

  // Roofs, caps and awnings derived from the building list.
  for (const b of buildings) {
    const roofColor = PALETTE.districts[b.district].roof;
    if (b.type === 'house') {
      roofs.push({
        x: b.x, y: CITY.sidewalkHeight + b.h, z: b.z,
        w: b.w + 1.4, d: b.d + 1.4, h: randRange(createRandom(hashSeed(`roof:${b.x},${b.z}`)), 2.2, 3.2),
        rotY: b.rotY, color: roofColor,
      });
    } else {
      roofCaps.push({
        x: b.x, y: CITY.sidewalkHeight + b.h + 0.25, z: b.z,
        w: b.w * 0.92, d: b.d * 0.92, color: roofColor,
      });
    }
    if (b.type === 'shophouse' && b.facing !== undefined) {
      const dir = [[0, 1], [1, 0], [0, -1], [-1, 0]][b.facing];
      const awnColor = randPick(createRandom(hashSeed(`awn:${b.x},${b.z}`)), [0xd94f3d, 0x2e86ab, 0xe8a33d, 0x4fae8f, 0xc95f7e]);
      awnings.push({
        x: b.x + dir[0] * (b.d / 2 + 0.8) * (b.facing % 2 === 0 ? 1 : 0) + dir[0] * (b.w / 2 + 0.8) * (b.facing % 2 === 1 ? 1 : 0),
        y: CITY.sidewalkHeight + 3.4,
        z: b.z + dir[1] * (b.d / 2 + 0.8) * (b.facing % 2 === 0 ? 1 : 0) + dir[1] * (b.w / 2 + 0.8) * (b.facing % 2 === 1 ? 1 : 0),
        w: b.facing % 2 === 0 ? b.w * 0.85 : b.d * 0.85,
        rotY: b.facing * Math.PI / 2,
        color: awnColor,
      });
    }
  }

  // Landmark signs and extras.
  for (const landmark of LANDMARKS) {
    const { x, z } = landmarkPos(landmark);
    if (landmark.type === 'hospital') {
      signs.push({ text: 'St. Marina General', sub: 'Hospital', bg: '#f5f5f5', fg: '#c0392b', x, y: 26, z: z - 13.2, w: 22, h: 5, rotY: Math.PI });
    } else if (landmark.type === 'police') {
      signs.push({ text: 'Solmar PD', sub: 'Headquarters', bg: '#1e3a5f', fg: '#ffffff', x, y: 13, z: z + 11.2, w: 18, h: 4, rotY: 0 });
    } else if (landmark.type === 'respray') {
      signs.push({ text: 'Chroma Auto', sub: 'Respray & Repair', bg: '#e8590c', fg: '#ffffff', x, y: 6, z: z + 8.2, w: 16, h: 3.4, rotY: 0 });
    } else if (landmark.type === 'gas') {
      signs.push({ text: 'SolFuel', sub: '', bg: '#15803d', fg: '#ffffff', x: x - 12, y: 7.5, z: z - 10, w: 8, h: 2.4, rotY: Math.PI / 4 });
    }
  }

  // Park: extra trees, benches and a fountain.
  const park = LANDMARKS.find((l) => l.type === 'park');
  const parkPos = landmarkPos(park);
  const parkRng = createRandom(hashSeed('park'));
  for (let i = 0; i < 14; i++) {
    trees.push({
      x: parkPos.x + randRange(parkRng, -26, 26),
      z: parkPos.z + randRange(parkRng, -26, 26),
      palm: randChance(parkRng, 0.5),
      scale: randRange(parkRng, 0.9, 1.3),
    });
  }
  lawns.push({ x: parkPos.x, z: parkPos.z, size: 56 });

  // Palms along the beach boardwalk (east edge).
  for (let z = -270; z <= 270; z += 14) {
    trees.push({ x: 296 + randRange(rng, -2, 2), z: z + randRange(rng, -3, 3), palm: true, scale: randRange(rng, 1, 1.35) });
  }

  // Street lamps at every intersection (two diagonal corners).
  for (const node of graph.nodes) {
    lamps.push({ x: node.x + 8.5, z: node.z + 8.5 });
    lamps.push({ x: node.x - 8.5, z: node.z - 8.5 });
  }

  // Hydrants: sparse, near random intersections.
  for (let i = 0; i < 24; i++) {
    const node = graph.nodes[randInt(rng, 0, graph.nodes.length - 1)];
    hydrants.push({ x: node.x + randRange(rng, -9, 9), z: node.z + randRange(rng, -9, 9) });
  }

  // ---- Textures ----
  const facade = makeFacadeTexture(createRandom(hashSeed('facade-tower')));
  const lowFacade = makeLowFacadeTexture(createRandom(hashSeed('facade-low')));
  const asphalt = makeAsphaltTexture(createRandom(hashSeed('asphalt')));
  const asphaltPlain = makeAsphaltPlainTexture(createRandom(hashSeed('asphalt-plain')));
  const zebra = makeZebraTexture();
  const sidewalkTex = makeSidewalkTexture(createRandom(hashSeed('sidewalk')));
  const grassTex = makeGrassTexture(createRandom(hashSeed('grass')));
  const sandTex = makeSandTexture(createRandom(hashSeed('sand')));

  // ---- Ground, sea, beach ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: 0x9d968a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(500, -0.6, 500);
  group.add(sea);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 640),
    new THREE.MeshLambertMaterial({ map: sandTex }),
  );
  sandTex.repeat.set(3, 40);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(309, 0.02, 0);
  group.add(sand);

  // Harbour quay + pier (south edge).
  const quay = new THREE.Mesh(
    new THREE.BoxGeometry(620, 0.6, 26),
    new THREE.MeshLambertMaterial({ color: 0x8d8880 }),
  );
  quay.position.set(0, 0.25, 299);
  group.add(quay);
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.8, 130),
    new THREE.MeshLambertMaterial({ color: 0x7a6a52 }),
  );
  pier.position.set(140, 0.4, 375);
  group.add(pier);

  // ---- Roads ----
  const streetLength = 584;
  asphalt.repeat.set(1, streetLength / 24);
  const roadMat = new THREE.MeshLambertMaterial({ map: asphalt });
  const roadGeo = new THREE.PlaneGeometry(CITY.roadWidth, streetLength);
  for (const c of STREET_COORDS) {
    const v = new THREE.Mesh(roadGeo, roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0.02, 0);
    group.add(v);
    const h = new THREE.Mesh(roadGeo, roadMat);
    h.rotation.x = -Math.PI / 2;
    h.rotation.z = Math.PI / 2;
    h.position.set(0, 0.02, c);
    group.add(h);
  }
  // Intersection patches (plain asphalt, slightly above the strips).
  const patchMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(CITY.roadWidth, CITY.roadWidth),
    new THREE.MeshLambertMaterial({ map: asphaltPlain }),
    graph.nodes.length,
  );
  graph.nodes.forEach((node, i) => {
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.position.set(node.x, 0.04, node.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    patchMesh.setMatrixAt(i, dummy.matrix);
  });
  group.add(patchMesh);

  // Zebra crossings: one per approach, instanced.
  const zebraCount = graph.nodes.length * 4;
  const zebraMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(CITY.roadWidth, 3),
    new THREE.MeshLambertMaterial({ map: zebra }),
    zebraCount,
  );
  {
    let zi = 0;
    const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (const node of graph.nodes) {
      for (let d = 0; d < 4; d++) {
        dummy.position.set(node.x + dirs[d][0] * 8, 0.05, node.z + dirs[d][1] * 8);
        dummy.rotation.set(-Math.PI / 2, 0, d % 2 === 0 ? 0 : Math.PI / 2);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        zebraMesh.setMatrixAt(zi++, dummy.matrix);
      }
    }
  }
  group.add(zebraMesh);

  // ---- Sidewalks (one raised box per block) ----
  const blockSize = CITY.pitch - CITY.roadWidth;
  sidewalkTex.repeat.set(blockSize / 8, blockSize / 8);
  const sidewalkMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(blockSize, CITY.sidewalkHeight, blockSize),
    new THREE.MeshLambertMaterial({ map: sidewalkTex }),
    64,
  );
  {
    let si = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        setInstance(sidewalkMesh, si++, blockX(col), CITY.sidewalkHeight / 2, blockZ(row), 1, 1, 1);
      }
    }
  }
  group.add(sidewalkMesh);

  // Lawns (grass planes on top of the sidewalk boxes).
  grassTex.repeat.set(7, 7);
  const lawnMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshLambertMaterial({ map: grassTex }),
    Math.max(lawns.length, 1),
  );
  lawns.forEach((lawn, i) => {
    dummy.position.set(lawn.x, CITY.sidewalkHeight + 0.02, lawn.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.scale.set(lawn.size, lawn.size, 1);
    dummy.updateMatrix();
    lawnMesh.setMatrixAt(i, dummy.matrix);
  });
  lawnMesh.count = lawns.length;
  group.add(lawnMesh);

  // ---- Buildings ----
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0); // origin at the base, so scale.y = height
  const towerMat = new THREE.MeshLambertMaterial({
    map: facade.map, emissiveMap: facade.emissiveMap,
    emissive: 0xffbe55, emissiveIntensity: 0,
  });
  patchFacadeUV(towerMat);
  const lowMat = new THREE.MeshLambertMaterial({
    map: lowFacade.map, emissiveMap: lowFacade.emissiveMap,
    emissive: 0xffbe55, emissiveIntensity: 0,
  });
  patchFacadeUV(lowMat);

  const towers = buildings.filter((b) => b.type === 'tower');
  const lows = buildings.filter((b) => b.type !== 'tower');
  const towerMesh = new THREE.InstancedMesh(boxGeo, towerMat, Math.max(towers.length, 1));
  towers.forEach((b, i) => {
    setInstance(towerMesh, i, b.x, CITY.sidewalkHeight, b.z, b.w, b.h, b.d, b.rotY);
    towerMesh.setColorAt(i, tmpColor.setHex(b.tint));
  });
  towerMesh.count = towers.length;
  group.add(towerMesh);
  const lowMesh = new THREE.InstancedMesh(boxGeo, lowMat, Math.max(lows.length, 1));
  lows.forEach((b, i) => {
    setInstance(lowMesh, i, b.x, CITY.sidewalkHeight, b.z, b.w, b.h, b.d, b.rotY);
    lowMesh.setColorAt(i, tmpColor.setHex(b.tint));
  });
  lowMesh.count = lows.length;
  group.add(lowMesh);

  // Pitched roofs (Vista Hills houses).
  const roofMesh = new THREE.InstancedMesh(
    prismGeometry(),
    new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
    Math.max(roofs.length, 1),
  );
  roofs.forEach((r, i) => {
    setInstance(roofMesh, i, r.x, r.y, r.z, r.w, r.h * 2, r.d, r.rotY);
    roofMesh.setColorAt(i, tmpColor.setHex(r.color));
  });
  roofMesh.count = roofs.length;
  group.add(roofMesh);

  // Flat roof caps.
  const capMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.5, 1),
    new THREE.MeshLambertMaterial(),
    Math.max(roofCaps.length, 1),
  );
  roofCaps.forEach((c, i) => {
    setInstance(capMesh, i, c.x, c.y, c.z, c.w, 1, c.d);
    capMesh.setColorAt(i, tmpColor.setHex(c.color));
  });
  capMesh.count = roofCaps.length;
  group.add(capMesh);

  // Mercado awnings.
  const awningMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.08, 1.6),
    new THREE.MeshLambertMaterial(),
    Math.max(awnings.length, 1),
  );
  awnings.forEach((a, i) => {
    dummy.position.set(a.x, a.y, a.z);
    dummy.rotation.set(0, a.rotY, 0);
    dummy.rotateX(0.35); // outer edge slopes down, away from the shopfront
    dummy.scale.set(a.w, 1, 1);
    dummy.updateMatrix();
    awningMesh.setMatrixAt(i, dummy.matrix);
    awningMesh.setColorAt(i, tmpColor.setHex(a.color));
  });
  awningMesh.count = awnings.length;
  group.add(awningMesh);

  // ---- Trees & palms ----
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(1.7, 0);
  canopyGeo.scale(1, 0.85, 1);
  const palmTrunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 5.2, 6);
  palmTrunkGeo.translate(0, 2.6, 0);
  const palmTopGeo = new THREE.ConeGeometry(2.9, 1.1, 7);
  palmTopGeo.rotateX(Math.PI); // apex down: frond silhouette
  palmTopGeo.translate(0, -0.3, 0);

  const leafTrees = trees.filter((t) => !t.palm);
  const palmTrees = trees.filter((t) => t.palm);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), Math.max(leafTrees.length, 1));
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, new THREE.MeshLambertMaterial({ color: 0x4a7d3a }), Math.max(leafTrees.length, 1));
  leafTrees.forEach((t, i) => {
    setInstance(trunkMesh, i, t.x, CITY.sidewalkHeight, t.z, t.scale, t.scale, t.scale);
    trunkMesh.setColorAt(i, tmpColor.setHex(0x6b4a2f));
    setInstance(canopyMesh, i, t.x, CITY.sidewalkHeight + 2.4 * t.scale, t.z, t.scale, t.scale, t.scale);
    canopyMesh.setColorAt(i, tmpColor.setHex(randPick(createRandom(hashSeed(`leaf:${t.x},${t.z}`)), [0x4a7d3a, 0x5d9148, 0x3f7034, 0x6b9a4e])));
  });
  trunkMesh.count = leafTrees.length;
  canopyMesh.count = leafTrees.length;
  group.add(trunkMesh, canopyMesh);

  const palmTrunkMesh = new THREE.InstancedMesh(palmTrunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5c3e }), Math.max(palmTrees.length, 1));
  const palmTopMesh = new THREE.InstancedMesh(palmTopGeo, new THREE.MeshLambertMaterial({ color: 0x35924a }), Math.max(palmTrees.length, 1));
  palmTrees.forEach((t, i) => {
    const lean = randRange(createRandom(hashSeed(`palm:${t.x},${t.z}`)), -0.08, 0.08);
    dummy.position.set(t.x, CITY.sidewalkHeight, t.z);
    dummy.rotation.set(lean, 0, lean * 0.6);
    dummy.scale.set(t.scale, t.scale, t.scale);
    dummy.updateMatrix();
    palmTrunkMesh.setMatrixAt(i, dummy.matrix);
    dummy.position.set(t.x, CITY.sidewalkHeight + 5.2 * t.scale, t.z);
    dummy.updateMatrix();
    palmTopMesh.setMatrixAt(i, dummy.matrix);
    palmTopMesh.setColorAt(i, tmpColor.setHex(randPick(createRandom(hashSeed(`frond:${t.x},${t.z}`)), [0x35924a, 0x42a355, 0x2f8040])));
  });
  palmTrunkMesh.count = palmTrees.length;
  palmTopMesh.count = palmTrees.length;
  group.add(palmTrunkMesh, palmTopMesh);

  // ---- Street lamps ----
  const lampPoleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.6, 6);
  lampPoleGeo.translate(0, 2.8, 0);
  const poleMesh = new THREE.InstancedMesh(lampPoleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3f45 }), lamps.length);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x8a8f96 });
  const bulbMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    bulbMat,
    lamps.length,
  );
  lamps.forEach((lamp, i) => {
    setInstance(poleMesh, i, lamp.x, 0, lamp.z, 1, 1, 1);
    setInstance(bulbMesh, i, lamp.x, 5.7, lamp.z, 1, 1, 1);
  });
  group.add(poleMesh, bulbMesh);

  // ---- Hydrants ----
  const hydrantGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.7, 8);
  hydrantGeo.translate(0, 0.35, 0);
  const hydrantMesh = new THREE.InstancedMesh(hydrantGeo, new THREE.MeshLambertMaterial({ color: 0xc0392b }), Math.max(hydrants.length, 1));
  hydrants.forEach((h, i) => setInstance(hydrantMesh, i, h.x, CITY.sidewalkHeight, h.z, 1, 1, 1));
  hydrantMesh.count = hydrants.length;
  group.add(hydrantMesh);

  // ---- Harbour containers ----
  const containerGeo = new THREE.BoxGeometry(6.1, 2.6, 2.5);
  containerGeo.translate(0, 1.3, 0);
  const containerMesh = new THREE.InstancedMesh(
    containerGeo,
    new THREE.MeshLambertMaterial(),
    Math.max(containers.reduce((n, c) => n + c.stack, 0), 1),
  );
  {
    let ci = 0;
    for (const c of containers) {
      for (let s = 0; s < c.stack; s++) {
        setInstance(containerMesh, ci, c.x, CITY.sidewalkHeight + s * 2.6, c.z, 1, 1, 1, c.rotY);
        containerMesh.setColorAt(ci, tmpColor.setHex(c.color));
        ci++;
      }
    }
    containerMesh.count = ci;
  }
  group.add(containerMesh);

  // ---- Landmark extras: signs, fountain, gas canopy ----
  const signMeshes = [];
  for (const s of signs) {
    const tex = makeSignTexture(s.text, { bg: s.bg, fg: s.fg, sub: s.sub });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(s.w, s.h),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    mesh.position.set(s.x, s.y, s.z);
    mesh.rotation.y = s.rotY;
    group.add(mesh);
    signMeshes.push(mesh);
  }
  // Hospital red cross on the roofline.
  const crossMat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.5, 0.4), crossMat);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, 0.4), crossMat);
  const hosp = landmarkPos(LANDMARKS.find((l) => l.type === 'hospital'));
  crossV.position.set(hosp.x, 32.5, hosp.z - 13.2);
  crossH.position.set(hosp.x, 32.5, hosp.z - 13.2);
  group.add(crossV, crossH);
  // Fountain in the plaza.
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6.6, 1, 24),
    new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }),
  );
  basin.position.set(parkPos.x, CITY.sidewalkHeight + 0.5, parkPos.z);
  const fountainWater = new THREE.Mesh(
    new THREE.CircleGeometry(5.7, 24),
    new THREE.MeshLambertMaterial({ color: 0x5fb8dd }),
  );
  fountainWater.rotation.x = -Math.PI / 2;
  fountainWater.position.set(parkPos.x, CITY.sidewalkHeight + 0.98, parkPos.z);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.1, 3.2, 10),
    new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }),
  );
  column.position.set(parkPos.x, CITY.sidewalkHeight + 1.6, parkPos.z);
  group.add(basin, fountainWater, column);
  // Gas station canopy on four poles.
  const gas = landmarkPos(LANDMARKS.find((l) => l.type === 'gas'));
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(18, 0.6, 12),
    new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }),
  );
  canopy.position.set(gas.x - 8, 5.4, gas.z - 6);
  group.add(canopy);
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 5.2, 8);
  poleGeo.translate(0, 2.6, 0);
  const gasPoleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0xcccccc }), 4);
  [[-16, -11], [0, -11], [-16, -1], [0, -1]].forEach(([ox, oz], i) => {
    setInstance(gasPoleMesh, i, gas.x + ox, 0, gas.z + oz, 1, 1, 1);
  });
  group.add(gasPoleMesh);

  // ---- Collision boxes, one axis-aligned box per building ----
  for (const b of buildings) {
    const w = b.rotY % Math.PI === 0 ? b.w : b.d;
    const d = b.rotY % Math.PI === 0 ? b.d : b.w;
    b.minX = b.x - w / 2;
    b.maxX = b.x + w / 2;
    b.minZ = b.z - d / 2;
    b.maxZ = b.z + d / 2;
  }

  const bounds = districtBounds();
  const districts = Object.values(DISTRICTS).map((d) => ({
    id: d.id,
    name: d.name,
    tagline: d.tagline,
    bounds: bounds[d.id],
    color: PALETTE.districts[d.id].accent,
  }));
  const landmarks = LANDMARKS.map((l) => ({ ...l, ...landmarkPos(l) }));

  // ---- Blob shadows (v2) ----
  // One shared radial-gradient texture, one material, one unit plane: every
  // ground-level entity group in the scene (vehicles, the player, peds,
  // hostiles) gets a flat shadow mesh that follows it. The shadows live in
  // the scene, not as children, so a fallen hostile keeps a flat shadow and
  // a hidden player mesh (while driving) hides its shadow too. New entities
  // are picked up the frame they appear; despawned ones lose their shadow.
  // setNight runs every render frame, so it drives the sync for free.
  const shadowTexture = makeBlobShadowTexture();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture, transparent: true, depthWrite: false,
  });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new Map(); // entity mesh -> shadow mesh
  const shadowBox = new THREE.Box3();
  const shadowSize = new THREE.Vector3();

  function attachShadow(scene, obj) {
    if (obj === group || !obj.isGroup || shadows.has(obj)) return;
    if (Math.abs(obj.position.y) > 0.5) return; // flying things cast none here
    shadowBox.setFromObject(obj);
    shadowBox.getSize(shadowSize);
    // The objective marker beam is 26 m tall; anything that tall is scenery.
    if (shadowSize.y > 4 || shadowSize.x < 0.2 || shadowSize.z < 0.2) return;
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.y = 0.08;
    shadow.scale.set(
      Math.max(1.0, shadowSize.x + 0.5),
      1,
      Math.max(1.0, shadowSize.z + 0.5),
    );
    scene.add(shadow);
    shadows.set(obj, shadow);
  }

  function updateShadows() {
    const scene = group.parent;
    if (!scene) return;
    for (const child of scene.children) attachShadow(scene, child);
    for (const [obj, shadow] of shadows) {
      if (!obj.parent) {
        // Despawned or destroyed: drop its shadow so the map never grows.
        scene.remove(shadow);
        shadows.delete(obj);
        continue;
      }
      shadow.visible = obj.visible;
      shadow.position.x = obj.position.x;
      shadow.position.z = obj.position.z;
      // Roads sit at y 0.02-0.05, sidewalk blocks top out at 0.3.
      shadow.position.y = isRoad(obj.position.x, obj.position.z) ? 0.08 : 0.36;
      shadow.rotation.y = obj.rotation.y;
    }
  }

  /** Night lighting: 0 = day, 1 = deep night. Lit windows + lamp bulbs. */
  function setNight(factor) {
    const f = Math.max(0, Math.min(1, factor));
    towerMat.emissiveIntensity = f * 1.1;
    lowMat.emissiveIntensity = f * 1.1;
    bulbMat.color.setHex(f > 0.25 ? 0xffd27a : 0x8a8f96);
    shadowMaterial.opacity = 1 - f * 0.7; // shadows fade as night falls
    updateShadows();
  }

  // Restored at v2 merge: Worker D removed these as dead code (nothing in
  // v1 called them), but Worker C's blob shadows place shadows by isRoad and
  // the return object exports both — without the definitions the game does
  // not boot (ReferenceError). D's other city.js deletions (parkedSpots,
  // trees/lamps/stats) stay deleted: nothing reads them.
  /** True if a world point is on a street (within half a road of a street line). */
  function isRoad(x, z) {
    const half = CITY.roadWidth / 2;
    for (const c of STREET_COORDS) {
      if (Math.abs(x - c) < half || Math.abs(z - c) < half) return true;
    }
    return false;
  }

  /** True if a world point is in the sea (east of the beach or south of the quay). */
  function isWater(x, z) {
    return x > 332 || z > 312;
  }

  return {
    graph,
    buildings,
    districts,
    landmarks,
    group,
    setNight,
    isRoad,
    isWater,
    /** How many blob shadows are live (playtests use this to prove shadows). */
    get shadowCount() {
      return shadows.size;
    },
    bounds: { minX: -286, maxX: 286, minZ: -286, maxZ: 286 },
  };
}


/** Facade texture modules are 12 m x 12 m; the shader tiles them per building size. */
const FACADE_MODULE = 12;

/**
 * Patch a Lambert material so each instance tiles its map by its real world size
 * instead of stretching one texture across the whole face. The patch reads the
 * instance matrix scale in the vertex shader and rescales the map/emissive UVs.
 */
function patchFacadeUV(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 iscale = vec3(
          length(instanceMatrix[0].xyz),
          length(instanceMatrix[1].xyz),
          length(instanceMatrix[2].xyz));
        vec2 faceSize = vec2(max(iscale.x, iscale.z), iscale.y);
        vMapUv = vMapUv * (faceSize / ${FACADE_MODULE.toFixed(1)});
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = vEmissiveMapUv * (faceSize / ${FACADE_MODULE.toFixed(1)});
        #endif
      #endif`,
    );
  };
}

/** Unit triangular prism: 1 x 1 footprint, 0.5 apex height, ridge along X. */
function prismGeometry() {
  const A = [-0.5, 0, -0.5];
  const B = [0.5, 0, -0.5];
  const C = [0.5, 0, 0.5];
  const D = [-0.5, 0, 0.5];
  const E = [-0.5, 0.5, 0];
  const F = [0.5, 0.5, 0];
  const tris = [
    // South slope (+Z).
    D, C, F, D, F, E,
    // North slope (-Z).
    B, A, E, B, E, F,
    // West end.
    A, D, E,
    // East end.
    B, F, C,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geo.computeVertexNormals();
  return geo;
}

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

function setInstance(mesh, i, x, y, z, sx, sy, sz, rotY = 0, rotX = 0) {
  dummy.position.set(x, y, z);
  dummy.rotation.set(rotX, rotY, 0);
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

/**
 * Generate the building list for one normal block. Returns building records
 * { x, z, w, d, h, rotY, type, district, tint, facing }.
 */
function generateBlockBuildings(col, row, districtId) {
  const rng = createRandom(hashSeed(`block:${col},${row}`));
  const def = DISTRICTS[districtId];
  const cx = blockX(col);
  const cz = blockZ(row);
  const inset = def.lotInset;
  const half = CITY.pitch / 2 - CITY.roadWidth / 2 - inset; // usable half-size
  const buildings = [];
  const tint = () => randPick(rng, PALETTE.districts[districtId].wall);

  if (def.style === 'tower') {
    // One tower, taller toward the city centre.
    const distC = Math.hypot(cx, cz) / 400;
    const h = randRange(rng, def.minHeight, def.maxHeight) * (1.15 - distC * 0.55);
    const w = randRange(rng, 26, 42);
    const d = randRange(rng, 26, 42);
    buildings.push({
      x: cx + randRange(rng, -3, 3), z: cz + randRange(rng, -3, 3),
      w, d, h, rotY: 0, type: 'tower', district: districtId, tint: tint(),
    });
    if (randChance(rng, 0.45)) {
      const h2 = h * randRange(rng, 0.35, 0.6);
      const w2 = randRange(rng, 14, 20);
      const d2 = randRange(rng, 14, 20);
      const side = randPick(rng, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      // Only build the second tower if it fits beside the first without
      // overlapping it and without poking past the block edge (29 m).
      const needed = w / 2 + w2 / 2 + 2;
      const maxOff = 29 - Math.max(w2, d2) / 2 - 1;
      if (needed <= maxOff) {
        buildings.push({
          x: cx + side[0] * needed, z: cz + side[1] * needed,
          w: w2, d: d2, h: h2, rotY: 0, type: 'tower', district: districtId, tint: tint(),
        });
      }
    }
    return buildings;
  }

  if (def.style === 'warehouse') {
    const count = randInt(rng, 1, 2);
    // One orientation per block: two warehouses stack along the short axis.
    const horizontal = randChance(rng, 0.5);
    for (let i = 0; i < count; i++) {
      const w = horizontal ? randRange(rng, 30, 46) : randRange(rng, 16, 22);
      const d = horizontal ? randRange(rng, 16, 22) : randRange(rng, 30, 46);
      const shift = count === 1 ? 0 : (i === 0 ? -half / 2 : half / 2);
      buildings.push({
        x: cx + (horizontal ? 0 : shift),
        z: cz + (horizontal ? shift : 0),
        w, d, h: randRange(rng, def.minHeight, def.maxHeight),
        rotY: 0, type: 'warehouse', district: districtId, tint: tint(),
      });
    }
    return buildings;
  }

  // Row/grid styles: shophouse, stucco, house — 2x2 lots inside the block.
  const n = 2;
  const lot = (half * 2) / n;
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      if (def.style === 'stucco' && gx === 1 && gy === 1 && randChance(rng, 0.5)) continue;
      const w = lot * randRange(rng, 0.72, 0.9);
      const d = lot * randRange(rng, 0.72, 0.9);
      const x = cx - half + lot * (gx + 0.5);
      const z = cz - half + lot * (gy + 0.5);
      // Facing: the side toward the nearest street (outward from block centre).
      const facing = Math.abs(x - cx) > Math.abs(z - cz)
        ? (x > cx ? 1 : 3)
        : (z > cz ? 0 : 2);
      buildings.push({
        x, z, w, d,
        h: randRange(rng, def.minHeight, def.maxHeight),
        rotY: 0, type: def.style, district: districtId, tint: tint(), facing,
      });
    }
  }
  return buildings;
}

/** Landmark buildings, placed by hand on their blocks. */
function generateLandmarkBuildings(landmark) {
  const { x, z } = landmarkPos(landmark);
  switch (landmark.type) {
    case 'hospital':
      return [{
        x, z, w: 34, d: 26, h: 30, rotY: 0, type: 'tower',
        district: 'vistahills', tint: 0xf4f6f8, landmark: landmark.id,
      }];
    case 'police':
      return [{
        x, z, w: 30, d: 22, h: 17, rotY: 0, type: 'lowrise',
        district: 'downtown', tint: 0xcfd8e3, landmark: landmark.id,
      }];
    case 'respray':
      return [{
        x, z, w: 26, d: 16, h: 7.5, rotY: 0, type: 'lowrise',
        district: 'mercado', tint: 0xe8e2d4, landmark: landmark.id,
      }];
    case 'gas':
      return [{
        x: x + 8, z: z + 6, w: 12, d: 8, h: 4.5, rotY: 0, type: 'lowrise',
        district: 'palmbeach', tint: 0xf0ead8, landmark: landmark.id,
      }];
    case 'park':
    default:
      return [];
  }
}

