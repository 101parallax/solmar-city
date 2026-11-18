// Shops for Solmar City: Chroma Auto (vehicle work) and Harbor Arms (gear).
// The shop UI is a native <dialog> opened with showModal() — the browser
// owns focus containment, top-layer rendering and Esc dismissal, so the shop
// needs no focus trap and no Esc handler of its own (Modern Web Guidance:
// "dialog"). Prices and availability live here; the effects (money, wanted,
// vehicle, combat) live in main.js behind the onBuy callback, so this module
// stays free of game state and runnable in logic tests.
//
// Items:
//   Respray $100  — clears the wanted level (Chroma Auto)
//   Repair $250   — restores the current vehicle to showroom condition
//   Nitro $3,000  — installs a nitro kit on the current vehicle (REP tier 2+;
//                   the NOS itself is Worker B's P1-10: it reads vehicle.hasNitro)
//   Armor $1,800  — a vest: full armour (Harbor Arms)
//   Ammo $200     — refills every reserve (Harbor Arms)

export const SHOPS = [
  {
    id: 'chroma',
    name: 'Chroma Auto',
    blurb: 'Respray · Repair · Nitro',
    pos: { x: -210, z: 175 }, // street side of the Chroma Auto block
    items: ['respray', 'repair', 'nitro'],
  },
  {
    id: 'arms',
    name: 'Harbor Arms',
    blurb: 'Armor · Ammo',
    pos: { x: 70, z: 210 },
    items: ['armor', 'ammo'],
  },
];

/**
 * Item catalogue. `canBuy(ctx)` returns { ok, reason } — reason is shown on
 * the button when the item cannot be bought right now. ctx carries:
 *   { money, wantedLevel, vehicle, armour, ammoLow, repTier }
 */
export const SHOP_ITEMS = {
  respray: {
    id: 'respray',
    name: 'Respray',
    price: 100,
    desc: 'Fresh paint — clears your wanted level',
    canBuy(ctx) {
      if ((ctx.wantedLevel ?? 0) <= 0) return { ok: false, reason: 'No wanted level' };
      if ((ctx.money ?? 0) < 100) return { ok: false, reason: 'Not enough cash' };
      return { ok: true, reason: '' };
    },
  },
  repair: {
    id: 'repair',
    name: 'Repair',
    price: 250,
    desc: 'Restore your vehicle to showroom condition',
    canBuy(ctx) {
      if (!ctx.vehicle) return { ok: false, reason: 'No vehicle' };
      if ((ctx.vehicle.damage ?? 0) < 0.05) return { ok: false, reason: 'Undamaged' };
      if ((ctx.money ?? 0) < 250) return { ok: false, reason: 'Not enough cash' };
      return { ok: true, reason: '' };
    },
  },
  nitro: {
    id: 'nitro',
    name: 'Nitro Kit',
    price: 3000,
    desc: 'Nitro for your ride — hold Shift while driving (REP tier 2+)',
    canBuy(ctx) {
      if ((ctx.repTier ?? 1) < 2) return { ok: false, reason: 'Requires REP tier 2' };
      if (!ctx.vehicle) return { ok: false, reason: 'No vehicle' };
      if (ctx.vehicle.hasNitro) return { ok: false, reason: 'Already installed' };
      if ((ctx.money ?? 0) < 3000) return { ok: false, reason: 'Not enough cash' };
      return { ok: true, reason: '' };
    },
  },
  armor: {
    id: 'armor',
    name: 'Armor Vest',
    price: 1800,
    desc: 'Full body armor — 100 armour',
    canBuy(ctx) {
      if ((ctx.armour ?? 0) >= 100) return { ok: false, reason: 'Armour full' };
      if ((ctx.money ?? 0) < 1800) return { ok: false, reason: 'Not enough cash' };
      return { ok: true, reason: '' };
    },
  },
  ammo: {
    id: 'ammo',
    name: 'Ammo Box',
    price: 200,
    desc: 'Refills all weapon reserves',
    canBuy(ctx) {
      if (!ctx.ammoLow) return { ok: false, reason: 'Ammo full' };
      if ((ctx.money ?? 0) < 200) return { ok: false, reason: 'Not enough cash' };
      return { ok: true, reason: '' };
    },
  },
};

