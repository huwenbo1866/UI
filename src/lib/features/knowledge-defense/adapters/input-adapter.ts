import type { Vec2 } from '../core/types';
import { normalizeVector } from '../core/utils';

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  touchActive: boolean;
  touchDir: Vec2;
}

export function createInputState(): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    touchActive: false,
    touchDir: { x: 0, y: 0 }
  };
}

export function attachKeyboard(input: InputState) {
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === 'w') input.up = true;
    if (key === 's') input.down = true;
    if (key === 'a') input.left = true;
    if (key === 'd') input.right = true;
  };

  const onKeyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === 'w') input.up = false;
    if (key === 's') input.down = false;
    if (key === 'a') input.left = false;
    if (key === 'd') input.right = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}

export function updateTouchDirectionFromClientPoint(
  input: InputState,
  surfaceRect: DOMRect,
  playerX: number,
  playerY: number,
  clientX: number,
  clientY: number
) {
  const localX = clientX - surfaceRect.left;
  const localY = clientY - surfaceRect.top;
  input.touchDir = normalizeVector(localX - playerX, localY - playerY);
  input.touchActive = true;
}

export function clearTouchDirection(input: InputState) {
  input.touchActive = false;
  input.touchDir = { x: 0, y: 0 };
}
