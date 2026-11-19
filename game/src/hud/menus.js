// Menu controller: every full-screen overlay in Solmar City is a native
// <dialog> opened with showModal(), so the browser owns focus containment,
// top-layer rendering, and Escape handling. Each show* method focuses its
// first button. The Escape guard keeps the title, mission-result, and
// busted screens from being dismissed without an explicit choice, while
// Escape on the pause menu resumes the game.

const SAVE_KEY = 'solmar-city-save-v4';

export class Menus {
  constructor(game) {
    this.game = game;
    this._returnTo = null;
    this._dialogs = {};
    const dialogIds = [
      'title-screen', 'pause-menu', 'mission-card', 'shop-dialog',
      'map-screen', 'howto-screen', 'settings-screen', 'busted-screen',
    ];
    for (const id of dialogIds) this._dialogs[id] = document.getElementById(id);
    this._wireButtons();
    this._wireEscapeGuards();
    this._wireSettings();
    this._installClosedByFallback();
  }

  _on(id, handler) {
    const node = document.getElementById(id);
    if (node) node.addEventListener('click', handler);
  }

  _wireButtons() {
    this._on('btn-continue', () => this._continueGame());
    this._on('btn-new-game', () => this._newGame());
    this._on('btn-how-to-play', () => this.showHowToPlay('title'));
    this._on('btn-settings', () => this.showSettings('title'));
    this._on('btn-resume', () => this.hidePause());
    this._on('btn-pause-settings', () => this.showSettings('pause'));
    this._on('btn-pause-howto', () => this.showHowToPlay('pause'));
    this._on('btn-quit-title', () => this._quitToTitle());
    this._on('btn-mission-continue', () => this._missionContinue());
    this._on('btn-mission-retry', () => this._missionRetry());
    this._on('btn-mission-abandon', () => this._missionAbandon());
    this._on('btn-shop-close', () => this._closeDialog('shop-dialog'));
    this._on('btn-howto-close', () => this._closeDialog('howto-screen'));
    this._on('btn-settings-close', () => this._closeDialog('settings-screen'));
    this._on('btn-busted-continue', () => this._bustedContinue());
  }

  // Escape guard: the title screen, mission result card, and busted screen
  // cannot be dismissed with Escape (there is no safe state behind them);
  // Escape on pause resumes the game instead of leaving it paused.
  _wireEscapeGuards() {
    const block = (id) => {
      const dialog = this._dialogs[id];
      if (dialog) dialog.addEventListener('cancel', (event) => event.preventDefault());
    };
    block('title-screen');
    block('mission-card');
    block('busted-screen');
    const pause = this._dialogs['pause-menu'];
    if (pause) {
      pause.addEventListener('cancel', (event) => {
        event.preventDefault();
        this.hidePause();
      });
    }
    // Returning from a sub-screen (settings / how-to) reopens its parent.
    for (const id of ['settings-screen', 'howto-screen']) {
      const dialog = this._dialogs[id];
      if (!dialog) continue;
      dialog.addEventListener('close', () => {
        const target = this._returnTo;
        this._returnTo = null;
        if (target === 'pause') this.showPause();
        else if (target === 'title') this.showTitle();
      });
    }
  }

  _wireSettings() {
    const northup = document.getElementById('setting-northup');
    const showspeed = document.getElementById('setting-showspeed');
    const muted = document.getElementById('setting-muted');
    const quality = document.getElementById('setting-quality');
    if (northup) northup.addEventListener('change', () => { this.game.state.settings.radarNorthUp = northup.checked; });
    if (showspeed) showspeed.addEventListener('change', () => { this.game.state.settings.showSpeed = showspeed.checked; });
    if (muted) {
      muted.addEventListener('change', () => {
        if (this.game.audio) this.game.audio.setMuted(muted.checked);
        else this.game.state.muted = muted.checked;
      });
    }
    if (quality) quality.addEventListener('change', () => { this.game.state.settings.quality = quality.value; });
  }

