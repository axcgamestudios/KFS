/** Keyboard + mouse input with pointer lock for third-person play. */

export type InputAction =
  | 'forward' | 'back' | 'left' | 'right'
  | 'jump' | 'sprint' | 'interact' | 'lantern'
  | 'inventory' | 'map' | 'journal' | 'skills';

export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  pointerLocked = false;
  sensitivity = 1.0;
  invertY = false;
  leftDown = false;
  leftPressed = false;

  private onKeydown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.justPressed.add(e.code);
    // Prevent browser scroll / search on game keys while locked
    if (this.pointerLocked && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
  };

  private onKeyup = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.pointerLocked) return;
    this.wheelDelta += Math.sign(e.deltaY);
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement !== null;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0 && this.pointerLocked) {
      this.leftDown = true;
      this.leftPressed = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.leftDown = false;
  };

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeydown, { passive: false });
    window.addEventListener('keyup', this.onKeyup);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  requestLock(): void {
    if (!this.pointerLocked) {
      this.canvas.requestPointerLock?.();
    }
  }

  releaseLock(): void {
    if (this.pointerLocked) document.exitPointerLock?.();
  }

  isDown(action: InputAction): boolean {
    switch (action) {
      case 'forward': return this.keys.has('KeyW') || this.keys.has('ArrowUp');
      case 'back': return this.keys.has('KeyS') || this.keys.has('ArrowDown');
      case 'left': return this.keys.has('KeyA') || this.keys.has('ArrowLeft');
      case 'right': return this.keys.has('KeyD') || this.keys.has('ArrowRight');
      case 'jump': return this.keys.has('Space');
      case 'sprint': return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      case 'interact': return this.keys.has('KeyE');
      case 'lantern': return this.keys.has('KeyF');
      default: return false;
    }
  }

  /** True if any of the given key codes was pressed this frame (public). */
  anyPressed(...codes: string[]): boolean {
    return codes.some((c) => this.justPressed.has(c));
  }

  /** True only on the frame the key went down. Call endFrame() each frame. */
  pressed(action: InputAction): boolean {
    switch (action) {
      case 'interact': return this.justPressed.has('KeyE');
      case 'lantern': return this.justPressed.has('KeyF');
      case 'jump': return this.justPressed.has('Space');
      case 'inventory': return this.justPressed.has('Tab');
      case 'map': return this.justPressed.has('KeyM');
      case 'journal': return this.justPressed.has('KeyJ');
      case 'skills': return this.justPressed.has('KeyK');
      default: return false;
    }
  }

  /** True if any of the menu toggle keys was pressed this frame. */
  menuTogglePressed(): 'inventory' | 'map' | 'journal' | 'skills' | null {
    if (this.justPressed.has('Tab')) return 'inventory';
    if (this.justPressed.has('KeyM')) return 'map';
    if (this.justPressed.has('KeyJ')) return 'journal';
    if (this.justPressed.has('KeyK')) return 'skills';
    return null;
  }

  endFrame(): void {
    this.justPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.leftPressed = false;
  }

  clearAll(): void {
    this.keys.clear();
    this.justPressed.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('keyup', this.onKeyup);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
  }
}
