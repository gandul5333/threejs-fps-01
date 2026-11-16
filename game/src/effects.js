// effects.js — pooled visual effects: tracers, muzzle flashes, impacts and
// explosions. Everything is preallocated at creation; step() only fades and
// hides, so the hot loop never allocates.
import * as THREE from 'three';

export function createEffects(scene) {
  // --- Tracers: 24 reusable lines, each with its own fading material.
  const tracers = [];
  for (let i = 0; i < 24; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, mat, life: 0 });
  }
  let tracerIndex = 0;

  // --- Impact sparks: 12 small tetrahedra that pop and shrink.
  const sparks = [];
  const sparkGeo = new THREE.TetrahedronGeometry(0.09);
  for (let i = 0; i < 12; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, mat, life: 0 });
  }
  let sparkIndex = 0;

  // --- Explosion: one expanding shell + one light, reused every blast.
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0, depthWrite: false });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff8c2e, 0, 18, 1.6);
  scene.add(boomLight);
  let boomLife = 0;

  // --- Grenade mesh (one at a time).
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.7 });
  const grenadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), grenadeMat);
  grenadeMesh.visible = false;
  scene.add(grenadeMesh);

  // --- Charge device: blinking box that appears at the planted site.
  const chargeMat = new THREE.MeshStandardMaterial({ color: 0xe83a2e, roughness: 0.4, emissive: 0x881100, emissiveIntensity: 0.6 });
  const chargeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.3), chargeMat);
  chargeMesh.visible = false;
  chargeMesh.castShadow = true;
  scene.add(chargeMesh);
  const chargeLight = new THREE.PointLight(0xff2a1a, 0, 8, 1.8);
  scene.add(chargeLight);

  return {
    tracer(from, to) {
      const t = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % tracers.length;
      const pos = t.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      t.line.visible = true;
      t.mat.opacity = 0.85;
      t.life = 0.09;
    },
    spark(point) {
      const s = sparks[sparkIndex];
      sparkIndex = (sparkIndex + 1) % sparks.length;
      s.mesh.position.copy(point);
      s.mesh.visible = true;
      s.mat.opacity = 0.95;
      s.mesh.scale.setScalar(1);
      s.life = 0.18;
    },
    explosion(point) {
      boom.position.copy(point);
      boom.visible = true;
      boom.scale.setScalar(0.4);
      boomMat.opacity = 0.9;
      boomLight.position.copy(point);
      boomLight.intensity = 90;
      boomLife = 0.5;
    },
    showCharge(point) {
      chargeMesh.position.set(point.x, 0.12, point.z);
      chargeMesh.visible = true;
      chargeLight.position.set(point.x, 0.8, point.z);
      chargeLight.intensity = 6;
    },
    hideCharge() {
      chargeMesh.visible = false;
      chargeLight.intensity = 0;
    },
    showGrenade(point) {
      grenadeMesh.position.copy(point);
      grenadeMesh.visible = true;
    },
    hideGrenade() {
      grenadeMesh.visible = false;
    },
    step(dt, time) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) {
          t.line.visible = false;
          t.mat.opacity = 0;
        } else {
          t.mat.opacity = (t.life / 0.09) * 0.85;
        }
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        if (s.life <= 0) {
          s.mesh.visible = false;
          s.mat.opacity = 0;
        } else {
          s.mat.opacity = (s.life / 0.18) * 0.95;
          s.mesh.scale.setScalar(1 + (0.18 - s.life) * 6);
        }
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - Math.max(boomLife, 0) / 0.5;
        boom.scale.setScalar(0.4 + k * 6.5);
        boomMat.opacity = Math.max(0, 0.9 * (1 - k));
        boomLight.intensity = Math.max(0, 90 * (1 - k));
        if (boomLife <= 0) boom.visible = false;
      }
      if (chargeMesh.visible) {
        chargeMat.emissiveIntensity = 0.4 + 0.6 * (Math.sin(time * 6) > 0 ? 1 : 0.15);
      }
    },
  };
}