  // Light-dismiss fallback for browsers without closedby support: close a
  // light-dismiss dialog only when both press and release land outside it.
  _installClosedByFallback() {
    if ('closedBy' in HTMLDialogElement.prototype) return;
    const outside = (event, dialog) => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (event) => { pressedOutside = outside(event, dialog); });
      dialog.addEventListener('pointerup', (event) => {
        if (pressedOutside && outside(event, dialog)) dialog.close();
      });
    }
  }

  _open(id, focusId) {
    const dialog = this._dialogs[id];
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const target = focusId ? document.getElementById(focusId) : dialog.querySelector('button');
    if (target) target.focus();
  }

  _closeDialog(id) {
    const dialog = this._dialogs[id];
    if (dialog && dialog.open) dialog.close();
  }

  hideAll() {
    // Clear the return target FIRST: dialog close events fire synchronously
    // and would otherwise reopen the parent screen we are leaving.
    this._returnTo = null;
    for (const id of Object.keys(this._dialogs)) this._closeDialog(id);
  }

  _progressText() {
    const save = this.game.save;
    if (save && typeof save.summary === 'function') {
      try {
        const summary = save.summary();
        if (summary) return this._formatProgress(summary);
      } catch (err) {
        // Fall through to the raw localStorage read.
      }
    }
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return this._formatProgress(JSON.parse(raw));
    } catch (err) {
      return null;
    }
  }

  _formatProgress(data) {
    const passed = data.missionsPassed != null
      ? data.missionsPassed
      : (data.stats && data.stats.missionsPassed) || 0;
    const money = data.money != null ? Math.floor(data.money) : 0;
    const completion = data.completion != null ? Math.floor(data.completion) : 0;
    const day = data.day != null ? data.day : 1;
    return 'Story ' + passed + '/7 · $' + money.toLocaleString('en-US') + ' · ' + completion + '% · Day ' + day;
  }

  _hasSave() {
    if (this.game.save && typeof this.game.save.hasSave === 'function') {
      return this.game.save.hasSave();
    }
    try {
      return window.localStorage.getItem(SAVE_KEY) !== null;
    } catch (err) {
      return false;
    }
  }

  showTitle() {
    const progress = this._progressText();
    const progressEl = document.getElementById('title-progress');
    const continueBtn = document.getElementById('btn-continue');
    if (progressEl) progressEl.textContent = progress || 'No save yet — start a new story.';
    if (continueBtn) continueBtn.hidden = !this._hasSave();
    this._open('title-screen', continueBtn && !continueBtn.hidden ? 'btn-continue' : 'btn-new-game');
  }

  showPause() {
    this.game.state.paused = true;
    this._open('pause-menu', 'btn-resume');
  }

  hidePause() {
    this._closeDialog('pause-menu');
    this.game.state.paused = false;
  }

  showMissionPassed(data) {
    const info = data || {};
    this.game.state.paused = true;
    const title = document.getElementById('mission-card-title');
    const body = document.getElementById('mission-card-body');
    if (title) title.textContent = 'MISSION PASSED';
    if (body) {
      const lines = [];
      if (info.name) lines.push(info.name);
      if (info.payout != null) lines.push('Payout: $' + Math.floor(info.payout).toLocaleString('en-US'));
      if (info.rep != null) lines.push('REP: +' + info.rep);
      if (info.unlock) lines.push('Unlocked: ' + info.unlock);
      body.textContent = lines.join('  ·  ');
    }
    const retry = document.getElementById('btn-mission-retry');
    const abandon = document.getElementById('btn-mission-abandon');
    const cont = document.getElementById('btn-mission-continue');
    if (retry) retry.hidden = true;
    if (abandon) abandon.hidden = true;
    if (cont) cont.hidden = false;
    this._open('mission-card', 'btn-mission-continue');
  }

  showMissionFailed(reason) {
    this.game.state.paused = true;
    const title = document.getElementById('mission-card-title');
    const body = document.getElementById('mission-card-body');
    if (title) title.textContent = 'MISSION FAILED';
    if (body) body.textContent = reason || 'The job went wrong. Retry it or walk away.';
    const retry = document.getElementById('btn-mission-retry');
    const abandon = document.getElementById('btn-mission-abandon');
    const cont = document.getElementById('btn-mission-continue');
    if (retry) retry.hidden = false;
    if (abandon) abandon.hidden = false;
    if (cont) cont.hidden = true;
    this._open('mission-card', 'btn-mission-retry');
  }

  showShop(items) {
    const list = items || (this.game.shop && typeof this.game.shop.items === 'function'
      ? this.game.shop.items()
      : []);
    const container = document.getElementById('shop-items');
    if (container) {
      while (container.firstChild) container.removeChild(container.firstChild);
      for (const item of list) {
        const row = document.createElement('div');
        row.className = 'shop-row';
        const label = document.createElement('span');
        label.className = 'shop-label';
        label.textContent = item.name + ' — $' + Math.floor(item.price).toLocaleString('en-US')
          + (item.locked ? ' (locked: ' + (item.lockReason || 'REP tier') + ')' : '');
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'btn btn-small';
        buy.textContent = 'Buy';
        buy.disabled = Boolean(item.locked) || (this.game.shop && !this.game.shop.canAfford(item.id));
        buy.addEventListener('click', () => {
          const result = this.game.shop ? this.game.shop.buy(item.id) : null;
          // shop.buy returns { ok, message }: show its message verbatim so
          // a failed purchase never reads as "Purchased".
          const message = result && typeof result === 'object'
            ? (result.message || (result.ok ? 'Purchased ' + item.name + '.' : 'Cannot buy ' + item.name + '.'))
            : (result ? 'Purchased ' + item.name + '.' : 'Cannot buy ' + item.name + '.');
          if (this.game.hud) this.game.hud.showToast(message);
          this.showShop();
        });
        row.appendChild(label);
        row.appendChild(buy);
        container.appendChild(row);
      }
      if (list.length === 0) container.textContent = 'Nothing for sale right now.';
    }
    this._open('shop-dialog', 'btn-shop-close');
  }

  showBusted() {
    this.game.state.paused = true;
    this._open('busted-screen', 'btn-busted-continue');
  }

  showHowToPlay(from) {
    this._returnTo = from || null;
    if (from === 'pause') this._closeDialog('pause-menu');
    else if (from === 'title') this._closeDialog('title-screen');
    this._open('howto-screen', 'btn-howto-close');
  }

  showSettings(from) {
    this._returnTo = from || null;
    const settings = this.game.state.settings || {};
    const northup = document.getElementById('setting-northup');
    const showspeed = document.getElementById('setting-showspeed');
    const muted = document.getElementById('setting-muted');
    const quality = document.getElementById('setting-quality');
    if (northup) northup.checked = Boolean(settings.radarNorthUp);
    if (showspeed) showspeed.checked = settings.showSpeed !== false;
    if (muted) muted.checked = Boolean(this.game.state.muted);
    if (quality) quality.value = settings.quality || 'high';
    if (from === 'pause') this._closeDialog('pause-menu');
    else if (from === 'title') this._closeDialog('title-screen');
    this._open('settings-screen', 'btn-settings-close');
  }

  _newGame() {
    this.hideAll();
    this.game.state.paused = false;
    if (typeof this.game.startNewGame === 'function') this.game.startNewGame();
    else if (this.game.events) this.game.events.emit('menu:newGame');
  }

  _continueGame() {
    this.hideAll();
    this.game.state.paused = false;
    if (typeof this.game.continueGame === 'function') this.game.continueGame();
    else if (this.game.events) this.game.events.emit('menu:continue');
  }

  _quitToTitle() {
    this.hideAll();
    if (typeof this.game.quitToTitle === 'function') this.game.quitToTitle();
    else if (this.game.events) this.game.events.emit('menu:quitToTitle');
    this.game.state.paused = true;
    this.showTitle();
  }

  // Continue on the passed card MUST resume the game; leaving the game
  // paused here would soft-lock the player behind a closed dialog.
  _missionContinue() {
    this.hideAll();
    this.game.state.paused = false;
    if (this.game.events) this.game.events.emit('menu:missionContinue');
  }

  _missionRetry() {
    this.hideAll();
    this.game.state.paused = false;
    if (this.game.missions && typeof this.game.missions.retryMission === 'function') {
      this.game.missions.retryMission();
    } else if (this.game.events) {
      this.game.events.emit('menu:missionRetry');
    }
  }

  _missionAbandon() {
    this.hideAll();
    this.game.state.paused = false;
    if (this.game.missions && typeof this.game.missions.abandonMission === 'function') {
      this.game.missions.abandonMission();
    } else if (this.game.events) {
      this.game.events.emit('menu:missionAbandon');
    }
  }

  _bustedContinue() {
    this.hideAll();
    this.game.state.paused = false;
    if (this.game.events) this.game.events.emit('menu:bustedContinue');
  }
}
