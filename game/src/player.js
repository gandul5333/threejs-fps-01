// player.js — first-person body: acceleration-based WASD, crouch, recoil, and
// AABB collision against the map. The body is a circle (radius 0.38) in XZ
// with a standing eye of 1.62 and a crouched eye of 1.05.
import * as THREE from 'three';
import { collideCircle } from './physics.js';

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 16),
    velocity: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: 0,
    eye: 1.62,
    crouched: false,
    onGround: true,
    health: 100,
    armor: 0,
    alive: true,
    recoilPitch: 0,
    recoilYaw: 0,
    radius: 0.38,
  };

  const ACCEL = 42;
  const FRICTION = 9;
  const WALK_SPEED = 5.2;
  const CROUCH_SPEED = 2.6;

  function collide(pos, radius) {
    collideCircle(pos, radius, colliders);
  }

  return {
    state,
    look(dx, dy) {
      state.yaw -= dx * 0.0021;
      state.pitch -= dy * 0.0021;
      const lim = Math.PI / 2 - 0.02;
      state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
    },
    recoil(pitchKick, yawKick) {
      state.recoilPitch += pitchKick;
      state.recoilYaw += yawKick;
    },
    step(dt, keys) {
      const targetEye = state.crouched ? 1.05 : 1.62;
      state.eye += (targetEye - state.eye) * Math.min(1, dt * 14);
      // Recoil decays back toward zero.
      state.recoilPitch *= Math.pow(0.0001, dt);
      state.recoilYaw *= Math.pow(0.0001, dt);
      if (Math.abs(state.recoilPitch) < 0.0002) state.recoilPitch = 0;
      if (Math.abs(state.recoilYaw) < 0.0002) state.recoilYaw = 0;

      const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
      state.crouched = wantCrouch;
      const speed = state.crouched ? CROUCH_SPEED : WALK_SPEED;

      let ix = 0;
      let iz = 0;
      if (keys.has('KeyW')) iz -= 1;
      if (keys.has('KeyS')) iz += 1;
      if (keys.has('KeyA')) ix -= 1;
      if (keys.has('KeyD')) ix += 1;
      const len = Math.hypot(ix, iz) || 1;
      ix /= len;
      iz /= len;
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      const wx = ix * cos - iz * sin;
      const wz = ix * sin + iz * cos;

      state.velocity.x += wx * ACCEL * dt;
      state.velocity.z += wz * ACCEL * dt;
      // Friction when no input; clamp to max speed.
      const hv = Math.hypot(state.velocity.x, state.velocity.z);
      if (ix === 0 && iz === 0) {
        const f = Math.max(0, 1 - FRICTION * dt);
        state.velocity.x *= f;
        state.velocity.z *= f;
      } else if (hv > speed) {
        state.velocity.x = (state.velocity.x / hv) * speed;
        state.velocity.z = (state.velocity.z / hv) * speed;
      }

      state.position.x += state.velocity.x * dt;
      state.position.z += state.velocity.z * dt;
      collide(state.position, state.radius);
    },
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
    reset(x, z, yaw) {
      state.position.set(x, 0, z);
      state.velocity.set(0, 0, 0);
      state.yaw = yaw;
      state.pitch = 0;
      state.health = 100;
      state.armor = 0;
      state.alive = true;
      state.recoilPitch = 0;
      state.recoilYaw = 0;
      state.crouched = false;
      state.eye = 1.62;
    },
    // Damage with armour soaking half until it runs out.
    damage(amount) {
      if (!state.alive) return 0;
      let left = amount;
      if (state.armor > 0) {
        const soaked = Math.min(state.armor, left * 0.5);
        state.armor -= soaked;
        left -= soaked;
      }
      state.health -= left;
      if (state.health <= 0) {
        state.health = 0;
        state.alive = false;
      }
      return left;
    },
  };
}
