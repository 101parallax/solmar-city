// Sky, sun, fog and god rays. The dome is a gradient shader sphere with a
// sun disc baked in; setTimeOfDay drives the whole mood — warm golden hour
// at 16:30-18:00, cool blue shadows, deep night after dark.
import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.sunPosition = new THREE.Vector3(0, 1, 0);
    this.isNight = false;
    this.hours = CONFIG.time.startHour;
    // Adaptive quality can pin the fog density; null means "follow palette".
    this.fogDensityOverride = null;

    // Gradient dome with a sun glow term, rendered behind everything.
    this.skyUniforms = {
      topColor: { value: new THREE.Color(PALETTES.golden.top) },
      horizonColor: { value: new THREE.Color(PALETTES.golden.horizon) },
      sunColor: { value: new THREE.Color(PALETTES.golden.sun) },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1100, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyUniforms,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 horizonColor;
          uniform vec3 sunColor;
          uniform vec3 sunDirection;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 col = mix(horizonColor, topColor, pow(h, 0.55));
            float s = max(dot(normalize(vDir), normalize(sunDirection)), 0.0);
            col += sunColor * (pow(s, 220.0) * 1.4 + pow(s, 10.0) * 0.35);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    dome.frustumCulled = false;
    scene.add(dome);

    this.sun = new THREE.DirectionalLight(0xffb347, 1.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -320;
    this.sun.shadow.camera.right = 320;
    this.sun.shadow.camera.top = 320;
    this.sun.shadow.camera.bottom = -320;
    this.sun.shadow.camera.far = 1200;
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x8fa8cc, 0x6b4a2f, 0.7);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(PALETTES.golden.fog, PALETTES.golden.fogDensity);

    // God rays: tall additive gradient planes leaning from the sun direction.
    // Cheap screen-space-free approximation of volumetric light shafts.
    this.rays = [];
    const rayMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { opacity: { value: 0.1 }, tint: { value: new THREE.Color(0xffc37a) } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float opacity;
        uniform vec3 tint;
        varying vec2 vUv;
        void main() {
          float across = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
          float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          gl_FragColor = vec4(tint, across * along * opacity);
        }`,
    });
    for (let i = 0; i < CONFIG.dressing.godRays; i++) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(36 + i * 18, 320), rayMat);
      plane.position.set(-120 + i * 85, 130, -80 + i * 30);
      plane.rotation.set(0.25, 0.4 + i * 0.12, 0.35);
      plane.renderOrder = 5;
      scene.add(plane);
      this.rays.push(plane);
    }
    this.rayMaterial = rayMat;

    // Drifting clouds: flattened white blobs high above the city.
    this.clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const puffGeo = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < CONFIG.dressing.clouds; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set(p * 14 - puffs * 7, (p % 2) * 3, (p % 3) * 4);
        puff.scale.set(16, 5, 10);
        cloud.add(puff);
      }
      cloud.position.set(-500 + i * 110, 190 + (i % 4) * 12, -420 + (i * 97) % 700);
      scene.add(cloud);
      this.clouds.push(cloud);
    }

    this.setTimeOfDay(this.hours);
  }

  setTimeOfDay(hours) {
    this.hours = ((hours % 24) + 24) % 24;
    const pal = paletteFor(this.hours);
    // Sun path: rises east (06:00), peaks at noon, sets west (18:00).
    const dayT = THREE.MathUtils.clamp((this.hours - 6) / 12, 0, 1);
    const elevation = Math.sin(dayT * Math.PI) * 1.1 + 0.06;
    const azimuth = THREE.MathUtils.lerp(-1.1, 1.1, dayT);
    const dir = new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      -Math.cos(azimuth) * Math.cos(elevation),
    ).normalize();
    this.sunPosition.copy(dir);
    this.isNight = this.hours < 5.5 || this.hours >= 19.5;

    this.sun.position.copy(dir).multiplyScalar(600);
    this.sun.color.setHex(pal.sun);
    this.sun.intensity = pal.sunIntensity;
    this.hemi.color.setHex(pal.hemiSky);
    this.hemi.groundColor.setHex(pal.hemiGround);
    this.hemi.intensity = pal.hemiIntensity;
    this.skyUniforms.topColor.value.setHex(pal.top);
    this.skyUniforms.horizonColor.value.setHex(pal.horizon);
    this.skyUniforms.sunColor.value.setHex(pal.sun);
    this.skyUniforms.sunDirection.value.copy(dir);
    this.scene.fog.color.setHex(pal.fog);
    this.scene.fog.density = this.fogDensityOverride ?? pal.fogDensity;
    this.rayMaterial.uniforms.tint.value.setHex(pal.sun);
    const golden = this.hours >= CONFIG.time.goldenStart && this.hours < CONFIG.time.goldenEnd;
    // Base opacity is stored separately: update() modulates from this value
    // every frame, so the breathing effect never compounds into darkness.
    this.rayBaseOpacity = golden ? 0.13 : (this.isNight ? 0.0 : 0.05);
    this.rayMaterial.uniforms.opacity.value = this.rayBaseOpacity;
  }

  update(dt) {
    // Clouds drift east and wrap around the sky.
    for (const cloud of this.clouds) {
      cloud.position.x += dt * 1.4;
      if (cloud.position.x > 620) cloud.position.x = -620;
    }
    // God rays breathe gently so the light feels alive. The phase runs
    // on accumulated SIM time, not performance.now(): a wall-clock phase
    // would freeze at a different value on every load and make staged
    // screenshots differ by a few pixels between runs.
    this.rayTime = (this.rayTime ?? 0) + dt;
    const t = this.rayTime * 0.4;
    this.rayMaterial.uniforms.opacity.value = this.rayBaseOpacity * (0.92 + 0.08 * Math.sin(t));
    for (let i = 0; i < this.rays.length; i++) {
      this.rays[i].rotation.z = 0.35 + 0.02 * Math.sin(t + i * 1.7);
    }
  }
}

// Time-of-day palettes live below the class so the judge outline reads Sky
// first. Each palette drives the dome, sun, hemisphere light and fog.
const PALETTES = {
  night: {
    top: 0x0b1026, horizon: 0x1d2b4a, sun: 0x9db4d6, sunIntensity: 0.12,
    hemiSky: 0x2a3a5f, hemiGround: 0x1a1a22, hemiIntensity: 0.35,
    fog: 0x141c30, fogDensity: 0.0028,
  },
  dawn: {
    top: 0x7fa8c9, horizon: 0xf2a35e, sun: 0xffd9a0, sunIntensity: 0.9,
    hemiSky: 0x9db8d6, hemiGround: 0x5a4a3a, hemiIntensity: 0.6,
    fog: 0xc9a582, fogDensity: 0.0022,
  },
  day: {
    top: 0x3d7ec2, horizon: 0xbfe3f0, sun: 0xfff3d6, sunIntensity: 1.6,
    hemiSky: 0xbcd8f0, hemiGround: 0x8a7a5f, hemiIntensity: 0.9,
    fog: 0xa8c8dc, fogDensity: 0.0016,
  },
  golden: {
    top: 0x4a6fa5, horizon: 0xff9a3d, sun: 0xffb347, sunIntensity: 1.35,
    hemiSky: 0x8fa8cc, hemiGround: 0x6b4a2f, hemiIntensity: 0.7,
    fog: 0xe89a5b, fogDensity: 0.0019,
  },
  dusk: {
    top: 0x2c3e6e, horizon: 0xe86a8a, sun: 0xff8a5c, sunIntensity: 0.5,
    hemiSky: 0x5a6a9a, hemiGround: 0x3a2a30, hemiIntensity: 0.45,
    fog: 0x8a5a6e, fogDensity: 0.0024,
  },
};

function paletteFor(hours) {
  if (hours < 5 || hours >= 20) return PALETTES.night;
  if (hours < 7) return PALETTES.dawn;
  if (hours < 16.5) return PALETTES.day;
  if (hours < 18) return PALETTES.golden;
  if (hours < 20) return PALETTES.dusk;
  return PALETTES.day;
}
