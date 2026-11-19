// Chroma Auto shop: respray, repair, Nitro Kit, body armor and ammo.
// Every purchase returns { ok, message } so the dialog can show the result.
// The Nitro Kit needs REP tier 2 and sets state.unlocks.nitro once fitted.

// Full ammunition counts for every weapon after an Ammo Restock.
const AMMO_FULL = { pistol: 48, carbine: 120, shotgun: 24 };

// Catalog: id, display name, price, description, optional tier gate.
const CATALOG = [
  { id: 'respray', name: 'Respray', price: 100, desc: 'Fresh paint, clean slate. Clears your wanted level.' },
  { id: 'repair', name: 'Repair', price: 250, desc: 'Restore your current vehicle to full health.' },
  { id: 'nitro', name: 'Nitro Kit', price: 3000, desc: 'Install NOS. Hold Shift while driving for a boost.', requiresTier: 2 },
  { id: 'armor', name: 'Body Armor', price: 1800, desc: 'Full body armor, 100 points of protection.' },
  { id: 'ammo', name: 'Ammo Restock', price: 200, desc: 'Refill ammunition for every weapon.' },
];

export class Shop {
  constructor(game) {
    this.game = game;
  }

  // Catalog entries with live locked / affordable flags for the dialog.
  items() {
    const state = this.game.state;
    const tier = this.game.rep?.tier?.() ?? state.repTier ?? 1;
    return CATALOG.map((item) => {
      const owned = item.id === 'nitro' && state.unlocks.nitro === true;
      const locked = owned || (typeof item.requiresTier === 'number' && tier < item.requiresTier);
      const lockedReason = owned
        ? 'Already installed'
        : (locked ? `Requires REP tier ${item.requiresTier}` : null);
      return { ...item, locked, lockedReason, canAfford: state.money >= item.price };
    });
  }

  // True when the player owns enough cash for the item.
  canAfford(id) {
    const item = CATALOG.find((entry) => entry.id === id);
    return !!item && this.game.state.money >= item.price;
  }

  // Buy one item. Returns { ok, message }; nothing changes on failure.
  buy(id) {
    const state = this.game.state;
    const item = CATALOG.find((entry) => entry.id === id);
    if (!item) return { ok: false, message: 'Unknown item.' };
    if (id === 'nitro' && state.unlocks.nitro === true) {
      return { ok: false, message: 'Nitro is already installed.' };
    }
    if (typeof item.requiresTier === 'number') {
      const tier = this.game.rep?.tier?.() ?? state.repTier ?? 1;
      if (tier < item.requiresTier) {
        return { ok: false, message: `Requires REP tier ${item.requiresTier}.` };
      }
    }
    if (id === 'repair' && !state.playerInVehicle) {
      return { ok: false, message: 'No vehicle to repair.' };
    }
    if (id === 'armor' && state.armour >= 100) {
      return { ok: false, message: 'Armor is already full.' };
    }
    if (state.money < item.price) {
      return { ok: false, message: 'Not enough money.' };
    }

    state.money -= item.price;
    if (id === 'respray') {
      this.game.wanted?.clearWanted?.();
      state.wanted = 0;
      state.heat = 0;
      this.game.police?.clearPursuit?.();
    } else if (id === 'repair') {
      const vehicle = state.playerInVehicle;
      vehicle.health = 100;
      if (typeof vehicle.nos === 'number') vehicle.nos = 100;
    } else if (id === 'nitro') {
      state.unlocks.nitro = true;
    } else if (id === 'armor') {
      state.armour = 100;
    } else if (id === 'ammo') {
      Object.assign(state.ammo, AMMO_FULL);
    }

    this.game.audio?.sfx?.('money');
    this.game.hud?.showEventPopup?.(`${item.name} purchased`);
    this.game.events?.emit?.('shopPurchase', { id, price: item.price });
    return { ok: true, message: `${item.name} purchased.` };
  }
}