/** Shop definition by id, or null. */
export function getShop(id) {
  return SHOPS.find((s) => s.id === id) ?? null;
}

/** The shop whose counter is within `radius` metres of `pos`, or null. */
export function shopNear(pos, radius = 12) {
  for (const shop of SHOPS) {
    const dx = pos.x - shop.pos.x;
    const dz = pos.z - shop.pos.z;
    if (dx * dx + dz * dz <= radius * radius) return shop;
  }
  return null;
}

export class Shop {
  /**
   * @param {function} onBuy - (itemId, shop) => { ok, message } after a buy.
   * @param {function} onClose - called whenever the dialog closes.
   */
  constructor(onBuy, onClose) {
    this.onBuy = onBuy ?? (() => ({ ok: false, message: '' }));
    this.onClose = onClose ?? (() => {});
    this.dialog = null;
    this.shop = null;
    this.ctx = null;
  }

  get isOpen() {
    return Boolean(this.dialog?.open);
  }

  /** Open the dialog for `shop`, rendering items against `ctx`. */
  open(shop, ctx) {
    if (typeof document === 'undefined') return false;
    if (!shop) return false;
    this.shop = shop;
    this.ctx = ctx;
    if (!this.dialog) this._buildDialog();
    this._render();
    if (!this.dialog.open) this.dialog.showModal();
    return true;
  }

  close() {
    if (this.dialog?.open) this.dialog.close();
  }

  /** Re-render with fresh context (after a buy changes money or state). */
  refresh(ctx) {
    if (!this.isOpen) return;
    if (ctx) this.ctx = ctx;
    this._render();
  }

  _buildDialog() {
    const dialog = document.createElement('dialog');
    dialog.id = 'shop-dialog';
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', 'shop-title');
    dialog.innerHTML = [
      '<h2 id="shop-title"></h2>',
      '<p id="shop-blurb" class="shop-blurb"></p>',
      '<p id="shop-cash" class="shop-cash"></p>',
      '<ul id="shop-items" class="shop-items"></ul>',
      '<form method="dialog"><button type="submit" value="close" autofocus>Close</button></form>',
    ].join('');
    // Esc closes the dialog natively; stop it reaching the game's window
    // keydown listener, which would also queue a pause action.
    dialog.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') event.stopPropagation();
    });
    dialog.addEventListener('close', () => {
      this.shop = null;
      this.onClose();
    });
    document.body.appendChild(dialog);
    this.dialog = dialog;
  }

  _render() {
    if (!this.dialog || !this.shop) return;
    const $ = (id) => this.dialog.querySelector(id);
    $('#shop-title').textContent = this.shop.name;
    $('#shop-blurb').textContent = this.shop.blurb;
    $('#shop-cash').textContent = `Cash: $${(this.ctx?.money ?? 0).toLocaleString('en-US')}`;
    const list = $('#shop-items');
    list.textContent = '';
    for (const itemId of this.shop.items) {
      const item = SHOP_ITEMS[itemId];
      if (!item) continue;
      const check = item.canBuy(this.ctx ?? {});
      const row = document.createElement('li');
      row.className = 'shop-item';
      const info = document.createElement('div');
      info.className = 'shop-info';
      const name = document.createElement('b');
      name.textContent = item.name;
      const desc = document.createElement('span');
      desc.textContent = item.desc;
      info.append(name, desc);
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'shop-buy';
      buy.textContent = check.ok
        ? `Buy — $${item.price.toLocaleString('en-US')}`
        : (check.reason || 'Unavailable');
      buy.disabled = !check.ok;
      buy.addEventListener('click', () => {
        const result = this.onBuy(item.id, this.shop);
        if (result?.ok) this.refresh();
        if (result?.message) this._flash(result.message);
      });
      row.append(info, buy);
      list.appendChild(row);
    }
  }

  /** One-line feedback under the list (bought / failed), fades on re-render. */
  _flash(message) {
    const cash = this.dialog.querySelector('#shop-cash');
    if (cash) cash.textContent = message;
  }
}
