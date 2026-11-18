// Police response panel for Solmar City: while the player is wanted, a
// panel in the top-left lists every responding unit by name with its
// distance in metres and its current status (PURSUIT, RAMMING, ROADBLOCK,
// SEARCHLIGHT or EN ROUTE). Unit names come from seabirds and coastal fish.

export class ResponsePanel {
  constructor(game) {
    this.game = game;
    this.container = document.getElementById('hud-response');
    this.visible = false;
  }

  get state() {
    return this.game.state;
  }

  _helicopterRow() {
    const heli = this.game.helicopter;
    if (!heli || typeof heli.isActive !== 'function' || !heli.isActive()) return null;
    let distance = 0;
    const pos = this.state.playerPos || { x: 0, z: 0 };
    if (heli.mesh) {
      const dx = heli.mesh.position.x - pos.x;
      const dz = heli.mesh.position.z - pos.z;
      distance = Math.round(Math.sqrt(dx * dx + dz * dz));
    }
    return { name: 'SKY EYE', type: 'heli', distance, status: 'SEARCHLIGHT' };
  }

  update(units) {
    const wanted = this.state.wanted;
    const rows = Array.isArray(units) ? units.slice() : [];
    const heliRow = this._helicopterRow();
    if (heliRow) rows.push(heliRow);
    if (wanted > 0 && rows.length > 0) {
      this.show();
      drawResponse(this.container, rows, wanted);
    } else {
      this.hide();
    }
  }

  show() {
    if (!this.container) return;
    this.container.classList.remove('is-hidden');
    this.visible = true;
  }

  hide() {
    if (!this.container) return;
    this.container.classList.add('is-hidden');
    this.visible = false;
  }
}

// Render the unit list into a container element. Kept as a standalone
// function so tests and the response panel share one renderer.
export function drawResponse(container, units, wantedLevel) {
  if (!container) return;
  container.innerHTML = '';
  const heading = document.createElement('div');
  heading.className = 'response-heading';
  const stars = '★'.repeat(wantedLevel || 0);
  heading.textContent = 'POLICE RESPONSE ' + stars;
  container.appendChild(heading);
  const list = document.createElement('ul');
  list.className = 'response-list';
  const sorted = units.slice().sort((a, b) => (a.distance || 0) - (b.distance || 0));
  // Keep the panel compact: the six nearest units are the ones that matter.
  const shown = sorted.slice(0, 6);
  for (const unit of shown) {
    const item = document.createElement('li');
    item.className = 'response-row';
    if (unit.type === 'heli') item.classList.add('is-heli');
    const name = document.createElement('span');
    name.className = 'response-name';
    name.textContent = unit.name || 'UNIT';
    const distance = document.createElement('span');
    distance.className = 'response-distance';
    distance.textContent = Math.round(unit.distance || 0) + 'm';
    const status = document.createElement('span');
    status.className = 'response-status';
    status.textContent = (unit.status || 'EN ROUTE').toUpperCase();
    item.append(name, distance, status);
    list.appendChild(item);
  }
  container.appendChild(list);
}
