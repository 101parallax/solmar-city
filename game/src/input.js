// Keyboard + mouse input for Solmar City. Edge detection is frame based:
// wasPressed(code) is true only on the frame the key went down, and update()
// — called at the END of the frame by main.js — clears the edge sets. Calling
// update() at the end (not the start) is what makes a press registered during
// a frame visible to every system that reads input that same frame.

const PREVENT_DEFAULT = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
]);

export class Input {
  constructor(target = window) {
    this.target = target;
    // Codes currently held down.
    this.keys = new Set();
    // Codes pressed since the last update() call.
    this.pressed = new Set();
    // Codes released since the last update() call.
    this.released = new Set();
    // Mouse state in CSS pixels relative to the viewport.
    this.mouse = { x: 0, y: 0, down: false, justClicked: false };
    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => this._keyUp(e);
    this._onMouseMove = (e) => this._mouseMove(e);
    this._onMouseDown = (e) => this._mouseDown(e);
    this._onMouseUp = () => this._mouseUp();
    this._onBlur = () => this._clearAll();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
  }

  _keyDown(e) {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    this.pressed.add(e.code);
  }

  _keyUp(e) {
    this.keys.delete(e.code);
    this.released.add(e.code);
  }

  _mouseMove(e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  }

  _mouseDown(e) {
    if (e.button !== 0) return;
    this.mouse.down = true;
    // Clicks on a menu must not fire the weapon: the mousedown on
    // New Game / Continue / Resume would otherwise register as a shot
    // on the first gameplay frame (the player spawned with 47/48 ammo).
    if (document.querySelector('dialog[open]')) return;
    this.mouse.justClicked = true;
  }

  _mouseUp() {
    this.mouse.down = false;
  }

  _clearAll() {
    this.keys.clear();
    this.pressed.clear();
    this.released.clear();
    this.mouse.down = false;
  }

  // True while the key is held.
  isDown(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // True only on the frame the key went up.
  wasReleased(code) {
    return this.released.has(code);
  }

  // Consume a press so no later reader sees it this frame.
  consume(code) {
    this.pressed.delete(code);
  }

  // Mouse position in normalized device coordinates (-1..1, y up), ready for
  // a raycaster (combat aims from the camera through this point).
  mouseNDC() {
    return {
      x: (this.mouse.x / window.innerWidth) * 2 - 1,
      y: -(this.mouse.y / window.innerHeight) * 2 + 1,
    };
  }

  // Called at the END of each frame: clears edge state for the next frame.
  update() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.justClicked = false;
  }

  // Remove all listeners (used when the game is torn down).
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
