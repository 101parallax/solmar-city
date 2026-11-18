import * as THREE from 'three';

// Police helicopter: big, bright and impossible to miss — it anchors the
// cover screenshot. Spawns at 3 stars, orbits the player at about 40 m with
// spinning rotors and a searchlight cone tracking the player below.
export class Helicopter {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.mesh = null;
    this.rotor = null;
    this.tailRotor = null;
    this.spotlight = null;
    this.spotTarget = null;
    this.cone = null;
    this.elapsed = 0;
    // When true (screenshot staging), update() keeps spinning the rotors
    // and tracking the searchlight but does not move the mesh: the staged
    // position stays exactly where the shot put it.
    this.holdPosition = false;
  }

  _build() {
    const group = new THREE.Group();
    const navy = new THREE.MeshStandardMaterial({
      color: 0x1d3050, metalness: 0.5, roughness: 0.4,
    });
    const white = new THREE.MeshStandardMaterial({
      color: 0xe8ecf0, metalness: 0.3, roughness: 0.5,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x0e1a24, metalness: 0.9, roughness: 0.15,
    });
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 5.6), white);
    group.add(fuselage);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.4), glass);
    nose.position.set(0, 0.1, 3.2);
    group.add(nose);
    // Police livery is white body + navy cheatline: a navy fuselage read
    // as a black silhouette against the sky (and was near-invisible at
    // dusk), while the white body stays bright and readable from the
    // ground at any time of day.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.7, 5.62), navy);
    stripe.position.y = -0.4;
    group.add(stripe);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 5.2), white);
    tail.position.set(0, 0.5, -5.2);
    group.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 1.2), navy);
    fin.position.set(0, 1.2, -7.4);
    group.add(fin);
    // Landing skids.
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 8), white);
      skid.rotation.x = Math.PI / 2;
      skid.position.set(side * 1.3, -1.5, 0.4);
      group.add(skid);
      for (const z of [-1.2, 1.6]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), white);
        strut.position.set(side * 1.3, -1.15, z);
        group.add(strut);
      }
    }
    // Main rotor: two long blades on a mast.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8), white);
    mast.position.y = 1.5;
    group.add(mast);
    this.rotor = new THREE.Group();
    this.rotor.position.y = 2.1;
    const bladeGeo = new THREE.BoxGeometry(0.42, 0.08, 11.5);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    this.rotor.add(blade);
    const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
    blade2.rotation.y = Math.PI / 2;
    this.rotor.add(blade2);
    // Faint blur disc so the fast rotor reads as motion, not a frozen cross.
    const blur = new THREE.Mesh(
      new THREE.CircleGeometry(5.75, 32),
      new THREE.MeshBasicMaterial({
        color: 0x222222, transparent: true, opacity: 0.1,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    blur.rotation.x = -Math.PI / 2;
    this.rotor.add(blur);
    group.add(this.rotor);
    // Tail rotor.
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.45, 0.6, -7.6);
    const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.0, 0.3), bladeMat);
    this.tailRotor.add(tailBlade);
    group.add(this.tailRotor);
    // Searchlight cone: apex at the helicopter, wide end on the ground.
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff6c0, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(6, 30, 24, 1, true), coneMat);
    this.cone.position.y = -15;
    group.add(this.cone);
    // Real spotlight so the ground brightens under the beam.
    this.spotlight = new THREE.SpotLight(0xfff2b0, 700, 90, 0.32, 0.5, 1.2);
    this.spotlight.position.set(0, -1.2, 2.5);
    group.add(this.spotlight);
    this.spotTarget = new THREE.Object3D();
    this.game.scene.add(this.spotTarget);
    this.spotlight.target = this.spotTarget;
    // Oversized on purpose: the helicopter must read clearly in screenshots.
    group.scale.setScalar(1.35);
    return group;
  }

  spawn() {
    if (this.active) return;
    this.mesh = this._build();
    const playerPos = this.game.state.playerPos;
    this.mesh.position.set(playerPos.x + 12, 42, playerPos.z - 18);
    this.game.scene.add(this.mesh);
    this.active = true;
  }

  dismiss() {
    if (!this.active) return;
    this.game.scene.remove(this.mesh);
    if (this.spotTarget) this.game.scene.remove(this.spotTarget);
    this.mesh = null;
    this.rotor = null;
    this.tailRotor = null;
    this.spotlight = null;
    this.spotTarget = null;
    this.cone = null;
    this.active = false;
    this.holdPosition = false;
  }

  isActive() {
    return this.active;
  }

  update(dt) {
    const wanted = this.game.state?.wanted ?? 0;
    if (wanted >= 3 && !this.active) this.spawn();
    if (wanted < 3 && this.active) {
      this.dismiss();
      return;
    }
    if (!this.active) return;
    this.elapsed += dt;
    this.rotor.rotation.y += dt * 28;
    this.tailRotor.rotation.x += dt * 34;
    const playerPos = this.game.state.playerPos;
    if (!this.holdPosition) {
      // Slow orbit around the player so the helicopter stays in frame.
      const angle = this.elapsed * 0.12;
      const targetX = playerPos.x + Math.cos(angle) * 20;
      const targetZ = playerPos.z + Math.sin(angle) * 20;
      const targetY = 40 + Math.sin(this.elapsed * 0.7) * 1.5;
      const k = 1 - Math.exp(-dt * 1.4);
      this.mesh.position.x += (targetX - this.mesh.position.x) * k;
      this.mesh.position.y += (targetY - this.mesh.position.y) * k;
      this.mesh.position.z += (targetZ - this.mesh.position.z) * k;
      // Face the player (yaw only) with a gentle bank into the orbit.
      this.mesh.lookAt(playerPos.x, this.mesh.position.y, playerPos.z);
      this.mesh.rotation.z = Math.sin(this.elapsed * 0.12) * 0.06;
    }
    // Searchlight tracks the player; the beam reads stronger at night.
    this.spotTarget.position.set(playerPos.x, 0, playerPos.z);
    const hour = this.game.state.timeOfDay ?? 12;
    const night = hour < 6 || hour >= 19;
    if (this.cone) this.cone.material.opacity = night ? 0.28 : 0.14;
  }
}
