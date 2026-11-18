// Keyboard + mouse input with per-frame edge detection. Systems ask
// isDown(code) for held keys and wasPressed(code) for the single frame a key
// goes down. main.js calls update() once per frame to age the edges.
export class Input {
  constructor(target) {
    this.target = target || document.body;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, justClicked: false };
    this._onKeyDown = (event) => {
      if (event.repeat) return;
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
      // Stop the page scrolling while driving or aiming.
      if (event.code === 'Space' || event.code.startsWith('Arrow')) {
        event.preventDefault();
      }
    };
    this._onKeyUp = (event) => {
      this.keys.delete(event.code);
    };
    this._onMouseMove = (event) => {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    };
    this._onMouseDown = (event) => {
      if (event.button !== 0) return;
      this.mouse.down = true;
      this.mouse.justClicked = true;
      this.pressed.add('MouseLeft');
      this.keys.add('MouseLeft');
    };
    this._onMouseUp = (event) => {
      if (event.button !== 0) return;
      this.mouse.down = false;
      this.keys.delete('MouseLeft');
    };
    this._onBlur = () => {
      this.keys.clear();
      this.mouse.down = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    this.target.addEventListener('mousemove', this._onMouseMove);
    this.target.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    // Losing the pointer mid-drag must not leave the mouse stuck down.
    window.addEventListener('pointercancel', this._onMouseUp);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key (or left mouse button) went down.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // True when any code in the list is held (for multi-key bindings).
  anyDown(codes) {
    return codes.some((code) => this.keys.has(code));
  }

  // True when any code in the list was pressed this frame.
  anyPressed(codes) {
    return codes.some((code) => this.pressed.has(code));
  }

  // Mark a press handled so another system does not act on the same edge.
  consume(code) {
    this.pressed.delete(code);
  }

  // Drop all held keys and edges (used when the game pauses or loses focus).
  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.mouse.down = false;
    this.mouse.justClicked = false;
  }

  // Called once per frame by the game loop, after all systems have updated.
  update() {
    this.pressed.clear();
    this.mouse.justClicked = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this.target.removeEventListener('mousemove', this._onMouseMove);
    this.target.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('pointercancel', this._onMouseUp);
  }
}
