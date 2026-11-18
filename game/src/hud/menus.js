// Menus for Solmar City: title screen, pause menu, mission pass/fail cards,
// shop dialog, how-to-play, settings and the BUSTED screen. Every screen is
// a native <dialog> opened with showModal(), so the browser handles the top
// layer, outside inertness and focus for free; each show* still moves focus
// to its first button explicitly. The mission-pass Continue button resumes
// the game (it never leaves the player soft-locked).

export class Menus {
  constructor(game) {
    this.game = game;
    this._returnTo = null; // dialog id to reopen after settings/how-to closes
    this._shopItems = [];
    this._bindButtons();
    this._bindCancelGuards();
  }

  get state() {
    return this.game.state;
  }

  _dialog(id) {
    return document.getElementById(id);
  }

  _open(id, focusButtonId) {
    const dialog = this._dialog(id);
    if (!dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    const button = focusButtonId ? document.getElementById(focusButtonId) : dialog.querySelector('button');
    if (button) button.focus();
  }

  _close(id) {
    const dialog = this._dialog(id);
    if (dialog && dialog.open) dialog.close();
  }

  _closeAllDialogs() {
    for (const id of ['title-screen', 'pause-menu', 'mission-card', 'shop-dialog', 'map-screen', 'howto-screen', 'settings-screen', 'busted-screen']) {
      this._close(id);
    }
  }

  // Call a game-level hook when it exists (wired by main.js), otherwise
  // fall back to emitting the matching event on the bus.
  _callGame(method, eventName, data) {
    const fn = this.game[method];
    if (typeof fn === 'function') {
      fn.call(this.game, data);
      return true;
    }
    if (this.game.events && typeof this.game.events.emit === 'function') {
      this.game.events.emit(eventName, data);
      return true;
    }
    return false;
  }

  _resumeGame() {
    this.state.paused = false;
    if (this.game.audio && typeof this.game.audio.sfx === 'function') this.game.audio.sfx('click');
  }

  _bindButtons() {
    const on = (id, fn) => {
      const node = document.getElementById(id);
      if (node) node.addEventListener('click', fn);
    };
    on('btn-continue', () => this._onContinue());
    on('btn-new-game', () => this._onNewGame());
    on('btn-how-to-play', () => this.showHowToPlay());
    on('btn-settings', () => this.showSettings());
    on('btn-resume', () => this.hidePause());
    on('btn-pause-settings', () => this.showSettings());
    on('btn-pause-howto', () => this.showHowToPlay());
    on('btn-quit-title', () => this._onQuitToTitle());
    on('btn-mission-continue', () => this._onMissionContinue());
    on('btn-mission-retry', () => this._onMissionRetry());
    on('btn-mission-abandon', () => this._onMissionAbandon());
    on('btn-shop-close', () => this._onShopClose());
    on('btn-howto-close', () => this._onOverlayClose('howto-screen'));
    on('btn-settings-close', () => this._onOverlayClose('settings-screen'));
    on('btn-busted-continue', () => this._onBustedContinue());
    on('btn-map-close', () => {
      if (this.game.radar && typeof this.game.radar.closeMap === 'function') this.game.radar.closeMap();
      else this._close('map-screen');
    });
    this._bindSettingsControls();
  }

  _bindSettingsControls() {
    const northUp = document.getElementById('setting-northup');
    if (northUp) northUp.addEventListener('change', () => {
      this.state.settings.radarNorthUp = northUp.checked;
    });
    const showSpeed = document.getElementById('setting-showspeed');
    if (showSpeed) showSpeed.addEventListener('change', () => {
      this.state.settings.showSpeed = showSpeed.checked;
    });
    const muted = document.getElementById('setting-muted');
    if (muted) muted.addEventListener('change', () => {
      if (this.game.audio && typeof this.game.audio.setMuted === 'function') this.game.audio.setMuted(muted.checked);
      else this.state.muted = muted.checked;
    });
    const quality = document.getElementById('setting-quality');
    if (quality) quality.addEventListener('change', () => {
      this.state.settings.quality = quality.value;
    });
  }

  // Esc must never strand the player: the title screen, mission cards and
  // the BUSTED screen cannot be dismissed with Esc, while Esc on the pause
  // menu resumes the game. Every guard consumes the Escape edge so the
  // global key handler in main.js does not act on the same press (a guard
  // that closes a menu would otherwise be followed by the global handler
  // reopening the pause menu on the same frame).
  _bindCancelGuards() {
    const guard = (id, onCancel) => {
      const dialog = this._dialog(id);
      if (!dialog) return;
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (this.game.input && typeof this.game.input.consume === 'function') {
          this.game.input.consume('Escape');
        }
        if (onCancel) onCancel();
      });
    };
    guard('title-screen');
    guard('mission-card');
    guard('busted-screen');
    guard('pause-menu', () => this.hidePause());
    guard('shop-dialog', () => this._onShopClose());
    guard('map-screen', () => {
      if (this.game.radar && typeof this.game.radar.closeMap === 'function') {
        this.game.radar.closeMap();
      }
    });
    guard('howto-screen', () => this._onOverlayClose('howto-screen'));
    guard('settings-screen', () => this._onOverlayClose('settings-screen'));
  }

  _syncSettingsControls() {
    const s = this.state.settings;
    const northUp = document.getElementById('setting-northup');
    if (northUp) northUp.checked = Boolean(s.radarNorthUp);
    const showSpeed = document.getElementById('setting-showspeed');
    if (showSpeed) showSpeed.checked = s.showSpeed !== false;
    const muted = document.getElementById('setting-muted');
    if (muted) muted.checked = Boolean(this.state.muted);
    const quality = document.getElementById('setting-quality');
    if (quality) quality.value = s.quality || 'high';
  }

  _progressText() {
    const save = this.game.save;
    if (!save || typeof save.hasSave !== 'function' || !save.hasSave()) return '';
    let data = null;
    if (typeof save.peek === 'function') data = save.peek();
    if (!data) {
      // Fallback: read the save slot directly (Save exposes no peek()).
      try {
        const raw = window.localStorage.getItem('solmar-city-save-v3');
        data = raw ? JSON.parse(raw) : null;
      } catch (err) {
        data = null;
      }
    }
    if (!data) return '';
    // missionsPassed is stored as an array of ids — count it, don't print it.
    const story = Array.isArray(data.missionsPassed) ? data.missionsPassed.length : 0;
    const money = Math.floor(data.money || 0).toLocaleString('en-US');
    const completion = Math.floor(data.completion || 0);
    const day = data.day || 1;
    return 'Story ' + story + '/7 · $' + money + ' · ' + completion + '% · Day ' + day;
  }

  showTitle() {
    const progress = this._progressText();
    const progressEl = document.getElementById('title-progress');
    if (progressEl) progressEl.textContent = progress;
    const continueBtn = document.getElementById('btn-continue');
    if (continueBtn) continueBtn.classList.toggle('is-hidden', progress.length === 0);
    this.state.paused = true;
    this._open('title-screen', progress.length > 0 ? 'btn-continue' : 'btn-new-game');
  }

  showPause() {
    if (this.state.mission && this.state.mission.status === 'active') {
      this.state.paused = true;
    }
    this.state.paused = true;
    this._open('pause-menu', 'btn-resume');
  }

  hidePause() {
    this._close('pause-menu');
    this._resumeGame();
  }

  // Mission passed: payout + REP + unlock, with a Continue button that
  // resumes the game. (A Continue that only closes the card would leave
  // the game paused forever — the v1 soft-lock.)
  showMissionPassed(data) {
    const title = document.getElementById('mission-card-title');
    if (title) title.textContent = 'MISSION PASSED';
    const body = document.getElementById('mission-card-body');
    if (body) {
      const lines = [];
      if (data.missionName) lines.push(data.missionName);
      lines.push('+$' + Math.floor(data.payout || 0).toLocaleString('en-US'));
      lines.push('+' + (data.rep || 0) + ' REP');
      if (data.unlock) lines.push('UNLOCKED: ' + data.unlock);
      body.textContent = lines.join('  ·  ');
    }
    this._toggleMissionButtons(true);
    this.state.paused = true;
    this._open('mission-card', 'btn-mission-continue');
  }

  showMissionFailed(reason) {
    const title = document.getElementById('mission-card-title');
    if (title) title.textContent = 'MISSION FAILED';
    const body = document.getElementById('mission-card-body');
    if (body) body.textContent = reason || 'The job went sideways.';
    this._toggleMissionButtons(false);
    this.state.paused = true;
    this._open('mission-card', 'btn-mission-retry');
  }

  _toggleMissionButtons(passed) {
    const cont = document.getElementById('btn-mission-continue');
    const retry = document.getElementById('btn-mission-retry');
    const abandon = document.getElementById('btn-mission-abandon');
    if (cont) cont.classList.toggle('is-hidden', !passed);
    if (retry) retry.classList.toggle('is-hidden', passed);
    if (abandon) abandon.classList.toggle('is-hidden', passed);
  }

  showShop(items) {
    this._shopItems = items || [];
    const container = document.getElementById('shop-items');
    if (container) {
      container.innerHTML = '';
      for (const item of this._shopItems) {
        const row = document.createElement('div');
        row.className = 'shop-row';
        const name = document.createElement('span');
        name.className = 'shop-name';
        name.textContent = item.name + (item.locked ? ' · LOCKED' : '');
        const price = document.createElement('span');
        price.className = 'shop-price';
        price.textContent = '$' + Math.floor(item.price).toLocaleString('en-US');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-small';
        button.textContent = item.locked ? 'LOCKED' : 'BUY';
        button.disabled = Boolean(item.locked);
        button.addEventListener('click', () => this._onBuy(item.id));
        row.append(name, price, button);
        container.appendChild(row);
      }
      if (this._shopItems.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'Nothing for sale right now.';
        container.appendChild(empty);
      }
    }
    this.state.paused = true;
    this._open('shop-dialog', 'btn-shop-close');
    const firstBuy = container ? container.querySelector('button:not([disabled])') : null;
    if (firstBuy) firstBuy.focus();
  }

  showBusted() {
    this.state.paused = true;
    this._open('busted-screen', 'btn-busted-continue');
  }

  showHowToPlay() {
    if (this._dialog('pause-menu') && this._dialog('pause-menu').open) this._returnTo = 'pause-menu';
    else if (this._dialog('title-screen') && this._dialog('title-screen').open) this._returnTo = 'title-screen';
    else this._returnTo = null;
    this._open('howto-screen', 'btn-howto-close');
  }

  showSettings() {
    if (this._dialog('pause-menu') && this._dialog('pause-menu').open) this._returnTo = 'pause-menu';
    else if (this._dialog('title-screen') && this._dialog('title-screen').open) this._returnTo = 'title-screen';
    else this._returnTo = null;
    this._syncSettingsControls();
    this._open('settings-screen', 'btn-settings-close');
  }

  hideAll() {
    this._closeAllDialogs();
  }

  _onContinue() {
    this._close('title-screen');
    if (!this._callGame('continueGame', 'menu:continue')) {
      this._resumeGame();
    }
  }

  _onNewGame() {
    this._close('title-screen');
    if (this.game.save && typeof this.game.save.clearSave === 'function') this.game.save.clearSave();
    if (!this._callGame('startNewGame', 'menu:newGame')) {
      this._resumeGame();
    }
  }

  _onQuitToTitle() {
    this._closeAllDialogs();
    if (!this._callGame('quitToTitle', 'menu:quitToTitle')) {
      this.showTitle();
      return;
    }
    this.showTitle();
  }

  _onMissionContinue() {
    this._close('mission-card');
    this._resumeGame();
    if (this.game.events && typeof this.game.events.emit === 'function') {
      this.game.events.emit('missionCardClosed');
    }
  }

  _onMissionRetry() {
    this._close('mission-card');
    const missions = this.game.missions;
    if (missions && typeof missions.retryMission === 'function') {
      missions.retryMission();
    }
    this._resumeGame();
  }

  _onMissionAbandon() {
    this._close('mission-card');
    const missions = this.game.missions;
    if (missions && typeof missions.abandonMission === 'function') {
      missions.abandonMission();
    }
    this._resumeGame();
  }

  _onBuy(id) {
    const shop = this.game.shop;
    if (!shop || typeof shop.buy !== 'function') return;
    const result = shop.buy(id);
    const ok = result === true || (result && result.ok);
    const message = result && result.message ? result.message : (ok ? 'Purchased.' : 'Cannot buy that.');
    if (this.game.hud && typeof this.game.hud.showToast === 'function') {
      this.game.hud.showToast(message);
    }
    if (this.game.audio && typeof this.game.audio.sfx === 'function') {
      this.game.audio.sfx(ok ? 'buy' : 'denied');
    }
    // Refresh prices/affordability after the purchase.
    if (shop && typeof shop.items === 'function') {
      const container = document.getElementById('shop-items');
      if (container) {
        this._shopItems = shop.items();
        this.showShop(this._shopItems);
      }
    }
  }

  _onShopClose() {
    this._close('shop-dialog');
    this._resumeGame();
  }

  _onOverlayClose(id) {
    this._close(id);
    const target = this._returnTo;
    this._returnTo = null;
    if (target === 'pause-menu') {
      this._open('pause-menu', 'btn-resume');
    } else if (target === 'title-screen') {
      this._open('title-screen', 'btn-new-game');
    }
  }

  _onBustedContinue() {
    this._close('busted-screen');
    this._resumeGame();
  }
}
