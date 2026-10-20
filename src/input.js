// Hold-to-steer. Each finger is tracked separately; the left half of the
// screen steers left, the right half steers right, both at once cancel out.
// Arrow keys / A-D do the same on desktop. The boost button (or Space / W / Up)
// queues a boost press that the game loop picks up with takeBoost().
export class Input {
  constructor(zone, leftArrow, rightArrow, boostButton) {
    this.zone = zone;
    this.leftArrow = leftArrow;
    this.rightArrow = rightArrow;
    this.pointers = new Map(); // pointerId -> -1 | 1
    this.keys = { left: false, right: false };
    this.boostQueued = false;

    // pointerdown, not click, so the boost fires the instant it's touched.
    boostButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!boostButton.disabled) this.boostQueued = true;
    });
    boostButton.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.repeat || !(e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W')) return;
      e.preventDefault();
      this.boostQueued = true;
    });

    const sideOf = (e) => (e.clientX < window.innerWidth / 2 ? -1 : 1);
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      zone.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, sideOf(e));
      this.#paint();
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, sideOf(e)); // finger slid across the middle
      this.#paint();
    });
    const release = (e) => {
      this.pointers.delete(e.pointerId);
      this.#paint();
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      zone.addEventListener(ev, release);
    }
    // Cancelling pointerdown doesn't stop the browser's own long-press gesture
    // (haptic buzz, text selection, "Search / Find in page" bar), which runs off
    // touch events. Cancel touchstart too; the zone has no click handlers to lose.
    zone.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    // Belt and braces for the rest of the page: the game has no selectable text.
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('selectstart', (e) => e.preventDefault());

    const key = (down) => (e) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.keys.left = down;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.keys.right = down;
      else return;
      e.preventDefault();
      this.#paint();
    };
    window.addEventListener('keydown', key(true));
    window.addEventListener('keyup', key(false));
    window.addEventListener('blur', () => this.clear());
  }

  get left() {
    return this.keys.left || [...this.pointers.values()].includes(-1);
  }

  get right() {
    return this.keys.right || [...this.pointers.values()].includes(1);
  }

  /** -1 left, 0 none (or both), 1 right */
  get steer() {
    return (this.right ? 1 : 0) - (this.left ? 1 : 0);
  }

  /** True once per boost press. */
  takeBoost() {
    const queued = this.boostQueued;
    this.boostQueued = false;
    return queued;
  }

  clear() {
    this.boostQueued = false;
    this.pointers.clear();
    this.keys.left = this.keys.right = false;
    this.#paint();
  }

  #paint() {
    this.leftArrow.classList.toggle('active', this.left);
    this.rightArrow.classList.toggle('active', this.right);
  }
}
