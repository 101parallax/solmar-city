// Police helicopter for Solmar City (v2): the air unit that joins the pursuit
// at 3+ stars. It shadows the player from just above the rooftops — high
// enough to clear the street, low enough to read in the chase camera —
// orbiting slowly ahead of them so it stays over the street, never inside a
// tower. At night it paints the player with a searchlight cone + spotlight;
// the response panel then reads "SPOTLIGHT ON YOU".
//
// The mesh is boxes only (no external assets): fuselage + tail boom, a
// two-blade main rotor and a tail rotor, both spinning, police blue with a
// white stripe and a blinking red beacon. It never collides with anything —
// it flies above the street and despawns when the wanted level drops.
//
// Interface (design §2 contract):
//   new Helicopter(scene, rng, callSign)
//   heli.update(dt, playerPos, { nightFactor, heading })
//   heli.destroy()

import * as THREE from 'three';
import { clamp, lerp } from './graph.js';

// Hover height: above the street and the low roofs, below the Downtown
// towers' tops — the orbit keeps it over the street, so it never clips one.
const HOVER_HEIGHT = 34;
// How far ahead of the player it leads, and how wide its slow orbit is.
const LEAD_DISTANCE = 22;
const ORBIT_RADIUS = 10;
const ORBIT_SPEED = 0.25; // radians per second
const FOLLOW_RATE = 2.2; // position lerp rate toward the hover point
const ROTOR_SPEED = 28; // radians per second

