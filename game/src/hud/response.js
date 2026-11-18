// The police response panel (v2): while the player is wanted, the top-left
// corner names every unit in the pursuit — call sign, distance in metres,
// status — so the chase reads as an organised response, not anonymous cars.
//
//   drawResponse(el, units) — el from createResponsePanel(hudRoot); units
//   from Police.responseUnits(player): [{ name, dist, status, kind }].
//
// The panel is created in code (no index.html edit) and updated only when
// its text actually changes. Distances tick every frame, so the panel is
// aria-hidden: it is a passive visual readout, never a live region —
// announcing it would spam screen-reader users (the game already has one
// polite #status region for real announcements).

const STATUS_COLORS = {
  PURSUIT: '#ffd23f',
  RAMMING: '#ff6b61',
  ROADBLOCK: '#ff8c1a',
  ARREST: '#ff6b61',
  'EN ROUTE': '#9aa5b1',
  SEARCHLIGHT: '#6fb3ff',
  'SPOTLIGHT ON YOU': '#6fb3ff',
  DOWN: '#5a636e',
};

/** Create the panel element inside the HUD root and return it. */
export function createResponsePanel(hudRoot) {
  const el = document.createElement('div');
  el.id = 'hud-response';
  el.setAttribute('aria-hidden', 'true');
  // Below the objective block (top-left), above the minimap.
  el.style.cssText = [
    'position:absolute',
    'top:118px',
    'left:18px',
    'min-width:210px',
    'padding:8px 10px',
    'background:rgba(8,14,22,0.72)',
    'border:1px solid rgba(255,255,255,0.25)',
    'border-radius:6px',
    'font-size:14px',
    'line-height:1.55',
    'color:#eef1f5',
    'text-shadow:0 1px 3px rgba(0,0,0,0.9)',
    'pointer-events:none',
    'display:none',
  ].join(';');
  const header = document.createElement('div');
  header.textContent = 'SPD RESPONSE';
  header.style.cssText = 'font-weight:700;letter-spacing:2px;font-size:12px;color:#9aa5b1;margin-bottom:2px';
  el.appendChild(header);
  const list = document.createElement('div');
  list.id = 'hud-response-list';
  el.appendChild(list);
  if (hudRoot) hudRoot.appendChild(el);
  return el;
}

/** Render one row per unit. `units` is [] when nothing is wanted. */
export function drawResponse(el, units) {
  if (!el) return;
  const list = el.querySelector('#hud-response-list');
  if (!list) return;
  const rows = Array.isArray(units) ? units : [];
  if (rows.length === 0) {
    if (el.style.display !== 'none') {
      el.style.display = 'none';
      list.textContent = '';
    }
    el._lastKey = '';
    return;
  }
  // One string key for the whole panel: rebuild the DOM only when a row
  // actually changed (distances tick constantly, so compare cheaply).
  const key = rows.map((u) => `${u.name}|${u.dist}|${u.status}`).join('\n');
  if (el._lastKey === key) {
    if (el.style.display === 'none') el.style.display = '';
    return;
  }
  el._lastKey = key;
  el.style.display = '';
  list.textContent = '';
  for (const u of rows) {
    const row = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = u.name;
    name.style.cssText = 'font-weight:700;min-width:96px;display:inline-block';
    const dist = document.createElement('span');
    dist.textContent = `${u.dist}m`;
    dist.style.cssText = 'color:#cfd6de;min-width:52px;display:inline-block;text-align:right;margin-right:8px';
    const status = document.createElement('span');
    status.textContent = u.status;
    status.style.cssText = `font-weight:700;color:${STATUS_COLORS[u.status] ?? '#eef1f5'}`;
    row.append(name, dist, status);
    list.appendChild(row);
  }
}
