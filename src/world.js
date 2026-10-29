import * as THREE from 'three';
import { makeRng } from './rng.js';
import { POD, SHORTCUT } from './config.js';

const TMP = new THREE.Vector3();
const TAN = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const UPV = new THREE.Vector3();
const BACK = new THREE.Vector3();
const MAT4 = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3();
const COLOR = new THREE.Color();

export const PALETTE = {
  skyTop: 0x5a8fc4,
  skyHorizon: 0xf3cf9f,
  fog: 0xe9c094,
  sand: 0xd6a066,
  sandDark: 0xb87c48,
  rockA: 0xb5603a,
  rockB: 0xd9905a,
  rockC: 0x8c4630,
};

/** Track-aligned orientation (x = right, y = up, z = backwards) at distance s. */
export function trackBasis(track, s, out = MAT4) {
  track.tangentAt(s, TAN);
  track.rightAt(s, RIGHT);
  BACK.copy(TAN).negate();
  UPV.crossVectors(BACK, RIGHT).normalize();
  return out.makeBasis(RIGHT, UPV, BACK);
}

export function buildWorld(scene, track) {
  scene.background = new THREE.Color(PALETTE.fog);
  scene.fog = new THREE.Fog(PALETTE.fog, 140, 620);

  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x8a5a3a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(-0.5, 1, 0.35).multiplyScalar(100);
  scene.add(sun);

  const sky = buildSky();
  scene.add(sky);

  scene.add(buildCanyon(track));
  scene.add(buildMesas(track));
  const obstacles = buildObstacles(track);
  scene.add(obstacles);
  scene.add(buildLine(track, 0, 'start'));
  scene.add(buildLine(track, track.finishS, 'finish'));
  const gantry = buildGantry(track);
  scene.add(gantry.group);
  scene.add(buildFinishArch(track));
  const pickups = track.pickups.map((p) => buildBoostPickup(track, p));
  for (const pickup of pickups) scene.add(pickup.group);
  scene.add(buildShortcut(track));

  return { sky, gantry, pickups };
}

// ---- shortcut ----------------------------------------------------------------

export const SHORTCUT_COLOR = 0xb6ff5c;

/** Rock ridge between canyon and tunnel, plus glowing chevrons that point into the mouth. */
function buildShortcut(track) {
  const group = new THREE.Group();
  const sc = track.shortcut;
  if (!sc) return group;
  const { ridge } = SHORTCUT;

  // Ridge: an extruded cross-section that tapers to a prow at both ends.
  const step = 3;
  const rows = Math.ceil((sc.sOut - sc.sNose) / step) + 1;
  const cols = 4;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const rockA = new THREE.Color(PALETTE.rockA);
  const rockB = new THREE.Color(PALETTE.rockB);
  for (let j = 0; j < rows; j++) {
    const s = Math.min(sc.sOut, sc.sNose + j * step);
    const taper = Math.min(1, (s - sc.sNose) / 6, (sc.sOut - s) / 6);
    const mid = track.halfWidthAt(s) + ridge / 2;
    const half = (ridge / 2) * (0.25 + 0.75 * taper);
    const h = (12 + noise1(s, 4) * 2.5) * (0.45 + 0.55 * taper);
    const section = [
      [mid - half, 0],
      [mid - half * 0.55, h],
      [mid + half * 0.55, h],
      [mid + half, 0],
    ];
    section.forEach(([u, y], c) => {
      track.pointAt(s, sc.side * u, TMP, y);
      const k = (j * cols + c) * 3;
      positions.set([TMP.x, TMP.y, TMP.z], k);
      COLOR.copy(rockA).lerp(rockB, Math.sin(y * 0.55 + noise1(s, 9) * 2) * 0.5 + 0.5);
      colors.set([COLOR.r, COLOR.g, COLOR.b], k);
    });
  }
  const index = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = j * cols + c;
      index.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  // End caps.
  for (const j of [0, rows - 1]) {
    const a = j * cols;
    index.push(a, a + 1, a + 2, a, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  group.add(
    new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })),
  );

  // Glowing cap on the prow so the split reads from a distance.
  const cap = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6, 0),
    new THREE.MeshBasicMaterial({ color: SHORTCUT_COLOR, fog: false }),
  );
  track.pointAt(sc.sNose + 1, sc.side * (track.halfWidthAt(sc.sNose) + ridge / 2), cap.position, 7);
  group.add(cap);

  // Floor chevrons leading from the canyon wall into the mouth.
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, -0.6);
  shape.lineTo(0, 0.6);
  shape.lineTo(1.1, -0.6);
  shape.lineTo(1.1, -0.1);
  shape.lineTo(0, 1.1);
  shape.lineTo(-1.1, -0.1);
  shape.closePath();
  const chevGeo = new THREE.ShapeGeometry(shape);
  chevGeo.rotateX(-Math.PI / 2);
  const chevMat = new THREE.MeshBasicMaterial({ color: SHORTCUT_COLOR, transparent: true, opacity: 0.85, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const s = sc.sIn - 18 + i * 8;
    const u = track.halfWidthAt(s) - 2.5 + i * 1.2;
    const chev = new THREE.Mesh(chevGeo, chevMat);
    track.pointAt(s, sc.side * u, chev.position, 0.15);
    trackBasis(track, s, MAT4);
    chev.quaternion.setFromRotationMatrix(MAT4);
    chev.rotateY(-sc.side * 0.5); // point forward, angled toward the tunnel
    group.add(chev);
  }
  return group;
}

