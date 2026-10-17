import * as THREE from 'three';

/** Motion streaks that live in camera space and rush past at speed. */
export class SpeedStreaks {
  constructor(camera, count = 70) {
    this.count = count;
    const positions = new Float32Array(count * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.mat = new THREE.LineBasicMaterial({
      color: 0xfff4e0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    camera.add(this.lines);
    this.items = Array.from({ length: count }, () => this.#spawn({}, true));
  }

  #spawn(item, anywhere) {
    const a = Math.random() * Math.PI * 2;
    const r = 2.5 + Math.random() * 6;
    item.x = Math.cos(a) * r;
    item.y = Math.sin(a) * r * 0.6;
    item.z = anywhere ? -Math.random() * 70 : -70;
    return item;
  }

  update(dt, speedNorm) {
    const opacity = Math.max(0, (speedNorm - 0.55) / 0.45) * 0.45;
    this.mat.opacity = opacity;
    this.lines.visible = opacity > 0.01;
    if (!this.lines.visible) return;
    const pos = this.geo.attributes.position.array;
    const v = 60 * speedNorm * 1.6;
    const len = 1 + speedNorm * 5;
    this.items.forEach((it, i) => {
      it.z += v * dt;
      if (it.z > 0) this.#spawn(it, false);
      const k = i * 6;
      pos[k] = it.x;
      pos[k + 1] = it.y;
      pos[k + 2] = it.z;
      pos[k + 3] = it.x;
      pos[k + 4] = it.y;
      pos[k + 5] = it.z - len;
    });
    this.geo.attributes.position.needsUpdate = true;
  }
}

/** Pooled point particles for sparks and rock debris. */
export class Particles {
  constructor(scene, max = 240) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo = geo;
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.life.fill(0);
    this.positions.fill(-9999);
  }

  burst(origin, count, color, speed, forward) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      this.positions.set([origin.x, origin.y, origin.z], i * 3);
      this.vel.set(
        [
          (Math.random() - 0.5) * speed + forward.x * 0.6,
          Math.random() * speed * 0.7,
          (Math.random() - 0.5) * speed + forward.z * 0.6,
        ],
        i * 3,
      );
      const shade = 0.7 + Math.random() * 0.3;
      this.colors.set([c.r * shade, c.g * shade, c.b * shade], i * 3);
      this.life[i] = 0.5 + Math.random() * 0.5;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.positions[k + 1] = -9999;
        continue;
      }
      this.vel[k + 1] -= 20 * dt;
      this.positions[k] += this.vel[k] * dt;
      this.positions[k + 1] += this.vel[k + 1] * dt;
      this.positions[k + 2] += this.vel[k + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.positions.fill(-9999);
    this.geo.attributes.position.needsUpdate = true;
  }
}
