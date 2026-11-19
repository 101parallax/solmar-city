// Police response panel: the left-side readout shown while the player is
// wanted, listing every named pursuing unit with its distance and status.

export class ResponsePanel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('hud-response');
    this.visible = false;
    this._lastKey = '';
  }

  // Refresh the panel from the current unit list. Units come from
  // police.units() plus the helicopter entry when it is active. An empty
  // list (or wanted level 0) hides the panel.
  update(units) {
    const state = this.game.state;
    const list = Array.isArray(units) ? units : [];
    if (!state || state.wanted <= 0 || list.length === 0) {
      this.hide();
      return;
    }
    const key = list.map((u) => u.name + ':' + Math.round(u.distance || 0) + ':' + (u.status || '')).join('|');
    if (key === this._lastKey && this.visible) return;
    this._lastKey = key;
    drawResponse(this.el, list);
    this.show();
  }

  show() {
    if (!this.el) return;
    this.el.hidden = false;
    this.visible = true;
  }

  hide() {
    if (!this.el) return;
    this.el.hidden = true;
    this.visible = false;
    this._lastKey = '';
  }
}

// Render unit rows into the panel element. Rows are built with DOM APIs
// (textContent, never innerHTML) so unit names can never inject markup.
export function drawResponse(container, units) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);
  const heading = document.createElement('div');
  heading.className = 'response-title';
  heading.textContent = 'RESPONSE';
  container.appendChild(heading);
  const list = document.createElement('ul');
  list.className = 'response-list';
  const sorted = units.slice().sort((a, b) => (a.distance || 0) - (b.distance || 0));
  for (const unit of sorted) {
    const row = document.createElement('li');
    row.className = 'response-row';
    const name = document.createElement('span');
    name.className = 'response-name';
    name.textContent = unit.name || 'UNIT';
    const distance = document.createElement('span');
    distance.className = 'response-distance';
    distance.textContent = Math.round(unit.distance || 0) + 'm';
    const status = document.createElement('span');
    status.className = 'response-status status-' + String(unit.status || 'pursuit').toLowerCase().replace(/[^a-z]+/g, '-');
    status.textContent = unit.status || 'PURSUIT';
    row.appendChild(name);
    row.appendChild(distance);
    row.appendChild(status);
    list.appendChild(row);
  }
  container.appendChild(list);
}
