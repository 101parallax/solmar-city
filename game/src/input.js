// Keyboard and mouse input for Solmar City. Held keys give a movement vector, a run flag
// and a brake flag every frame; one-shot presses (enter a car, pause, confirm, missions,
// map) are queued as bit flags and taken once by the loop, so a press between two frames
// is never lost and never counted twice. The mouse aims and shoots, and dragging orbits
// the camera. Touch is a minimal fallback: drag on the left half to move, tap the right
// half to shoot.
//
// Keys: WASD / arrows move and drive, Shift run, Space handbrake, F enter/steal a car,
// E interact, R reload, 1/2/3 switch weapon, M missions, Tab map, Esc/P pause, Enter
// confirm. Mouse: move to aim, hold left button to shoot, drag to orbit the camera.

export const ACTION_ENTER = 1; // F: enter / exit the nearest car
export const ACTION_INTERACT = 2; // E: talk, pick up, use
export const ACTION_RELOAD = 4; // R: reload the current weapon
export const ACTION_PAUSE = 8; // Esc / P: pause or resume
export const ACTION_CONFIRM = 16; // Enter: confirm on a menu
export const ACTION_MISSIONS = 32; // M: open the mission brief
export const ACTION_MAP = 64; // Tab: open the full map
export const ACTION_WEAPON_1 = 128; // 1: fists
export const ACTION_WEAPON_2 = 256; // 2: pistol
export const ACTION_WEAPON_3 = 512; // 3: rifle

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const BRAKE = new Set(['Space']);
const ENTER = new Set(['KeyF']);
const INTERACT = new Set(['KeyE']);
const RELOAD = new Set(['KeyR']);
const PAUSE = new Set(['Escape', 'KeyP']);
const CONFIRM = new Set(['Enter']);
const MISSIONS = new Set(['KeyM']);
const MAP = new Set(['Tab']);
const WEAPON_1 = new Set(['Digit1']);
const WEAPON_2 = new Set(['Digit2']);
const WEAPON_3 = new Set(['Digit3']);

export function createInput(target) {
  let forward = false;
  let back = false;
  let left = false;
  let right = false;
  let run = false;
  let brake = false;
  let mouseDown = false;
  let actions = 0;
  // Accumulated mouse movement since the last lookDelta() call; dragging orbits the
  // camera, and plain mouse movement aims while on foot.
  let lookX = 0;
  let lookY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let dragging = false;
  // Touch fallback: the left-half drag is a virtual stick, the right-half tap shoots.
  let touchId = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchX = 0;
  let touchY = 0;

  function press(flag, event) {
    if (!event.repeat) actions |= flag;
  }

  window.addEventListener('keydown', (event) => {
    if (FORWARD.has(event.code)) forward = true;
    else if (BACK.has(event.code)) back = true;
    else if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (RUN.has(event.code)) run = true;
    else if (BRAKE.has(event.code)) brake = true;
    else if (ENTER.has(event.code)) press(ACTION_ENTER, event);
    else if (INTERACT.has(event.code)) press(ACTION_INTERACT, event);
    else if (RELOAD.has(event.code)) press(ACTION_RELOAD, event);
    else if (PAUSE.has(event.code)) press(ACTION_PAUSE, event);
    else if (CONFIRM.has(event.code)) press(ACTION_CONFIRM, event);
    else if (MISSIONS.has(event.code)) press(ACTION_MISSIONS, event);
    else if (MAP.has(event.code)) press(ACTION_MAP, event);
    else if (WEAPON_1.has(event.code)) press(ACTION_WEAPON_1, event);
    else if (WEAPON_2.has(event.code)) press(ACTION_WEAPON_2, event);
    else if (WEAPON_3.has(event.code)) press(ACTION_WEAPON_3, event);
    else return;
    // Space scrolls the page and Tab moves focus; the game owns both keys.
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (FORWARD.has(event.code)) forward = false;
    else if (BACK.has(event.code)) back = false;
    else if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (RUN.has(event.code)) run = false;
    else if (BRAKE.has(event.code)) brake = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    forward = false;
    back = false;
    left = false;
    right = false;
    run = false;
    brake = false;
    mouseDown = false;
    dragging = false;
    touchId = null;
  });

  target.addEventListener('pointerdown', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (event.pointerType === 'touch') {
      if (event.clientX < window.innerWidth / 2 && touchId === null) {
        touchId = event.pointerId;
        touchStartX = event.clientX;
        touchStartY = event.clientY;
        touchX = 0;
        touchY = 0;
      } else {
        mouseDown = true;
      }
      return;
    }
    if (event.button === 0) mouseDown = true;
    dragging = true;
  });
  window.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (event.pointerType === 'touch' && event.pointerId === touchId) {
      touchX = (event.clientX - touchStartX) / 60;
      touchY = (event.clientY - touchStartY) / 60;
      return;
    }
    if (!dragging) return;
    lookX += event.movementX || 0;
    lookY += event.movementY || 0;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') {
      if (event.pointerId === touchId) {
        touchId = null;
        touchX = 0;
        touchY = 0;
      } else {
        mouseDown = false;
      }
      return;
    }
    if (event.button === 0) mouseDown = false;
    dragging = false;
  });
  // The context menu would steal the right button and pause the game feel; block it.
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /**
     * Movement intent for this frame: x is strafe (-1 left, 1 right), y is forward
     * (-1 back, 1 forward). On foot this steers the player; in a car y is the
     * throttle and x is the steering.
     */
    move() {
      const x = (right ? 1 : 0) - (left ? 1 : 0) + touchX;
      const y = (forward ? 1 : 0) - (back ? 1 : 0) - touchY;
      const len = Math.hypot(x, y);
      if (len <= 1) return { x, y };
      return { x: x / len, y: y / len };
    },
    /** Shift held: sprint on foot, no effect in a car. */
    run() {
      return run;
    },
    /** Space held: handbrake in a car, brake while reversing. */
    brake() {
      return brake;
    },
    /** Left mouse button (or right-half touch) held: shoot / punch. */
    shooting() {
      return mouseDown;
    },
    /** Mouse movement since the last call, in pixels; consumed, so call once per frame. */
    lookDelta() {
      const delta = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return delta;
    },
    /** Last known pointer position in client pixels (for menus and aiming). */
    pointer() {
      return { x: pointerX, y: pointerY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
