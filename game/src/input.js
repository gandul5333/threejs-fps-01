// input.js — keyboard + mouse, pointer lock, and the shot-mode helpers.
// Owns no game logic: it only reports what the player's hands are doing.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const look = { x: 0, y: 0 };
  const state = { keys, firing: false, locked: false };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    if (!state.locked) return;
    look.x += event.movementX;
    look.y += event.movementY;
  }
  function onMouseDown(event) {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) state.firing = false;
    onLockChange(state.locked);
  }
  function onBlur() {
    keys.clear();
    state.firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);

  return {
    state,
    takeLook() {
      const out = { x: look.x, y: look.y };
      look.x = 0;
      look.y = 0;
      return out;
    },
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // One-shot key presses: true once per physical press, consumed by the caller.
    pressed(code) {
      if (keys.has(code)) {
        keys.delete(code);
        return true;
      }
      return false;
    },
  };
}
