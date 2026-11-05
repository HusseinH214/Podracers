import * as THREE from 'three';

// Low-poly podracers: engines out front linked by an energy binder, towing a
// small cockpit on tethers. Faces -Z. Each racer gets its own engine design,
// picked by name (unknown names fall back to the player's design).
const DESIGNS = {
  YOU: needle, // long twin needles with split intake vanes
  VEX: wedge, // tapered wedge engines with a square tail plate
  OLLA: drum, // fat ringed turbine drums with nose cones
  KRAGG: bulb, // one heavy bulbous engine with twin exhaust pipes
};

const metal = new THREE.MeshLambertMaterial({ color: 0x9a948c, flatShading: true });
const dark = new THREE.MeshLambertMaterial({ color: 0x2b2826, flatShading: true });
const glass = new THREE.MeshLambertMaterial({ color: 0x1d2a33, flatShading: true });
const glow = new THREE.MeshBasicMaterial({ color: 0xffb35c });
const flameMat = new THREE.MeshBasicMaterial({
  color: 0x7fd4ff,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

export function createPodModel(color, name) {
  const root = new THREE.Group(); // placed on the track frame
  const body = new THREE.Group(); // banks, yaws, wobbles
  root.add(body);

  const paint = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const binderMat = new THREE.MeshBasicMaterial({
    color: 0xff5ad1,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const build = DESIGNS[name] || needle;
  const flames = [];
  const binder = build(body, { paint, binderMat, flames });

  // Soft shadow blob on the ground (doesn't bank with the body).
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 5.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
  );
  shadow.position.z = -0.4;
  root.add(shadow);

  // Name tag for bots.
  let tag = null;
  if (name) {
    tag = makeTag(name, color);
    tag.position.set(0, 2.1, 0);
    root.add(tag);
  }

  return { root, body, flames, binder, shadow, tag };
}

// ---- Designs -------------------------------------------------------------------
// Each adds its engines, binder, cockpit and tethers to `body`, pushes its
// exhaust flames into `m.flames`, and returns the binder mesh.

function needle(body, m) {
  const accent = lambert(0x3a6db5);
  for (const side of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(side * 0.78, 0, -1.3);
    e.add(tube(0.26, 0.3, 2.6, 8, metal, 0));
    e.add(tube(0.32, 0.32, 0.9, 8, m.paint, -0.2));
    e.add(tube(0.33, 0.33, 0.12, 8, accent, 0.35));
    e.add(tube(0.3, 0.24, 0.3, 8, dark, 1.45));
    e.add(tube(0.3, 0.27, 0.25, 8, dark, -1.4, true));
    // Split intake: an X of vanes ahead of the engine, with a centre spike.
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const vane = box(0.04, 0.68, 0.9, m.paint, 0, 0, -1.75);
      vane.rotation.z = a;
      e.add(vane);
    }
    e.add(cone(0.1, 0.7, 6, dark, -2.0));
    e.add(box(0.05, 0.42, 0.7, m.paint, 0, 0.36, 0.7));
    exhaust(e, m, 0.2, 1.6);
    body.add(e);
  }
  cockpit(body, m, { z: 1.75, len: 1.1, rFront: 0.16, rBack: 0.36, segs: 6, wing: 1.1, accent });
  tethers(body, 0.78, 0.3, 1.22);
  return binderBar(body, m, 0.98, 0.1, -2.6);
}

function wedge(body, m) {
  const accent = lambert(0xe9e4d6);
  for (const side of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(side * 0.8, 0, -1.4);
    // Square-section spike tapering to a point at the front.
    const blade = tube(0.03, 0.36, 2.9, 4, accent, -0.15);
    blade.rotation.z = Math.PI / 4;
    e.add(blade);
    const collar = tube(0.3, 0.44, 0.7, 4, m.paint, 0.95);
    collar.rotation.z = Math.PI / 4;
    e.add(collar);
    e.add(box(0.7, 0.7, 0.06, accent, 0, 0, 1.33));
    e.add(box(0.04, 0.3, 1.7, m.paint, 0, 0.24, -0.1));
    e.add(tube(0.2, 0.24, 0.3, 8, dark, 1.5));
    exhaust(e, m, 0.18, 1.66);
    body.add(e);
  }
  cockpit(body, m, { z: 1.7, len: 1.25, rFront: 0.1, rBack: 0.36, segs: 4, wing: 0.8, accent });
  tethers(body, 0.8, 0.26, 1.08);
  return binderBar(body, m, 1.4, 0.05, -2.0);
}

function drum(body, m) {
  const accent = lambert(0x6f6a64);
  for (const side of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(side * 0.82, 0, -1.3);
    e.add(cone(0.22, 0.6, 10, metal, -1.75));
    e.add(tube(0.22, 0.5, 0.45, 10, metal, -1.3));
    e.add(tube(0.52, 0.52, 1.3, 10, metal, -0.4));
    e.add(tube(0.55, 0.55, 0.26, 10, m.paint, -0.8));
    e.add(tube(0.55, 0.55, 0.26, 10, m.paint, -0.05));
    e.add(tube(0.5, 0.42, 0.3, 10, dark, 0.4));
    e.add(tube(0.36, 0.3, 0.55, 10, accent, 0.82));
    e.add(tube(0.32, 0.34, 0.14, 10, dark, 1.15));
    exhaust(e, m, 0.26, 1.23);
    body.add(e);
  }
  cockpit(body, m, { z: 1.65, len: 1.0, rFront: 0.3, rBack: 0.36, segs: 6, wing: 1.0, accent });
  tethers(body, 0.82, -0.07, 1.15);
  return binderBar(body, m, 0.55, 0.15, -1.7);
}

function bulb(body, m) {
  const accent = lambert(0x4a3d30);
  const e = new THREE.Group();
  e.position.set(0, 0, -1.2);
  // Wide intake snout, then the egg-shaped engine body ringed with bands.
  e.add(tube(0.44, 0.48, 0.6, 10, accent, -1.7));
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.4, 10).rotateY(Math.PI), dark);
  mouth.position.z = -2.01;
  e.add(mouth);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m.paint);
  shell.scale.set(0.95, 0.72, 1.35);
  shell.position.z = -0.4;
  e.add(shell);
  for (const dz of [-0.55, 0.15]) {
    const f = Math.sqrt(1 - (dz / 1.35) ** 2);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 4, 12), dark);
    band.scale.set(0.97 * f, 0.74 * f, 1);
    band.position.z = -0.4 + dz;
    e.add(band);
  }
  for (const side of [-1, 1]) {
    e.add(box(0.5, 0.06, 0.6, accent, side * 1.0, -0.1, -0.3));
    // Twin exhaust pipes at slightly different heights.
    const y = side < 0 ? -0.14 : 0.1;
    const pipe = tube(0.15, 0.14, 1.5, 8, metal, 1.2);
    pipe.position.set(side * 0.38, y, 1.2);
    e.add(pipe);
    const p = new THREE.Group();
    p.position.set(side * 0.38, y, 0);
    exhaust(p, m, 0.12, 1.96);
    e.add(p);
  }
  body.add(e);
  cockpit(body, m, { z: 2.35, len: 1.2, rFront: 0.14, rBack: 0.3, segs: 6, wing: 0.9, accent });
  tethers(body, 0.38, 0.76, 1.75);
  return binderBar(body, m, 0.5, 0, 0.5);
}