// ---- boost pickup ------------------------------------------------------------

export const BOOST_COLOR = 0x5ff0ff;

function buildBoostPickup(track, p) {
  const group = new THREE.Group();

  const glow = { color: BOOST_COLOR, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), new THREE.MeshBasicMaterial({ color: BOOST_COLOR }));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.09, 6, 28),
    new THREE.MeshBasicMaterial({ ...glow, color: 0xffffff, opacity: 0.85 }),
  );
  // Tall beacon so the pickup reads from a distance, past the rocks in front of it.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.8, 36, 12, 1, true),
    new THREE.MeshBasicMaterial({ ...glow, opacity: 0.28, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.y = 18;
  const spinner = new THREE.Group();
  spinner.position.y = POD.hoverHeight;
  spinner.add(core, ring);
  group.add(spinner, beam);

  track.pointAt(p.s, p.x, group.position, 0);
  trackBasis(track, p.s, MAT4);
  group.quaternion.setFromRotationMatrix(MAT4);

  return {
    group,
    update(t) {
      spinner.position.y = POD.hoverHeight + Math.sin(t * 3) * 0.18;
      core.rotation.y = t * 2.4;
      ring.rotation.set(Math.PI / 2 + Math.sin(t * 1.7) * 0.4, t * 1.1, 0);
      beam.material.opacity = 0.22 + Math.sin(t * 5) * 0.06;
    },
    setTaken(taken) {
      group.visible = !taken;
    },
  };
}

// ---- sky -------------------------------------------------------------------

function buildSky() {
  const geo = new THREE.SphereGeometry(900, 24, 12);
  const colors = [];
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const ground = new THREE.Color(PALETTE.fog);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 900;
    if (y > 0) COLOR.copy(horizon).lerp(top, Math.pow(y, 0.6));
    else COLOR.copy(horizon).lerp(ground, Math.min(1, -y * 6));
    colors.push(COLOR.r, COLOR.g, COLOR.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  sky.renderOrder = -1;

  // Twin suns, because of course.
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0, fog: false, depthWrite: false });
  const sunA = new THREE.Mesh(new THREE.CircleGeometry(38, 24), sunMat);
  const sunB = new THREE.Mesh(new THREE.CircleGeometry(24, 24), sunMat.clone());
  sunB.material.color.set(0xffdca8);
  sunA.position.set(-420, 330, -620);
  sunB.position.set(-330, 270, -680);
  for (const s of [sunA, sunB]) {
    s.lookAt(0, 0, 0);
    s.renderOrder = -1;
    sky.add(s);
  }
  return sky;
}

// ---- canyon ----------------------------------------------------------------

