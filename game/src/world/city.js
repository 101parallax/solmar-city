// buildCity: the whole 3D world of Solmar City in one call. Five districts of
// procedural buildings on an 8x8 road grid, a beach with animated caustics, a
// shader ocean with sun glint, 650 instanced swaying palms, a lighthouse and
// pier, a ferris wheel, god-ray planes for golden hour, and adaptive quality
// (palm count scales down on weak machines). Everything is seeded: the same
// seed builds the same city every time.

import * as THREE from 'three';
import { CITY_DATA, bounds, waterLine } from '../data/city.js';
import { makeTextures } from './textures.js';

const BLOCK_CENTRES = [-245, -175, -105, -35, 35, 105, 175, 245];

// Golden-hour strength 0..1 for a given hour: peaks at 17:15, zero at night.
function goldenFactor(hours) {
  const h = ((hours % 24) + 24) % 24;
  if (h < 15 || h > 19.5) return 0;
  if (h <= 17.25) return (h - 15) / 2.25;
  return 1 - (h - 17.25) / 2.25;
}

function districtAt(x, z) {
  for (const d of CITY_DATA.districts) {
    const b = d.bounds;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return d;
  }
  return CITY_DATA.districts[0];
}

export function buildCity(scene, rng) {
  const textures = makeTextures(1);
  const colliders = [];
  const landmarks = [];
  const time = { t: 0, hours: 16.5 };
  const animated = { ocean: null, caustics: null, beam: null, wheel: null, rays: null, palmShaders: [] };

  const addCollider = (x, z, halfW, halfD) => {
    colliders.push({ minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD });
  };

  // ---- ground, roads, sidewalks -----------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshLambertMaterial({ color: 0x5d6e54 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.1, 120);
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ map: textures.road });
  const roadGeoX = new THREE.PlaneGeometry(580, 14);
  for (const line of CITY_DATA.roadLines) {
    const alongX = new THREE.Mesh(roadGeoX, roadMat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, line);
    alongX.receiveShadow = true;
    scene.add(alongX);
    const alongZ = new THREE.Mesh(roadGeoX, roadMat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.rotation.z = Math.PI / 2;
    alongZ.position.set(line, 0.02, 0);
    alongZ.receiveShadow = true;
    scene.add(alongZ);
  }

  const sidewalkMat = new THREE.MeshLambertMaterial({ map: textures.sidewalk });
  const sidewalkGeo = new THREE.BoxGeometry(62, 0.3, 62);
  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      const slab = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      slab.position.set(bx, 0.15, bz);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }

  // ---- buildings ----------------------------------------------------------
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const facadeTints = [0xffffff, 0xe8dcc8, 0xc8d8e8, 0xe8c8c8, 0xd8e8d0, 0xd0c8e8];
  const facadeMats = facadeTints.map(
    (tint) => new THREE.MeshLambertMaterial({ map: textures.facade, color: tint }),
  );
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });

  const specialAt = new Map();
  for (const lm of CITY_DATA.landmarks) specialAt.set(`${lm.x},${lm.z}`, lm);
  for (const shop of CITY_DATA.shops) specialAt.set(`${shop.x},${shop.z}`, shop);

  function addBuilding(x, z, w, d, h, matIndex) {
    const mesh = new THREE.Mesh(unitBox, facadeMats[matIndex % facadeMats.length]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2 + 0.3, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = new THREE.Mesh(unitBox, roofMat);
    roof.scale.set(w + 0.6, 0.6, d + 0.6);
    roof.position.set(x, h + 0.6, z);
    scene.add(roof);
    addCollider(x, z, w / 2, d / 2);
    return mesh;
  }

  for (const bx of BLOCK_CENTRES) {
    for (const bz of BLOCK_CENTRES) {
      const special = specialAt.get(`${bx},${bz}`);
      if (special) continue; // landmarks and shops get their own structures
      const district = districtAt(bx, bz);
      const downtown = district.id === 'downtown';
      const harbor = district.id === 'harborfront';
      if (downtown && rng.chance(0.35)) {
        // Single tower.
        addBuilding(bx, bz, rng.range(26, 38), rng.range(26, 38), rng.range(45, 85), rng.int(0, 5));
      } else if (harbor && rng.chance(0.5)) {
        // Wide low warehouse.
        addBuilding(bx, bz, rng.range(38, 50), rng.range(26, 36), rng.range(8, 14), rng.int(0, 5));
      } else {
        // Two to four mid-rise blocks.
        const nx = rng.chance(0.5) ? 2 : 1;
        const nz = rng.chance(0.5) ? 2 : 1;
        for (let i = 0; i < nx; i++) {
          for (let j = 0; j < nz; j++) {
            const w = 54 / nx - 6;
            const d = 54 / nz - 6;
            const x = bx + (i - (nx - 1) / 2) * (54 / nx);
            const z = bz + (j - (nz - 1) / 2) * (54 / nz);
            const h = downtown ? rng.range(20, 45) : rng.range(8, 22);
            addBuilding(x, z, w, d, h, rng.int(0, 5));
          }
        }
      }
    }
  }

  // ---- shops (distinct coloured buildings with a lit sign) ----------------
  const shopColors = { respray: 0x2ea8a0, guns: 0x8a2e2e, hospital: 0xe8e8e8, police: 0x2e4a8a };
  for (const shop of CITY_DATA.shops) {
    const mat = new THREE.MeshLambertMaterial({ color: shopColors[shop.type] ?? 0x888888 });
    const mesh = new THREE.Mesh(unitBox, mat);
    mesh.scale.set(30, 12, 24);
    mesh.position.set(shop.x, 6.3, shop.z);
    mesh.castShadow = true;
    scene.add(mesh);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 3),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
    );
    sign.position.set(shop.x, 13.5, shop.z - 12.2);
    scene.add(sign);
    addCollider(shop.x, shop.z, 15, 12);
    landmarks.push({ id: shop.id, name: shop.name, x: shop.x, z: shop.z, kind: 'shop' });
  }

  // ---- street lights (instanced poles + lamps) ----------------------------
  {
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
    const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
    const spots = [];
    for (const ix of CITY_DATA.roadLines) {
      for (const iz of CITY_DATA.roadLines) {
        spots.push([ix + 10, iz + 10]);
        spots.push([ix - 10, iz - 10]);
      }
    }
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 3.5, z);
      poles.setMatrixAt(i, m);
      m.makeTranslation(x, 7.1, z);
      lamps.setMatrixAt(i, m);
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    scene.add(poles);
    scene.add(lamps);
  }

  // ---- beach + caustics ----------------------------------------------------
  const beachGeo = new THREE.PlaneGeometry(1400, 30, 96, 4);
  beachGeo.rotateX(-Math.PI / 2);
  {
    // Gentle dune ripples, baked into the vertices (seeded, static).
    const pos = beachGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.05) * 0.25 + Math.cos(z * 0.4 + x * 0.02) * 0.2);
    }
    beachGeo.computeVertexNormals();
  }
  const beach = new THREE.Mesh(beachGeo, new THREE.MeshLambertMaterial({ map: textures.sand }));
  beach.position.set(0, 0.1, (bounds.maxZ + waterLine) / 2);
  beach.receiveShadow = true;
  scene.add(beach);

  const causticsUniforms = { uTime: { value: 0 }, uOpacity: { value: 0.55 } };
  const causticsMat = new THREE.ShaderMaterial({
    uniforms: causticsUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      float caustic(vec2 p, float t) {
        float v = 0.0;
        v += sin(p.x * 0.35 + t * 0.7) * sin(p.y * 0.30 - t * 0.5);
        v += sin((p.x + p.y) * 0.22 - t * 0.4);
        v += sin(length(p) * 0.25 - t * 0.6);
        return pow(max(v * 0.5 + 0.5, 0.0), 3.0);
      }
      void main() {
        vec2 p = vUv * vec2(140.0, 12.0);
        float c = caustic(p, uTime) * 0.6 + caustic(p * 1.7 + 5.0, uTime * 1.3) * 0.4;
        float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        gl_FragColor = vec4(vec3(0.55, 0.85, 1.0) * c, c * uOpacity * edge);
      }`,
  });
  const caustics = new THREE.Mesh(new THREE.PlaneGeometry(1400, 60), causticsMat);
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.set(0, 0.35, waterLine - 5);
  scene.add(caustics);
  animated.caustics = causticsUniforms;

  // ---- ocean (wave + sun glint + caustics shader) --------------------------
  const oceanUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.4, -0.3).normalize() },
    uSunColor: { value: new THREE.Color(0xff9e3d) },
    uDeep: { value: new THREE.Color(0x0d3f5c) },
    uShallow: { value: new THREE.Color(0x2e9db8) },
  };
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: oceanUniforms,
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x * 0.08 + uTime * 0.9) * 0.35
                + sin(p.z * 0.11 - uTime * 0.7) * 0.3
                + sin((p.x + p.z) * 0.05 + uTime * 0.5) * 0.4;
        p.y += w;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      varying vec2 vUv;
      varying vec3 vWorld;
      float caustic(vec2 p, float t) {
        float v = 0.0;
        v += sin(p.x * 0.35 + t * 0.7) * sin(p.y * 0.30 - t * 0.5);
        v += sin((p.x + p.y) * 0.22 - t * 0.4);
        return pow(max(v * 0.5 + 0.5, 0.0), 3.0);
      }
      void main() {
        // vUv.y == 1 at the shoreline, 0 in deep water.
        float shore = vUv.y;
        vec3 col = mix(uDeep, uShallow, pow(shore, 1.6));
        // Sun glint: sparkling path toward the sun.
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vec3(
          sin(vWorld.x * 0.35 + uTime * 1.1) * 0.12,
          1.0,
          cos(vWorld.z * 0.3 - uTime * 0.9) * 0.12));
        vec3 refl = reflect(-viewDir, n);
        float glint = pow(max(dot(refl, normalize(uSunDir)), 0.0), 90.0);
        col += uSunColor * glint * 1.6;
        // Dancing caustics in the shallows.
        float c = caustic(vWorld.xz * 0.5, uTime);
        col += vec3(0.4, 0.75, 0.9) * c * pow(shore, 2.0) * 0.5;
        // Foam at the waterline.
        float foam = smoothstep(0.985, 1.0, shore + sin(vWorld.x * 0.2 + uTime * 0.8) * 0.006);
        col = mix(col, vec3(0.95), foam * 0.8);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const oceanGeo = new THREE.PlaneGeometry(1600, 520, 96, 32);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.set(0, 0.2, waterLine + 260);
  scene.add(ocean);
  animated.ocean = oceanUniforms;

  // ---- palms: 650 instanced, swaying in the vertex shader ------------------
  const PALM_COUNT = 650;
  const FRONDS_PER_PALM = 5;
  const palmSpots = [];
  // Beach rows (300), harbor boulevard (200), parks and avenues (150).
  for (let i = 0; i < 300; i++) {
    palmSpots.push({ x: rng.range(-280, 280), z: rng.range(292, 312) });
  }
  for (let i = 0; i < 200; i++) {
    palmSpots.push({ x: rng.range(-280, 280), z: rng.pick([276, 284]) + rng.range(-2, 2) });
  }
  for (let i = 0; i < 150; i++) {
    const bx = rng.pick(BLOCK_CENTRES);
    const bz = rng.pick(BLOCK_CENTRES);
    palmSpots.push({ x: bx + rng.range(-24, 24), z: bz + rng.range(-24, 24) });
  }

  function swayMaterial(base) {
    base.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      animated.palmShaders.push(shader);
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 ipos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float swayPhase = ipos.x * 0.11 + ipos.z * 0.13;
          float swayAmount = pow(clamp(position.y / 4.5, 0.0, 1.0), 2.0);
          transformed.x += sin(uTime * 1.1 + swayPhase) * 0.35 * swayAmount;
          transformed.z += cos(uTime * 0.9 + swayPhase * 1.3) * 0.22 * swayAmount;
        }`,
      );
    };
    return base;
  }

  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.24, 4.5, 6);
  trunkGeo.translate(0, 2.25, 0);
  const trunkMat = swayMaterial(new THREE.MeshLambertMaterial({ color: 0x6b4a2e }));
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, PALM_COUNT);
  const frondGeo = new THREE.PlaneGeometry(2.4, 2.4);
  frondGeo.translate(0, 1.0, 0);
  const frondMat = swayMaterial(
    new THREE.MeshLambertMaterial({
      map: textures.frond,
      alphaTest: 0.4,
      side: THREE.DoubleSide,
      color: 0xffffff,
    }),
  );
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, PALM_COUNT * FRONDS_PER_PALM);
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    palmSpots.forEach((spot, i) => {
      const h = rng.range(0.85, 1.3);
      const tilt = rng.range(-0.12, 0.12);
      e.set(tilt, rng.range(0, Math.PI * 2), rng.range(-0.12, 0.12));
      q.setFromEuler(e);
      p.set(spot.x, 0.3, spot.z);
      s.set(h, h, h);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      for (let f = 0; f < FRONDS_PER_PALM; f++) {
        const yaw = (f / FRONDS_PER_PALM) * Math.PI * 2 + rng.range(-0.2, 0.2);
        e.set(-0.9 + rng.range(-0.15, 0.15), yaw, 0, 'YXZ');
        q.setFromEuler(e);
        p.set(spot.x, 0.3 + 4.5 * h, spot.z);
        s.set(h, h, h);
        m.compose(p, q, s);
        fronds.setMatrixAt(i * FRONDS_PER_PALM + f, m);
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
  }
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(fronds);
  const palms = { count: PALM_COUNT, trunks, fronds };

  // ---- pier + lighthouse (the hero landmark) -------------------------------
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const pier = new THREE.Mesh(unitBox, pierMat);
  pier.scale.set(8, 1.2, 95);
  pier.position.set(0, 1.0, 337);
  pier.receiveShadow = true;
  scene.add(pier);
  {
    const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 3.5, 6);
    const posts = new THREE.InstancedMesh(postGeo, pierMat, 20);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 10; i++) {
      m.makeTranslation(-4.2, 0, 296 + i * 9);
      posts.setMatrixAt(i * 2, m);
      m.makeTranslation(4.2, 0, 296 + i * 9);
      posts.setMatrixAt(i * 2 + 1, m);
    }
    posts.instanceMatrix.needsUpdate = true;
    scene.add(posts);
  }
  const lighthouse = new THREE.Group();
  lighthouse.position.set(0, 0, 382);
  {
    const white = new THREE.MeshLambertMaterial({ color: 0xf2ede2 });
    const red = new THREE.MeshLambertMaterial({ color: 0xc23b2e });
    for (let i = 0; i < 5; i++) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(3.4 - i * 0.3, 3.7 - i * 0.3, 4.4, 12),
        i % 2 === 0 ? white : red,
      );
      band.position.y = 2.2 + i * 4.4;
      band.castShadow = true;
      lighthouse.add(band);
    }
    const lampRoom = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 3, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
    );
    lampRoom.position.y = 23.5;
    lighthouse.add(lampRoom);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.4, 12), red);
    cap.position.y = 26.2;
    lighthouse.add(cap);
    const lampLight = new THREE.PointLight(0xfff2b0, 60, 120, 1.6);
    lampLight.position.y = 23.5;
    lighthouse.add(lampLight);
  }
  // Rotating twin beams (additive cones, no shadow cost).
  const beamGroup = new THREE.Group();
  beamGroup.position.y = 23.5;
  {
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.ConeGeometry(4, 70, 12, 1, true);
    for (const dir of [1, -1]) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.z = dir * Math.PI / 2;
      beam.position.x = dir * 35;
      beamGroup.add(beam);
    }
  }
  lighthouse.add(beamGroup);
  scene.add(lighthouse);
  animated.beam = beamGroup;
  addCollider(0, 382, 4, 4);
  landmarks.push({ id: 'lighthouse', name: 'Solmar Lighthouse', x: 0, z: 382, kind: 'lighthouse' });
  landmarks.push({ id: 'pier', name: 'Harbor Pier', x: 0, z: 330, kind: 'pier' });

  // ---- ferris wheel (slowly turning) ---------------------------------------
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(-210, 0, 245);
  {
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(18, 0.5, 8, 32), frameMat);
    rim.position.y = 22;
    wheelGroup.add(rim);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 36, 6), frameMat);
      spoke.position.y = 22;
      spoke.rotation.z = (i / 8) * Math.PI;
      wheelGroup.add(spoke);
    }
    const legMat = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 24, 6), legMat);
      leg.position.set(side * 6, 11, 0);
      leg.rotation.z = side * 0.45;
      wheelGroup.add(leg);
    }
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0xe86a92 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cabin = new THREE.Mesh(unitBox, cabinMat);
      cabin.scale.set(2.4, 2, 2);
      cabin.position.set(Math.cos(a) * 18, 22 + Math.sin(a) * 18, 0);
      wheelGroup.add(cabin);
    }
  }
  scene.add(wheelGroup);
  animated.wheel = wheelGroup;
  addCollider(-210, 245, 6, 6);
  landmarks.push({ id: 'ferris', name: 'Marina Wheel', x: -210, z: 245, kind: 'ferris' });

  // ---- arena, tower, fountain, fort, market --------------------------------
  {
    // The arena sits on the (245, 105) block centre — NOT on the (210, 210)
    // road intersection, where its 26 m collider used to block the M2 race
    // checkpoint, an M4 delivery and the M7 start (all unreachable).
    const arena = new THREE.Mesh(
      new THREE.CylinderGeometry(26, 28, 14, 24),
      new THREE.MeshLambertMaterial({ color: 0xb8c8d8 }),
    );
    arena.position.set(245, 7.3, 105);
    arena.castShadow = true;
    scene.add(arena);
    const arenaRing = new THREE.Mesh(
      new THREE.TorusGeometry(26, 1.2, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x7ab8ff }),
    );
    arenaRing.rotation.x = Math.PI / 2;
    arenaRing.position.set(245, 14.6, 105);
    scene.add(arenaRing);
    addCollider(245, 105, 26, 26);
    landmarks.push({ id: 'arena', name: 'Solmar Arena', x: 245, z: 105, kind: 'arena' });

    const tower = new THREE.Mesh(unitBox, facadeMats[2]);
    tower.scale.set(30, 110, 30);
    tower.position.set(-35, 55.3, -105);
    tower.castShadow = true;
    scene.add(tower);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4040 }),
    );
    beacon.position.set(-35, 112, -105);
    scene.add(beacon);
    addCollider(-35, -105, 15, 15);
    landmarks.push({ id: 'tower', name: 'Aurora Tower', x: -35, z: -105, kind: 'tower' });

    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 11, 1.6, 20),
      new THREE.MeshLambertMaterial({ color: 0x9a938a }),
    );
    basin.position.set(35, 1.1, 35);
    scene.add(basin);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.4, 20),
      new THREE.MeshLambertMaterial({ color: 0x2e9db8 }),
    );
    water.position.set(35, 1.9, 35);
    scene.add(water);
    landmarks.push({ id: 'fountain', name: 'Central Fountain', x: 35, z: 35, kind: 'fountain' });

    const fort = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xa8906a }));
    fort.scale.set(40, 12, 40);
    fort.position.set(245, 6.3, -245);
    fort.castShadow = true;
    scene.add(fort);
    for (let i = 0; i < 4; i++) {
      const turret = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 4, 18, 8),
        new THREE.MeshLambertMaterial({ color: 0x8a7452 }),
      );
      turret.position.set(245 + (i % 2 === 0 ? -18 : 18), 9.3, -245 + (i < 2 ? -18 : 18));
      turret.castShadow = true;
      scene.add(turret);
    }
    addCollider(245, -245, 20, 20);
    landmarks.push({ id: 'fort', name: 'Old Fort', x: 245, z: -245, kind: 'fort' });

    const market = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xc25e3a }));
    market.scale.set(34, 10, 26);
    market.position.set(175, 5.3, -35);
    market.castShadow = true;
    scene.add(market);
    addCollider(175, -35, 17, 13);
    landmarks.push({ id: 'market', name: 'Old Market Hall', x: 175, z: -35, kind: 'market' });
  }

  // ---- god rays (additive gradient planes, golden hour only) ----------------
  const rayUniforms = { uTime: { value: 0 }, uOpacity: { value: 0.5 } };
  const rayMat = new THREE.ShaderMaterial({
    uniforms: rayUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float vertical = pow(1.0 - vUv.y, 1.8);
        float horizontal = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float shimmer = 0.85 + 0.15 * sin(uTime * 0.6 + vUv.x * 6.0);
        gl_FragColor = vec4(vec3(1.0, 0.75, 0.45), vertical * horizontal * uOpacity * shimmer);
      }`,
  });
  const rayGeo = new THREE.PlaneGeometry(55, 260);
  const raySpots = [
    [-70, 0, 0.25], [30, -70, -0.2], [90, 40, 0.4], [-140, 120, -0.35], [0, 180, 0.1], [180, -120, -0.15],
    [0, 330, 0.15],
  ];
  for (const [x, z, tilt] of raySpots) {
    const ray = new THREE.Mesh(rayGeo, rayMat);
    ray.position.set(x, 110, z);
    ray.rotation.set(-0.45, 0, tilt);
    scene.add(ray);
  }
  animated.rays = rayUniforms;

  // ---- queries --------------------------------------------------------------
  function isRoad(x, z) {
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
    const half = CITY_DATA.roadWidth / 2 + 1;
    for (const line of CITY_DATA.roadLines) {
      if (Math.abs(x - line) <= half || Math.abs(z - line) <= half) return true;
    }
    return false;
  }

  function isWater(x, z) {
    return z > waterLine;
  }

  function setPalmScale(scale) {
    const s = THREE.MathUtils.clamp(scale, 0.1, 1);
    trunks.count = Math.max(1, Math.floor(PALM_COUNT * s));
    fronds.count = Math.max(1, Math.floor(PALM_COUNT * FRONDS_PER_PALM * s));
    palms.count = trunks.count;
  }

  function setTimeOfDay(hours) {
    time.hours = hours;
    const g = goldenFactor(hours);
    rayUniforms.uOpacity.value = 0.12 + g * 0.5;
    const night = hours < 6 || hours > 19;
    oceanUniforms.uSunColor.value.setHex(night ? 0x8fa8d8 : g > 0.4 ? 0xff9e3d : 0xfff2cc);
  }

  // Keep the ocean's sun glint aligned with the sky's sun direction.
  function setSunDirection(dir) {
    oceanUniforms.uSunDir.value.copy(dir).normalize();
  }
  setTimeOfDay(16.5);

  function update(dt) {
    time.t += dt;
    const t = time.t;
    oceanUniforms.uTime.value = t;
    causticsUniforms.uTime.value = t;
    rayUniforms.uTime.value = t;
    for (const shader of animated.palmShaders) {
      shader.uniforms.uTime.value = t;
    }
    if (animated.beam) animated.beam.rotation.y += dt * 0.5;
    if (animated.wheel) animated.wheel.rotation.z += dt * 0.05;
  }

  return {
    colliders,
    isRoad,
    isWater,
    bounds,
    districts: CITY_DATA.districts,
    landmarks,
    palms,
    ocean,
    textures,
    update,
    setPalmScale,
    setTimeOfDay,
    setSunDirection,
  };
}

// Blob shadows for entities (player, cars, pedestrians) — re-exported from
// textures.js so entities can import it from the world module.
export { makeBlobShadowTexture } from './textures.js';
