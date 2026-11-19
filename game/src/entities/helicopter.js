// Helicopter: police air support that arrives at 3 stars, circles the
// player from about 40 m up with spinning rotors and a searchlight cone.
// The body is white with a navy stripe so it reads clearly against the sky.
import * as THREE from 'three';

const HOVER_HEIGHT = 40;
const ORBIT_RADIUS = 18;

export class Helicopter {
  constructor(game) {
    this.game = game;
    this.mesh = null;
    this.rotor = null;
    this.tailRotor = null;
    this.searchlight = null;
    this.spot = null;
    this.active = false;
    this.hold = false;
    this.orbitAngle = 0;
    this.time = 0;
  }

  isActive() {
    return this.active;
  }

  buildMesh() {
    const mesh = new THREE.Group();
    mesh.name = 'helicopter';

    // White body with a navy stripe: bright against sky and rooftops.
    const white = new THREE.MeshStandardMaterial({
      color: 0xf5f6f8,
      metalness: 0.3,
      roughness: 0.4,
    });
    const navy = new THREE.MeshStandardMaterial({
      color: 0x1d3557,
      metalness: 0.3,
      roughness: 0.5,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x0e1a26,
      metalness: 0.8,
      roughness: 0.2,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 3.4), white);
    body.castShadow = true;
    mesh.add(body);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.34, 3.44), navy);
    stripe.position.y = -0.2;
    mesh.add(stripe);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.9), glass);
    cockpit.position.set(0, 0.25, 1.6);
    mesh.add(cockpit);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 3.2), white);
    tail.position.set(0, 0.3, -3.1);
    mesh.add(tail);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.7), navy);
    fin.position.set(0, 0.7, -4.5);
    mesh.add(fin);

    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 2.6),
        new THREE.MeshStandardMaterial({ color: 0x222222 }),
      );
      skid.position.set(side * 1.0, -1.0, 0.2);
      mesh.add(skid);
    }

    this.rotor = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    for (const angle of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.06, 0.34), bladeMat);
      blade.rotation.y = angle;
      this.rotor.add(blade);
    }
    this.rotor.position.y = 1.05;
    mesh.add(this.rotor);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8),
      bladeMat,
    );
    mast.position.y = 0.85;
    mesh.add(mast);

    this.tailRotor = new THREE.Group();
    for (const angle of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.7, 0.18), bladeMat);
      blade.rotation.z = angle;
      this.tailRotor.add(blade);
    }
    this.tailRotor.position.set(0.25, 0.5, -4.5);
    mesh.add(this.tailRotor);

    // Searchlight cone: additive, fades with distance, always aimed down
    // at the player.
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2b0,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.searchlight = new THREE.Mesh(
      new THREE.ConeGeometry(7, HOVER_HEIGHT, 20, 1, true),
      coneMat,
    );
    this.searchlight.position.y = -HOVER_HEIGHT / 2;
    mesh.add(this.searchlight);

    this.spot = new THREE.SpotLight(0xfff2b0, 0, 90, 0.35, 0.5, 1);
    this.spot.position.y = -0.8;
    mesh.add(this.spot);
    // The spotlight target lives in the scene (world space), not as a
    // child of the helicopter: as a child, the heli's lookAt rotation
    // would swing the beam away from the player.
    this.game.scene.add(this.spot.target);

    return mesh;
  }

  spawn() {
    if (this.active) return;
    if (!this.mesh) this.mesh = this.buildMesh();
    const playerPos = this.game.state.playerPos || { x: 0, z: 0 };
    this.mesh.position.set(playerPos.x + ORBIT_RADIUS, HOVER_HEIGHT, playerPos.z);
    this.game.scene.add(this.mesh);
    this.active = true;
    this.hold = false;
    this.game.audio?.sfx?.('sirenBlip');
  }

  holdPosition(value = true) {
    this.hold = value;
  }

  dismiss() {
    if (!this.active) return;
    this.game.scene.remove(this.mesh);
    this.active = false;
    this.hold = false;
  }

  update(dt) {
    const level = this.game.state.wanted || 0;
    if (level >= 3 && !this.active) this.spawn();
    if (level < 3 && this.active) {
      this.dismiss();
      return;
    }
    if (!this.active) return;

    this.time += dt;
    this.rotor.rotation.y += dt * 26;
    this.tailRotor.rotation.x += dt * 34;

    const playerPos = this.game.state.playerPos || { x: 0, z: 0 };
    if (!this.hold) {
      this.orbitAngle += dt * 0.16;
      const targetX = playerPos.x + Math.cos(this.orbitAngle) * ORBIT_RADIUS;
      const targetZ = playerPos.z + Math.sin(this.orbitAngle) * ORBIT_RADIUS;
      const targetY = HOVER_HEIGHT + Math.sin(this.time * 0.7) * 1.4;
      const pos = this.mesh.position;
      const ease = 1 - Math.pow(0.02, dt);
      pos.x += (targetX - pos.x) * ease;
      pos.y += (targetY - pos.y) * ease;
      pos.z += (targetZ - pos.z) * ease;
      this.mesh.lookAt(playerPos.x, 0, playerPos.z);
    }

    // Searchlight tracks the player; the spotlight only shines at night.
    this.spot.target.position.set(playerPos.x, 0, playerPos.z);
    const hour = this.game.state.timeOfDay ?? 16.5;
    const isNight = hour < 6 || hour >= 18.5;
    this.spot.intensity = isNight ? 260 : 0;
    this.searchlight.material.opacity = isNight ? 0.2 : 0.1;
  }
}