function noise1(s, seed) {
  return (
    Math.sin(s * 0.031 + seed) * 0.5 +
    Math.sin(s * 0.087 + seed * 2.1) * 0.3 +
    Math.sin(s * 0.23 + seed * 3.7) * 0.2
  );
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildCanyon(track) {
  const step = 3;
  const start = -40;
  const end = track.length + 60;
  const rows = Math.floor((end - start) / step) + 1;

  // Cross-section, left to right: [lateral offset from the edge, height, floor?]
  const profile = (side, s, hw, j) => {
    const n = noise1(s, side * 5);
    const jag = (hash(j * 3.1 + side) - 0.5) * 2.2;
    return [
      [side * (hw + 42 + n * 10), 30 + n * 6 + jag],
      [side * (hw + 9 + n * 4 + jag * 0.6), 27 + n * 8],
      [side * (hw + 4.5 + jag * 0.8), 15 + n * 5 + jag],
      [side * (hw + 1.5 + jag * 0.3), 4 + jag * 0.5],
      [side * hw, 0.1],
    ];
  };

  const cols = 15;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const sand = new THREE.Color(PALETTE.sand);
  const sandDark = new THREE.Color(PALETTE.sandDark);
  const rockA = new THREE.Color(PALETTE.rockA);
  const rockB = new THREE.Color(PALETTE.rockB);
  const rockC = new THREE.Color(PALETTE.rockC);

  for (let j = 0; j < rows; j++) {
    const s = start + j * step;
    const hw = track.halfWidthAt(Math.max(0, s));
    // Each wall separately: one opens out around the shortcut tunnel.
    const left = profile(-1, s, track.wallAt(Math.max(0, s), -1), j);
    const right = profile(1, s, track.wallAt(Math.max(0, s), 1), j).reverse();
    const floor = [-0.66, -0.33, 0, 0.33, 0.66].map((k) => [k * hw, 0]);
    // Floor marker stripes every 40 m give the eye something to track.
    const stripe = Math.floor(s / 20) % 2 === 0;
    const verts = [...left, ...floor, ...right];
    verts.forEach(([x, h], c) => {
      track.pointAt(s, x, TMP, h);
      const k = (j * cols + c) * 3;
      positions[k] = TMP.x;
      positions[k + 1] = TMP.y;
      positions[k + 2] = TMP.z;
      if (h < 0.5) {
        COLOR.copy(stripe ? sand : sandDark).lerp(sandDark, hash(j * 7 + c) * 0.35);
      } else {
        const band = Math.sin(h * 0.55 + noise1(s, 9) * 2) * 0.5 + 0.5;
        COLOR.copy(rockA).lerp(rockB, band).lerp(rockC, hash(j * 13 + c) * 0.3);
        if (h > 26) COLOR.lerp(sand, 0.45);
      }
      colors[k] = COLOR.r;
      colors[k + 1] = COLOR.g;
      colors[k + 2] = COLOR.b;
    });
  }

  const index = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = j * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      index.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

function buildMesas(track) {
  const rng = makeRng(42);
  const geo = new THREE.CylinderGeometry(0.8, 1, 1, 7, 1);
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const count = 140;
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rock = new THREE.Color(PALETTE.rockA);
  const light = new THREE.Color(PALETTE.rockB);
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 10; tries++) {
    const s = rng.range(-100, track.length + 200);
    const side = rng() < 0.5 ? -1 : 1;
    const off = side * (track.halfWidthAt(Math.max(0, s)) + rng.range(70, 360));
    track.pointAt(s, off, TMP, 0);
    // Keep clear of every part of the canyon (bends bring other sections close).
    let clear = true;
    for (let k = 0; k < track.length && clear; k += 25) {
      track.pointAt(k, 0, BACK, 0);
      if (Math.hypot(BACK.x - TMP.x, BACK.z - TMP.z) < 75) clear = false;
    }
    if (!clear) continue;
    const r = rng.range(14, 50);
    const h = rng.range(30, 85);
    TMP.y += 10 + h / 2;
    QUAT.setFromAxisAngle(UPV.set(0, 1, 0), rng() * Math.PI);
    SCALE.set(r, h, r * rng.range(0.7, 1.3));
    MAT4.compose(TMP, QUAT, SCALE);
    mesh.setMatrixAt(placed, MAT4);
    mesh.setColorAt(placed, COLOR.copy(rock).lerp(light, rng()));
    placed++;
  }
  mesh.count = placed;
  return mesh;
}

// ---- obstacles -------------------------------------------------------------

function rockGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  // Jitter shared vertices identically so the rock stays watertight.
  const key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  const offsets = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!offsets.has(k)) offsets.set(k, 0.78 + hash(offsets.size + 3) * 0.35);
    const f = offsets.get(k);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildObstacles(track) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  const byKind = { rock: [], pillar: [], wall: [] };
  for (const o of track.obstacles) byKind[o.kind]?.push(o); // the ridge nose is drawn by buildShortcut

  const make = (geo, list, place) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, i) => {
      place(o, TMP, QUAT, SCALE);
      MAT4.compose(TMP, QUAT, SCALE);
      mesh.setMatrixAt(i, MAT4);
      const c = new THREE.Color(PALETTE.rockA).lerp(new THREE.Color(PALETTE.rockC), o.seed * 0.7);
      mesh.setColorAt(i, c);
    });
    group.add(mesh);
  };

  const orient = (o, extraYaw = 0) => {
    trackBasis(track, o.s, MAT4);
    QUAT.setFromRotationMatrix(MAT4);
    if (extraYaw) QUAT.multiply(new THREE.Quaternion().setFromAxisAngle(UPV.set(0, 1, 0), extraYaw));
  };

  make(rockGeometry(), byKind.rock, (o, p, q, sc) => {
    track.pointAt(o.s, o.x, p, o.h * 0.35);
    orient(o, o.seed * Math.PI * 2);
    sc.set(o.hw, o.h, o.hl);
  });
  make(new THREE.CylinderGeometry(0.85, 1.15, 1, 7), byKind.pillar, (o, p, q, sc) => {
    track.pointAt(o.s, o.x, p, o.h / 2 - 0.5);
    orient(o, o.seed * 3);
    sc.set(o.hw, o.h, o.hl);
  });
  make(new THREE.BoxGeometry(2, 1, 2), byKind.wall, (o, p, q, sc) => {
    track.pointAt(o.s, o.x, p, o.h / 2);
    orient(o);
    sc.set(o.hw, o.h, o.hl);
  });

  // Arch beams over wall rows.
  const beams = track.rows.filter((r) => r.beam);
  make(new THREE.BoxGeometry(2, 1, 2), beams.map((r) => ({ ...r.beam, seed: 0.4 })), (b, p, q, sc) => {
    track.pointAt(b.s, 0, p, b.y + 1.4);
    orient(b);
    sc.set(b.hw, 2.8, 1.6);
  });
  return group;
}