function lambert(color, emissive = 0x000000) {
  return new THREE.MeshLambertMaterial({ color, emissive });
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export class Helicopter {
  constructor(scene, rng, callSign = 'KESTREL-AIR') {
    this.scene = scene;
    this.callSign = callSign;
    this.x = 0;
    this.z = 0;
    this.y = HOVER_HEIGHT;
    this.heading = 0;
    this.spotlightOn = false;
    this._orbitAngle = (rng ? rng() : 0.5) * Math.PI * 2;
    this._rotorAngle = 0;
    this._time = 0;

    const group = new THREE.Group();
    const bodyMat = lambert(0x1f2a5f);
    const whiteMat = lambert(0xf0f0f0);
    const glassMat = lambert(0x1a2530);
    const darkMat = lambert(0x1c1c1c);

    // Fuselage: a rounded-looking body built from two boxes + a glass nose.
    group.add(box(2.2, 1.7, 4.4, bodyMat, 0, 0, 0));
    group.add(box(2.24, 0.5, 4.0, whiteMat, 0, -0.1, 0.2)); // white stripe
    group.add(box(1.9, 0.9, 0.9, glassMat, 0, 0.25, 2.2)); // cockpit glass
    // Tail boom + fin.
    group.add(box(0.5, 0.5, 4.6, bodyMat, 0, 0.15, -4.2));
    group.add(box(0.14, 1.1, 0.7, bodyMat, 0, 0.6, -6.3));
    // Skids.
    group.add(box(0.12, 0.12, 3.4, darkMat, -1.0, -1.15, 0));
    group.add(box(0.12, 0.12, 3.4, darkMat, 1.0, -1.15, 0));
    group.add(box(0.1, 0.35, 0.1, darkMat, -1.0, -0.95, 1.2));
    group.add(box(0.1, 0.35, 0.1, darkMat, 1.0, -0.95, 1.2));
    group.add(box(0.1, 0.35, 0.1, darkMat, -1.0, -0.95, -1.2));
    group.add(box(0.1, 0.35, 0.1, darkMat, 1.0, -0.95, -1.2));
    // Main rotor: two crossed blades on a mast, spinning around Y.
    const mast = box(0.16, 0.7, 0.16, darkMat, 0, 1.15, 0);
    group.add(mast);
    this._rotor = new THREE.Group();
    this._rotor.position.y = 1.55;
    const bladeMat = lambert(0x141414);
    this._rotor.add(box(11.5, 0.06, 0.42, bladeMat, 0, 0, 0));
    this._rotor.add(box(0.42, 0.06, 11.5, bladeMat, 0, 0, 0));
    group.add(this._rotor);
    // Tail rotor: small crossed blades on the fin, spinning around X.
    this._tailRotor = new THREE.Group();
    this._tailRotor.position.set(0.35, 0.6, -6.3);
    this._tailRotor.add(box(0.06, 2.0, 0.3, bladeMat, 0, 0, 0));
    this._tailRotor.add(box(0.06, 0.3, 2.0, bladeMat, 0, 0, 0));
    group.add(this._tailRotor);
    // Red beacon on the belly; its emissive blinks in update().
    this._beaconMat = lambert(0xdd1122, 0xaa0011);
    group.add(box(0.3, 0.18, 0.3, this._beaconMat, 0, -0.95, 0));

    // Searchlight: a translucent cone from the belly to the ground plus a
    // real spotlight, both faded in only at night (nightFactor > 0.25).
    // They live in the scene, not in the rotating group, so their world-space
    // aim never fights the helicopter's yaw.
    this._coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // Unit cone (height 1, radius 1), scaled per frame to the slant distance.
    this._cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true), this._coneMat);
    this._cone.visible = false;
    if (scene) scene.add(this._cone);
    this._spot = new THREE.SpotLight(0xfff2b0, 0, 220, 0.32, 0.55, 1);
    this._spot.position.set(0, HOVER_HEIGHT - 0.8, 0);
    if (scene) {
      scene.add(this._spot);
      scene.add(this._spot.target);
    }
    this._spot.target.position.set(0, 0, 0);

    this.mesh = group;
    this.mesh.position.set(0, HOVER_HEIGHT, 0);
    if (scene) scene.add(this.mesh);
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  /**
   * Shadow the player: hover ahead of them, orbiting slowly. `playerPos` is
   * {x, z}; opts carries the night factor (0 day .. 1 night) and the
   * player's heading, which the lead point is measured from.
   */
  update(dt, playerPos, opts = {}) {
    if (!playerPos) return;
    this._time += dt;
    const night = clamp(opts.nightFactor ?? 0, 0, 1);
    const heading = opts.heading ?? 0;
    this._orbitAngle += ORBIT_SPEED * dt;

    // Hover point: ahead of the player, plus a slow circular orbit.
    const leadX = playerPos.x + Math.sin(heading) * LEAD_DISTANCE;
    const leadZ = playerPos.z + Math.cos(heading) * LEAD_DISTANCE;
    const tx = leadX + Math.cos(this._orbitAngle) * ORBIT_RADIUS;
    const tz = leadZ + Math.sin(this._orbitAngle) * ORBIT_RADIUS;
    const k = Math.min(1, FOLLOW_RATE * dt);
    this.x = lerp(this.x, tx, k);
    this.z = lerp(this.z, tz, k);
    this.y = lerp(this.y, HOVER_HEIGHT, k);

    // Face the player, rotors spinning, beacon blinking (1 Hz, well under
    // the three-flashes-per-second limit).
    this.heading = Math.atan2(playerPos.x - this.x, playerPos.z - this.z);
    this._rotorAngle += ROTOR_SPEED * dt;
    this._rotor.rotation.y = this._rotorAngle;
    this._tailRotor.rotation.x = this._rotorAngle * 1.7;
    this._beaconMat.emissiveIntensity = Math.sin(this._time * Math.PI * 2) > 0 ? 2.0 : 0.2;

    // Searchlight: fade the cone + spotlight in at night, aimed at the
    // player. The cone's apex sits at the belly, its base on the ground.
    this.spotlightOn = night > 0.4;
    const lit = night > 0.25;
    this._cone.visible = lit;
    this._spot.position.set(this.x, this.y - 0.8, this.z);
    this._spot.target.position.set(playerPos.x, 0, playerPos.z);
    if (lit) {
      const dx = playerPos.x - this.x;
      const dz = playerPos.z - this.z;
      const slant = Math.hypot(dx, this.y, dz);
      this._coneMat.opacity = 0.13 * night;
      // ConeGeometry's apex is at +Y: point +Y from the ground at the
      // player toward the helicopter, then centre the cone on the midpoint.
      const dir = new THREE.Vector3(-dx / slant, this.y / slant, -dz / slant);
      this._cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this._cone.position.set((this.x + playerPos.x) / 2, this.y / 2, (this.z + playerPos.z) / 2);
      this._cone.scale.set(9, slant, 9);
      this._spot.intensity = 900 * night;
    } else {
      this._spot.intensity = 0;
    }

    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
  }

  destroy() {
    if (this.scene) {
      this.scene.remove(this.mesh);
      this.scene.remove(this._cone);
      this.scene.remove(this._spot);
      this.scene.remove(this._spot.target);
    }
    this.mesh.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    this._cone.geometry.dispose();
    this._coneMat.dispose();
  }
}
