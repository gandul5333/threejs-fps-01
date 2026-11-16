// map.js — "Pelabuhan Tua": a working harbour yard at dusk, 56 x 40 m.
// Three lanes: A-long (west, containers), Mid (crates + a truck), B-long
// (east, warehouse). Site A is the dock on the north-west, Site B the
// warehouse on the north-east. Guard spawns south, Raider spawns north.
// Every box is both a collider (AABB) and a surface bullets stop on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP = {
  halfX: 28,
  halfZ: 20,
  wallH: 5,
  guardSpawn: { x: 0, z: 16, yaw: Math.PI },
  raiderSpawn: { x: 0, z: -16, yaw: 0 },
  siteA: { minX: -26, maxX: -14, minZ: -18, maxZ: -8, cx: -20, cz: -13 },
  siteB: { minX: 14, maxX: 26, minZ: -18, maxZ: -8, cx: 20, cz: -13 },
  // Waypoint graph for bots: id -> {x, z, links:[ids]}. Routes fan out from
  // each spawn through the three lanes to both sites and the hold spots.
  waypoints: [
    { id: 'gSpawn', x: 0, z: 16, links: ['gMid', 'gA', 'gB'] },
    { id: 'gMid', x: 0, z: 8, links: ['gSpawn', 'mid', 'gA', 'gB'] },
    { id: 'gA', x: -18, z: 8, links: ['gSpawn', 'gMid', 'aLong', 'aSite'] },
    { id: 'gB', x: 18, z: 8, links: ['gSpawn', 'gMid', 'bLong', 'bSite'] },
    { id: 'rSpawn', x: 0, z: -16, links: ['rMid', 'rA', 'rB'] },
    { id: 'rMid', x: 0, z: -8, links: ['rSpawn', 'mid', 'rA', 'rB'] },
    { id: 'rA', x: -18, z: -8, links: ['rSpawn', 'rMid', 'aLong', 'aSite'] },
    { id: 'rB', x: 18, z: -8, links: ['rSpawn', 'rMid', 'bLong', 'bSite'] },
    { id: 'mid', x: 0, z: 0, links: ['gMid', 'rMid', 'aLong', 'bLong', 'midBox'] },
    { id: 'midBox', x: 4, z: 2, links: ['mid'] },
    { id: 'aLong', x: -24, z: -2, links: ['rA', 'gA', 'mid', 'aSite'] },
    { id: 'bLong', x: 24, z: -2, links: ['rB', 'gB', 'mid', 'bSite'] },
    { id: 'aSite', x: -20, z: -13, links: ['aLong', 'rA', 'gA'] },
    { id: 'bSite', x: 20, z: -13, links: ['bLong', 'rB', 'gB'] },
  ],
};

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'lamp' || name === 'dusk' ? 0.4 : 0.92,
      metalness: name === 'steel' ? 0.45 : 0.04,
      emissive: name === 'lamp' ? new THREE.Color(PALETTE.lamp) : new THREE.Color(0x000000),
      emissiveIntensity: name === 'lamp' ? 0.9 : 0,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground: concrete yard with a darker asphalt strip down mid.
  box(56.4, 0.4, 40.4, 0, -0.2, 0, 'concrete', false);
  box(6, 0.06, 40, 0, 0.03, 0, 'asphalt', false);
  // Perimeter walls.
  box(0.5, MAP.wallH, 40.4, -28.2, 2.5, 0, 'concreteDark');
  box(0.5, MAP.wallH, 40.4, 28.2, 2.5, 0, 'concreteDark');
  box(56.4, MAP.wallH, 0.5, 0, 2.5, -20.2, 'concreteDark');
  box(56.4, MAP.wallH, 0.5, 0, 2.5, 20.2, 'concreteDark');

  // --- Site A (dock, north-west): stacked rust + teal containers ---
  box(6, 2.6, 2.6, -22, 1.3, -16, 'rust');
  box(6, 2.6, 2.6, -22, 1.3, -12.6, 'teal');
  box(6, 2.6, 2.6, -22, 3.9, -14.3, 'ochre');
  box(2.6, 2.6, 6, -15.5, 1.3, -17, 'teal');
  box(1.2, 1.1, 1.2, -17, 0.55, -10.5, 'crate');
  box(1.2, 1.1, 1.2, -18.4, 0.55, -9.8, 'crate');
  // --- Site B (warehouse, north-east): big shed wall + crates ---
  box(10, 4.4, 0.6, 21, 2.2, -18.5, 'steel');
  box(0.6, 4.4, 8, 25.5, 2.2, -14, 'steel');
  box(2.4, 1.2, 2.4, 17.5, 0.6, -15.5, 'crate');
  box(2.4, 1.2, 2.4, 17.5, 1.8, -15.5, 'crate');
  box(1.2, 1.1, 1.2, 23, 0.55, -10.5, 'crate');
  box(1.2, 1.1, 1.2, 15.5, 0.55, -10, 'crate');
  // --- Mid: a truck (cab + trailer) and crate cover ---
  box(2.6, 2.8, 7, -4, 1.4, 0, 'ochre');
  box(2.4, 2.2, 2.4, -4, 1.1, 5.2, 'steel');
  box(1.2, 1.1, 1.2, 3.5, 0.55, -1.5, 'crate');
  box(1.2, 1.1, 1.2, 4.8, 0.55, -0.4, 'crate');
  box(1.2, 2.2, 1.2, 4.8, 1.1, -1.5, 'crate');
  // --- A-long / B-long lane cover ---
  box(1.2, 1.1, 3.6, -24, 0.55, -6, 'crate');
  box(1.2, 1.1, 3.6, 24, 0.55, -6, 'crate');
  box(2.4, 1.2, 1.2, -24, 0.6, 4, 'rust');
  box(2.4, 1.2, 1.2, 24, 0.6, 4, 'rust');
  // --- Guard side: low walls + sandbag-ish cover near spawn ---
  box(3.6, 1.1, 1.2, -8, 0.55, 12, 'concreteDark');
  box(3.6, 1.1, 1.2, 8, 0.55, 12, 'concreteDark');
  box(1.2, 1.1, 1.2, 0, 0.55, 10, 'crate');
  // --- Raider side cover ---
  box(3.6, 1.1, 1.2, -8, 0.55, -12, 'concreteDark');
  box(3.6, 1.1, 1.2, 8, 0.55, -12, 'concreteDark');

  // Site floor markers: painted squares + a lamp post over each site.
  function siteMarker(site, colorName) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE[colorName]), roughness: 0.8, transparent: true, opacity: 0.28 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(site.cx, 0.05, site.cz);
    m.receiveShadow = true;
    group.add(m);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.4, 8), materials.steel);
    pole.position.set(site.cx + 5.4, 2.2, site.cz + 4.2);
    pole.castShadow = true;
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), materials.lamp);
    bulb.position.set(site.cx + 5.4, 4.5, site.cz + 4.2);
    group.add(bulb);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.lamp), 22, 16, 1.8);
    light.position.set(site.cx + 5.4, 4.4, site.cz + 4.2);
    group.add(light);
  }
  siteMarker(MAP.siteA, 'siteA');
  siteMarker(MAP.siteB, 'siteB');

  // Lighting: low orange sun from the west, violet dusk sky, cool fill.
  scene.add(new THREE.HemisphereLight(new THREE.Color(0x8a6a9a), new THREE.Color(0x3a2a26), 1.5));
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.dusk), 3.4);
  sun.position.set(-26, 12, 6);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x7a86b8), 0.9);
  fill.position.set(14, 10, 16);
  scene.add(fill);

  return { colliders, shootables, group };
}
