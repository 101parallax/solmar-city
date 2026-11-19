// Sky: sun, sky dome, fog and drifting clouds for Solmar City. Five time-of-day
// palettes (night, dawn, day, golden hour, dusk) drive the sky gradient, the
// sun colour and angle, the hemisphere light and the exponential fog. Golden
// hour — 16:30 to 18:00 — is the game's default: low orange sun, cool blue
// shadows, warm haze over the bay.

import * as THREE from 'three';

// Palettes keyed by hour. Each entry: sky top, sky horizon, sun colour,
// sun intensity, hemisphere sky/ground, fog colour and fog density.
const PALETTES = [
  { hour: 0, top: 0x0a1026, horizon: 0x1a2440, sun: 0x8fa8d8, sunI: 0.25, hemiSky: 0x24304f, hemiGround: 0x0c0f16, fog: 0x0d1428, fogD: 0.0016 },
  { hour: 5, top: 0x1c2f55, horizon: 0x5a5a8a, sun: 0xd8a0a0, sunI: 0.4, hemiSky: 0x3a4a6e, hemiGround: 0x141a24, fog: 0x2a3550, fogD: 0.0014 },
  { hour: 8, top: 0x3d7ac2, horizon: 0x9fc8e8, sun: 0xfff2cc, sunI: 1.2, hemiSky: 0x9ec8e8, hemiGround: 0x5a6b52, fog: 0xa8c8e0, fogD: 0.0009 },
  { hour: 12, top: 0x2f7fd4, horizon: 0xa8d8f0, sun: 0xffffff, sunI: 1.5, hemiSky: 0xb8dcf2, hemiGround: 0x6b7a5e, fog: 0xb8d8ea, fogD: 0.0008 },
  { hour: 16.5, top: 0x2a5a9e, horizon: 0xffb36b, sun: 0xff9e3d, sunI: 1.25, hemiSky: 0x8ab8d8, hemiGround: 0x6b5a48, fog: 0xe8a06b, fogD: 0.0011 },
  { hour: 18, top: 0x1e3a6e, horizon: 0xff7e4d, sun: 0xff6b2e, sunI: 0.9, hemiSky: 0x6a7aa8, hemiGround: 0x4a3f38, fog: 0xc87a55, fogD: 0.0013 },
  { hour: 20, top: 0x141c3a, horizon: 0x4a3a5a, sun: 0xa08ac8, sunI: 0.35, hemiSky: 0x3a4066, hemiGround: 0x161a20, fog: 0x2a2a40, fogD: 0.0015 },
  { hour: 24, top: 0x0a1026, horizon: 0x1a2440, sun: 0x8fa8d8, sunI: 0.25, hemiSky: 0x24304f, hemiGround: 0x0c0f16, fog: 0x0d1428, fogD: 0.0016 },
];

function lerpColor(a, b, t, out) {
  out.setHex(a).lerp(new THREE.Color(b), t);
  return out;
}