// ---- Parts ---------------------------------------------------------------------

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// Cylinder along Z: rFront at the -Z end.
function tube(rFront, rBack, len, segs, mat, z, open = false) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(rFront, rBack, len, segs, 1, open).rotateX(-Math.PI / 2),
    mat,
  );
  mesh.position.z = z;
  return mesh;
}

// Cone pointing forward (-Z).
function cone(r, len, segs, mat, z) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, len, segs).rotateX(-Math.PI / 2), mat);
  mesh.position.z = z;
  return mesh;
}

function box(w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

// Glowing nozzle plus a flame cone trailing behind it.
function exhaust(group, m, r, z) {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 1.3, 10), glow);
  disc.position.z = z;
  group.add(disc);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(r, 1.6, 8, 1, true), flameMat);
  flame.rotation.x = Math.PI / 2;
  flame.geometry.translate(0, 0.8, 0); // wide end at the nozzle, tip trailing behind
  flame.position.z = z + 0.01;
  group.add(flame);
  m.flames.push(flame);
}

function binderBar(body, m, width, y, z) {
  const binder = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.12), m.binderMat);
  binder.position.set(0, y, z);
  body.add(binder);
  return binder;
}

function cockpit(body, m, { z, len, rFront, rBack, segs, wing, accent }) {
  const c = new THREE.Group();
  c.position.set(0, -0.05, z);
  const tub = tube(rFront, rBack, len, segs, m.paint, 0);
  if (segs === 4) tub.rotation.z = Math.PI / 4;
  c.add(tub);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.position.set(0, rBack * 0.35, len * 0.05);
  canopy.scale.set(1, 0.9, 1.5);
  c.add(canopy);
  c.add(box(wing, 0.06, 0.35, accent, 0, 0, len / 2 - 0.1));
  for (const side of [-1, 1]) c.add(box(0.05, 0.2, 0.3, accent, side * wing / 2, 0.06, len / 2 - 0.1));
  body.add(c);
}

// Cables from each engine's rear (x = ±engineX, z = engineZ) to the cockpit's nose.
function tethers(body, engineX, engineZ, cockpitZ) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-engineX, 0, engineZ),
    new THREE.Vector3(-0.2, 0, cockpitZ),
    new THREE.Vector3(engineX, 0, engineZ),
    new THREE.Vector3(0.2, 0, cockpitZ),
  ]);
  body.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x222222 })));
}

let blob;
function blobTexture() {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(40,20,10,0.55)');
  grad.addColorStop(1, 'rgba(40,20,10,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  return blob;
}

function makeTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 40;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(15,10,8,0.6)';
  g.beginPath();
  if (g.roundRect) g.roundRect(4, 4, 120, 32, 10);
  else g.rect(4, 4, 120, 32);
  g.fill();
  g.fillStyle = '#' + new THREE.Color(color).getHexString();
  g.font = 'bold 22px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 21);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  sprite.scale.set(2.4, 0.75, 1);
  return sprite;
}