// ---- start / finish ----------------------------------------------------------

function checkerTexture(cells = 8) {
  const c = document.createElement('canvas');
  c.width = cells * 16;
  c.height = 32;
  const g = c.getContext('2d');
  for (let x = 0; x < cells; x++) {
    for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f4f1ea';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildLine(track, s, kind) {
  const hw = track.halfWidthAt(s);
  const geo = new THREE.PlaneGeometry(hw * 2, 2.4);
  geo.rotateX(-Math.PI / 2);
  const mat =
    kind === 'finish'
      ? new THREE.MeshBasicMaterial({ map: checkerTexture(Math.round(hw)) })
      : new THREE.MeshBasicMaterial({ color: 0xf4f1ea });
  const mesh = new THREE.Mesh(geo, mat);
  track.pointAt(s, 0, mesh.position, 0.12);
  trackBasis(track, s, MAT4);
  mesh.quaternion.setFromRotationMatrix(MAT4);
  return mesh;
}

function buildGantry(track) {
  const s = 14; // just ahead of the grid so the lights are in view
  const hw = track.halfWidthAt(0) + 1;
  const group = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x4a4440, flatShading: true });
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.8, 12, 0.8), metal);
    pole.position.set(side * hw, 6, 0);
    group.add(pole);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1, 1.6, 1), metal);
  beam.position.set(0, 11.5, 0);
  group.add(beam);
  const lights = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0x331111 }),
    );
    m.position.set((i - 1) * 1.6, 11.5, 0.52);
    group.add(m);
    lights.push(m);
  }
  track.pointAt(s, 0, group.position, 0);
  trackBasis(track, s, MAT4);
  group.quaternion.setFromRotationMatrix(MAT4);

  return {
    group,
    /** n = 3,2,1 lit red; 0 = all green; -1 = off */
    set(n) {
      lights.forEach((m, i) => {
        if (n === 0) m.material.color.set(0x4dff7a);
        else if (n > 0 && i < 4 - n) m.material.color.set(0xff3b2e);
        else m.material.color.set(0x331111);
      });
    },
  };
}

function buildFinishArch(track) {
  const s = track.finishS;
  const hw = track.halfWidthAt(s) + 1;
  const group = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x3d3833, flatShading: true });
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 14, 8), metal);
    pole.position.set(side * hw, 7, 0);
    group.add(pole);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2, 2.6, 0.4),
    new THREE.MeshBasicMaterial({ map: checkerTexture(Math.round(hw * 1.2)) }),
  );
  banner.position.set(0, 12.5, 0);
  group.add(banner);
  track.pointAt(s, 0, group.position, 0);
  trackBasis(track, s, MAT4);
  group.quaternion.setFromRotationMatrix(MAT4);
  return group;
}