function samplePalette(hours) {
  const h = ((hours % 24) + 24) % 24;
  let i = 0;
  while (i < PALETTES.length - 2 && PALETTES[i + 1].hour <= h) i++;
  const a = PALETTES[i];
  const b = PALETTES[i + 1];
  const t = THREE.MathUtils.clamp((h - a.hour) / (b.hour - a.hour), 0, 1);
  return { a, b, t };
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.timeOfDay = 16.5;
    this._time = 0;
    this._sunPos = new THREE.Vector3(0, 1, 0);
    this._tmpColor = new THREE.Color();

    // Sky dome: gradient shader, sun glow baked into the fragment shader.
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0x2a5a9e) },
      horizonColor: { value: new THREE.Color(0xffb36b) },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(0xff9e3d) },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(h, 0.6));
          float s = max(dot(normalize(vDir), normalize(sunDirection)), 0.0);
          col += sunColor * (pow(s, 350.0) * 1.4 + pow(s, 24.0) * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Sun: directional light with a wide shadow frustum over the city.
    this.sun = new THREE.DirectionalLight(0xff9e3d, 1.25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -320;
    this.sun.shadow.camera.right = 320;
    this.sun.shadow.camera.top = 320;
    this.sun.shadow.camera.bottom = -320;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 1200;
    this.sun.shadow.bias = -0.0004;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Hemisphere fill so shadowed faces stay readable.
    this.hemi = new THREE.HemisphereLight(0x8ab8d8, 0x6b5a48, 0.55);
    scene.add(this.hemi);

    // Fog: warm at golden hour, cool blue at night.
    scene.fog = new THREE.FogExp2(0xe8a06b, 0.0011);

    // A handful of soft cloud billboards drifting with the wind.
    this.clouds = [];
    const cloudTex = this._makeCloudTexture();
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const angle = (i / 14) * Math.PI * 2;
      const radius = 260 + (i % 5) * 90;
      sprite.position.set(Math.cos(angle) * radius, 150 + (i % 3) * 30, Math.sin(angle) * radius);
      sprite.scale.set(120 + (i % 4) * 40, 28 + (i % 3) * 10, 1);
      scene.add(sprite);
      this.clouds.push(sprite);
    }

    this.setTimeOfDay(this.timeOfDay);
  }

  _makeCloudTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 24; i++) {
      const x = 30 + ((i * 67) % 196);
      const y = 40 + ((i * 41) % 48);
      const r = 18 + ((i * 13) % 26);
      const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // Sun direction for a given hour: rises east (06:00), sets west (18:00),
  // highest at noon. At night the "sun" is the moon, low and cool.
  _sunDirectionFor(hours) {
    const h = ((hours % 24) + 24) % 24;
    const dayT = THREE.MathUtils.clamp((h - 6) / 12, 0, 1);
    const azimuth = THREE.MathUtils.lerp(-Math.PI / 2, Math.PI / 2, dayT);
    const elevation = Math.sin(dayT * Math.PI) * 1.1 + 0.08;
    if (h < 6 || h > 18) {
      // Night: dim moon high in the east.
      return new THREE.Vector3(-0.4, 0.7, -0.3).normalize();
    }
    return new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -0.35).normalize();
  }

  setTimeOfDay(hours) {
    this.timeOfDay = ((hours % 24) + 24) % 24;
    const { a, b, t } = samplePalette(this.timeOfDay);
    const lerp = (ka, kb) => lerpColor(a[ka], b[kb], t, new THREE.Color());
    this.skyUniforms.topColor.value.copy(lerp('top', 'top'));
    this.skyUniforms.horizonColor.value.copy(lerp('horizon', 'horizon'));
    this.skyUniforms.sunColor.value.copy(lerp('sun', 'sun'));
    const dir = this._sunDirectionFor(this.timeOfDay);
    this._sunPos.copy(dir);
    this.skyUniforms.sunDirection.value.copy(dir);
    this.sun.position.copy(dir).multiplyScalar(600);
    this.sun.color.copy(lerp('sun', 'sun'));
    this.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
    // Clouds fade with the light: bright by day, faint silhouettes at night.
    const cloudOpacity = 0.18 + 0.32 * THREE.MathUtils.clamp(this.sun.intensity / 1.5, 0, 1);
    for (const cloud of this.clouds) cloud.material.opacity = cloudOpacity;
    this.hemi.color.copy(lerp('hemiSky', 'hemiSky'));
    this.hemi.groundColor.copy(lerp('hemiGround', 'hemiGround'));
    if (this.scene.fog) {
      this.scene.fog.color.copy(lerp('fog', 'fog'));
      this.scene.fog.density = THREE.MathUtils.lerp(a.fogD, b.fogD, t);
    }
  }

  // Current sun (or moon) direction, unit length, pointing from origin.
  get sunPosition() {
    return this._sunPos;
  }

  get isNight() {
    return this.timeOfDay < 5.5 || this.timeOfDay > 19.5;
  }

  get isGoldenHour() {
    return this.timeOfDay >= 16.5 && this.timeOfDay <= 18.0;
  }

  // Clouds drift slowly; the dome follows the camera so the horizon never ends.
  update(dt, cameraPosition) {
    this._time += dt;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += dt * (1.2 + (i % 3) * 0.5);
      if (c.position.x > 700) c.position.x = -700;
    }
    if (cameraPosition) {
      this.dome.position.set(cameraPosition.x, 0, cameraPosition.z);
    }
  }
}
