import * as THREE from 'three';

// Original low-poly pod: two engine nacelles joined by an energy binder,
// towing a small cockpit on tethers. Faces -Z.
export function createPodModel(color, name) {
  const root = new THREE.Group(); // placed on the track frame
  const body = new THREE.Group(); // banks, yaws, wobbles
  root.add(body);

  const paint = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const metal = new THREE.MeshLambertMaterial({ color: 0x9a948c, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2826, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffb35c });

  const flames = [];
  for (const side of [-1, 1]) {
    const engine = new THREE.Group();
    engine.position.set(side * 0.85, 0, -1.4);

    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 2.4, 8), metal);
    hull.rotation.x = Math.PI / 2;
    engine.add(hull);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.5, 8), paint);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.z = -0.45;
    engine.add(stripe);

    const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.45, 8, 1, true), dark);
    intake.rotation.x = Math.PI / 2;
    intake.position.z = -1.4;
    engine.add(intake);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.9), paint);
    fin.position.set(side * 0.3, 0.45, 0.65);
    fin.rotation.z = -side * 0.35;
    engine.add(fin);

    const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), glow);
    exhaust.position.z = 1.21;
    engine.add(exhaust);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 1.6, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x7fd4ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flame.rotation.x = Math.PI / 2;
    flame.geometry.translate(0, 0.8, 0); // wide end at the nozzle, tip trailing behind
    flame.position.z = 1.22;
    engine.add(flame);
    flames.push(flame);

    body.add(engine);
  }

  // Energy binder between the engines.
  const binderMat = new THREE.MeshBasicMaterial({
    color: 0xff5ad1,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const binder = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 0.12), binderMat);
  binder.position.set(0, 0.15, -1.9);
  body.add(binder);

  // Cockpit.
  const cockpit = new THREE.Group();
  cockpit.position.set(0, -0.05, 1.25);
  const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.25, 1.3, 7), paint);
  tub.rotation.x = Math.PI / 2;
  cockpit.add(tub);
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.33, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x1d2a33, flatShading: true }),
  );
  canopy.position.set(0, 0.12, -0.15);
  canopy.scale.set(1, 0.9, 1.5);
  cockpit.add(canopy);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.35), dark);
  tail.position.set(0, 0, 0.6);
  cockpit.add(tail);
  body.add(cockpit);

  // Tethers.
  const tetherGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.85, 0, -0.3),
    new THREE.Vector3(-0.25, 0, 0.7),
    new THREE.Vector3(0.85, 0, -0.3),
    new THREE.Vector3(0.25, 0, 0.7),
  ]);
  body.add(new THREE.LineSegments(tetherGeo, new THREE.LineBasicMaterial({ color: 0x222222 })));

  // Soft shadow blob on the ground (doesn't bank with the body).
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 4.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }),
  );
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
