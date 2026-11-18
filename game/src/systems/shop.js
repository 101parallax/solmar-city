// Shop: the Chroma Auto storefront. Five items, one gated behind REP tier 2.
// buy() validates (lock, funds, preconditions) before touching money, and
// always returns a { ok, message } result so the dialog can show feedback.

export class Shop {
  static ITEMS = [
    { id: 'respray', name: 'Respray', price: 100, desc: 'Fresh paint job. Clears your wanted level.', requiresTier: 1 },
    { id: 'repair', name: 'Repair', price: 250, desc: 'Fix your current vehicle back to full health.', requiresTier: 1 },
    { id: 'ammo', name: 'Ammo', price: 200, desc: 'Refill all ammunition to full.', requiresTier: 1 },
    { id: 'armor', name: 'Armor', price: 1800, desc: 'Full body armor (100).', requiresTier: 1 },
    { id: 'nitro', name: 'Nitro', price: 3000, desc: 'Nitrous boost for every vehicle. Hold Shift to burn it.', requiresTier: 2 },
  ];

  static MAX_AMMO = { pistol: 48, carbine: 120, shotgun: 24 };

  constructor(game) {
    this.game = game;
    this.state = game.state;
  }

  item(id) {
    return Shop.ITEMS.find((entry) => entry.id === id) || null;
  }

  items() {
    const tier = this.game.rep ? this.game.rep.tier() : 1;
    return Shop.ITEMS.map((entry) => ({
      id: entry.id,
      name: entry.name,
      price: entry.price,
      desc: entry.desc,
      requiresTier: entry.requiresTier,
      locked: tier < entry.requiresTier,
      affordable: this.canAfford(entry.id),
    }));
  }

  canAfford(id) {
    const entry = this.item(id);
    return entry ? this.state.money >= entry.price : false;
  }

  buy(id) {
    const entry = this.item(id);
    if (!entry) return { ok: false, message: 'Unknown item.' };
    const tier = this.game.rep ? this.game.rep.tier() : 1;
    if (tier < entry.requiresTier) {
      return { ok: false, message: `Requires REP tier ${entry.requiresTier} (${this.game.rep ? this.game.rep.tierName() : 'UNKNOWN'} is not enough).` };
    }
    if (!this.canAfford(id)) return { ok: false, message: 'Not enough money.' };
    if (id === 'repair' && !this.state.playerInVehicle) {
      return { ok: false, message: 'Get in a vehicle first.' };
    }
    if (id === 'repair' && this.state.playerInVehicle.health >= 100) {
      return { ok: false, message: 'This vehicle is already in perfect shape.' };
    }
    if (id === 'nitro' && this.state.unlocks.nitro) {
      return { ok: false, message: 'Nitro is already installed.' };
    }
    if (id === 'armor' && this.state.armour >= 100) {
      return { ok: false, message: 'Armor is already full.' };
    }

    this.state.money -= entry.price;
    this._apply(entry.id);
    this._sfx('money');
    if (this.game.hud) this.game.hud.showEventPopup(`${entry.name} purchased — $${entry.price}`);
    if (this.game.events) this.game.events.emit('shopPurchase', { id: entry.id, price: entry.price });
    return { ok: true, message: `${entry.name} purchased.` };
  }

  _apply(id) {
    if (id === 'respray') {
      if (this.game.wanted) this.game.wanted.clearWanted();
      if (this.game.police) this.game.police.clearPursuit();
    } else if (id === 'repair') {
      const vehicle = this.state.playerInVehicle;
      if (vehicle) vehicle.health = vehicle.maxHealth || 100;
    } else if (id === 'ammo') {
      this.state.ammo = { ...Shop.MAX_AMMO };
    } else if (id === 'armor') {
      this.state.armour = 100;
    } else if (id === 'nitro') {
      this.state.unlocks.nitro = true;
    }
  }

  _sfx(name) {
    try {
      if (this.game.audio) this.game.audio.sfx(name);
    } catch (err) {
      // Audio is cosmetic; a missing sound must never break a purchase.
    }
  }
}
