// Sky, sun, fog and the day/night cycle for Solmar City. A gradient dome with a
// sun glow, one directional light, hemisphere fill and distance fog. The clock
// defaults to golden hour (16:30) — the warmest light for screenshots — and runs
// at DAY.minutesPerSecond. Night is dark enough for street lamps and lit windows
// to read, never pitch black.

import * as THREE from 'three';
import { DAY } from '../config.js';

/** Colour keyframes through the day: [hour, sky top, horizon, fog, sun, sunI, hemiI]. */
const KEYFRAMES = [
  [0.0, 0x0a1024, 0x131c33, 0x0d1526, 0x8fa8d8, 0.06, 0.25],
  [5.0, 0x0a1024, 0x1a2438, 0x0d1526, 0x8fa8d8, 0.06, 0.25],
  [6.2, 0x5a7bb0, 0xf2a56b, 0xc98a6b, 0xffc07a, 0.45, 0.45],
  [9.0, 0x6fb3e8, 0xcfe8f5, 0xc4d9e2, 0xfff2d8, 1.15, 0.75],
  [13.0, 0x4f9fe0, 0xbfe0f2, 0xbcd6e2, 0xfff6e0, 1.25, 0.8],
  [16.5, 0x5f8fd0, 0xf7b267, 0xe8b07a, 0xffb36b, 1.05, 0.65],
  [18.8, 0x2e3a6e, 0xf27d4d, 0xc97a5e, 0xff8a4d, 0.35, 0.4],
  [20.0, 0x0d1330, 0x1c2440, 0x111a2e, 0x8fa8d8, 0.08, 0.28],
  [24.0, 0x0a1024, 0x131c33, 0x0d1526, 0x8fa8d8, 0.06, 0.25],
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function sampleKeyframes(hour) {
  let i = 0;
  while (i < KEYFRAMES.length - 2 && KEYFRAMES[i + 1][0] <= hour) i++;
  const a = KEYFRAMES[i];
  const b = KEYFRAMES[i + 1];
  const t = Math.max(0, Math.min(1, (hour - a[0]) / (b[0] - a[0])));
  return {
    top: tmpA.setHex(a[1]).lerp(tmpB.setHex(b[1]), t).clone(),
    horizon: tmpA.setHex(a[2]).lerp(tmpB.setHex(b[2]), t).clone(),
    fog: tmpA.setHex(a[3]).lerp(tmpB.setHex(b[3]), t).clone(),
    sun: tmpA.setHex(a[4]).lerp(tmpB.setHex(b[4]), t).clone(),
    sunIntensity: a[5] + (b[5] - a[5]) * t,
    hemiIntensity: a[6] + (b[6] - a[6]) * t,
  };
}

/** Sun direction (unit vector, Y up) for an hour of the day. East at dawn, south at noon, west at dusk. */
export function sunDirectionFor(hour) {
  const t = (hour - DAY.sunrise) / (DAY.sunset - DAY.sunrise);
  const clamped = Math.max(0, Math.min(1, t));
  const azimuth = Math.PI * clamped;
  const elevation = Math.sin(Math.PI * clamped) * THREE.MathUtils.degToRad(62);
  const horizontal = Math.cos(elevation);
  const dir = new THREE.Vector3(
    Math.cos(azimuth) * horizontal,
    Math.sin(elevation),
    Math.sin(azimuth) * horizontal,
  );
  if (t < 0 || t > 1) dir.y = -Math.abs(dir.y) - 0.15;
  return dir.normalize();
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.hour = DAY.startHour;

    // Gradient dome with a glow around the sun.
    this.domeUniforms = {
      topColor: { value: new THREE.Color(0x5f8fd0) },
      horizonColor: { value: new THREE.Color(0xf7b267) },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(0xffb36b) },
    };
    const domeMat = new THREE.ShaderMaterial({
      uniforms: this.domeUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.08, 1.0);
          vec3 col = mix(horizonColor, topColor, pow(max(h, 0.0), 0.55));
          float sunAmount = max(dot(normalize(vDir), normalize(sunDirection)), 0.0);
          col += sunColor * (pow(sunAmount, 220.0) * 1.4 + pow(sunAmount, 8.0) * 0.16);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), domeMat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Sun disc: a bright circle that sits on the dome in the sun's direction.
    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(34, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false, transparent: true, opacity: 0.95 }),
    );
    scene.add(this.sunDisc);

    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.0);
    this.sun.position.set(100, 200, 100);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x8a7a5f, 0.7);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog(0xe8b07a, 200, 1600);
    this.setTimeOfDay(this.hour);
  }

  /** 0 in full daylight, 1 in deep night — drives lamps and lit windows. */
  get nightFactor() {
    const h = this.hour;
    if (h >= 19.5 || h <= 5.5) return 1;
    if (h >= 9 && h <= 16) return 0;
    if (h > 16 && h < 19.5) return (h - 16) / 3.5;
    return (9 - h) / 3.5;
  }

  setTimeOfDay(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    const k = sampleKeyframes(this.hour);
    const dir = sunDirectionFor(this.hour);
    this.domeUniforms.topColor.value.copy(k.top);
    this.domeUniforms.horizonColor.value.copy(k.horizon);
    this.domeUniforms.sunDirection.value.copy(dir);
    this.domeUniforms.sunColor.value.copy(k.sun);
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunIntensity;
    this.hemi.intensity = k.hemiIntensity;
    this.scene.fog.color.copy(k.fog);
    this.scene.background = null;
    // Light comes from the sun's direction; at night it is faint moonlight.
    this.sun.position.copy(dir).multiplyScalar(400);
    const day = dir.y > 0.02;
    this.sunDisc.visible = day;
    if (day) {
      this.sunDisc.position.copy(dir).multiplyScalar(1300);
      this.sunDisc.lookAt(0, 0, 0);
      this.sunDisc.material.color.copy(k.sun).lerp(new THREE.Color(0xffffff), 0.4);
    }
  }

  /** Advance the clock; call once per frame with the real delta. */
  update(dt) {
    this.setTimeOfDay(this.hour + (dt * DAY.minutesPerSecond) / 60);
  }
}
