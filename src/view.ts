import * as THREE from "three";
import { AdventureView, updateUpgrades } from "./adventure-view";
import { EXPEDITIONS, SECRETS } from "./adventure-content";
import { getSecretPosition } from "./adventure";
import { createWorld } from "./world";
import { getPrompt } from "./simulation";
import {
  SPRING,
  FISHING_SPOTS,
  START,
  ISLAND_RADIUS,
  regionAt,
} from "./locations";
import type { GameState, BuildingKind } from "./types";
export interface SceneFlags {
  time: number;
  moving: boolean;
  interactive: boolean;
  reducedMotion: boolean;
}
export interface RenderFlags {
  time: number;
  active: boolean;
  title: boolean;
  frozen: boolean;
  reducedMotion: boolean;
}
export function repairResourcePositions(
  next: GameState,
  colliders: ReadonlyArray<{ x: number; z: number; radius: number }>,
) {
  const clear = (x: number, z: number) =>
    Math.hypot(x, z) < ISLAND_RADIUS - 3 &&
    !colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.radius + 0.65);
  for (const resource of next.resources) {
    if (Math.hypot(resource.x, resource.z) > 110) continue;
    if (clear(resource.x, resource.z)) continue;
    const originX = resource.x,
      originZ = resource.z,
      region = regionAt(originX, originZ);
    let found = false;
    for (let radius = 0.75; radius <= 15 && !found; radius += 0.75)
      for (let i = 0; i < 24; i++) {
        const angle = (i * Math.PI) / 12,
          x = originX + Math.cos(angle) * radius,
          z = originZ + Math.sin(angle) * radius;
        if (regionAt(x, z) === region && clear(x, z)) {
          resource.x = x;
          resource.z = z;
          found = true;
          break;
        }
      }
  }
}

/** Owns Three.js resources and presentation; simulation remains authoritative in main. */
export class GameView {
  readonly setPlacement: (
    placement: {
      kind: BuildingKind;
      x: number;
      z: number;
      rotation: number;
      valid: boolean;
    } | null,
  ) => void;
  readonly pickGround: (
    clientX: number,
    clientY: number,
  ) => { x: number; z: number } | null;
  readonly sync: (next: GameState, dt: number, flags: SceneFlags) => void;
  readonly render: (next: GameState, dt: number, flags: RenderFlags) => void;
  readonly reset: (next: GameState) => void;
  readonly focus: (x: number, z: number) => void;
  readonly burst: (x: number, z: number) => void;
  readonly attack: () => void;
  readonly hit: () => void;
  readonly collide: (next: GameState) => void;
  readonly canBuild: (x: number, z: number) => boolean;
  readonly repairResources: (next: GameState) => void;
  readonly metrics: () => {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  constructor(initialState: GameState) {
    let state = initialState,
      visualTime = 0,
      reducedMotion = false,
      moving = false,
      interactive = false,
      attackAnimation = 0,
      shake = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.domElement.id = "game-canvas";
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    const world = createWorld(scene);
    const adventure = new AdventureView(scene, world.groundHeight);
    const camera = new THREE.OrthographicCamera(-22, 22, 17, -17, 0.1, 350);
    const player = world.createPlayer();
    scene.add(player);
    const playerTorch = new THREE.PointLight(0xffc477, 0, 14, 1.7);
    playerTorch.position.y = 2;
    player.add(playerTorch);
    const sun = scene.children.find(
      (o) => o instanceof THREE.DirectionalLight,
    ) as THREE.DirectionalLight | undefined;
    const sky = scene.children.find(
      (o) => o instanceof THREE.HemisphereLight,
    ) as THREE.HemisphereLight | undefined;
    const baseSun = new THREE.Color(0xffe7bc),
      moon = new THREE.Color(0x94bae7);
    const cameraTarget = new THREE.Vector3(START.x, 0, START.z - 9);
    const cameraOffset = new THREE.Vector3(22, 28, 32);
    const resourceMeshes = new Map<string, THREE.Group>(),
      animalMeshes = new Map<string, THREE.Group>(),
      buildingMeshes = new Map<string, THREE.Group>();
    const warningGeometry = new THREE.RingGeometry(1.1, 1.24, 16),
      warningMaterial = new THREE.MeshBasicMaterial({
        color: 0xe98149,
        side: THREE.DoubleSide,
      });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 0.91, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffedbc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    const ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0x9beaaf,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const ghost = new THREE.Group();
    const ghostBody = new THREE.Mesh(
      new THREE.BoxGeometry(3, 2.2, 3),
      ghostMaterial,
    );
    ghostBody.position.y = 1.1;
    ghost.add(ghostBody);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1, 3),
      ghostMaterial,
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.25, 2.4);
    ghost.add(arrow);
    ghost.visible = false;
    scene.add(ghost);
    this.setPlacement = (value) => {
      ghost.visible = !!value;
      if (value) {
        ghost.position.set(
          value.x,
          world.groundHeight(value.x, value.z) + 0.08,
          value.z,
        );
        ghost.rotation.y = value.rotation;
        ghostMaterial.color.setHex(value.valid ? 0x9beaaf : 0xf17565);
        ghostBody.scale.set(
          value.kind === "raft" ? 1.6 : 1,
          value.kind === "fire" ? 0.3 : 1,
          value.kind === "raft" ? 1.8 : 1,
        );
      }
    };
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2(),
      plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      point = new THREE.Vector3();
    this.pickGround = (x, z) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(z - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      plane.constant = -world.groundHeight(state.player.x, state.player.z);
      if (!raycaster.ray.intersectPlane(plane, point)) return null;
      for (let i = 0; i < 3; i++) {
        plane.constant = -world.groundHeight(point.x, point.z);
        if (!raycaster.ray.intersectPlane(plane, point)) return null;
      }
      return { x: point.x, z: point.z };
    };
    const particleGeometry = new THREE.IcosahedronGeometry(0.1, 0),
      particleMaterial = new THREE.MeshBasicMaterial({ color: 0xffdda0 });
    const particlePool = Array.from({ length: 48 }, () => {
      const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, life: 0, vx: 0, vy: 0, vz: 0 };
    });
    let particleIndex = 0;
    function clearDynamic() {
      for (const map of [resourceMeshes, animalMeshes, buildingMeshes]) {
        for (const mesh of map.values()) {
          mesh.removeFromParent();
          world.disposeModel(mesh);
        }
        map.clear();
      }
      for (const p of particlePool) {
        p.life = 0;
        p.mesh.visible = false;
      }
      ring.visible = false;
    }
    function burst(x: number, z: number) {
      for (const mesh of resourceMeshes.values())
        if (Math.hypot(mesh.position.x - x, mesh.position.z - z) < 2)
          mesh.userData.hitUntil = visualTime + 0.35;
      for (let i = 0; i < 8; i++) {
        const p = particlePool[particleIndex++ % particlePool.length];
        p.mesh.position.set(x, world.groundHeight(x, z) + 0.7, z);
        p.mesh.scale.setScalar(1);
        p.mesh.visible = true;
        p.life = 0.6;
        const a = (i * Math.PI) / 4 + visualTime;
        p.vx = Math.cos(a) * 2;
        p.vz = Math.sin(a) * 2;
        p.vy = 2 + (i % 3);
      }
    }
    function resize() {
      const aspect = innerWidth / innerHeight,
        size = innerWidth < 650 ? 18 : 17;
      camera.left = -size * aspect;
      camera.right = size * aspect;
      camera.top = size;
      camera.bottom = -size;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    }
    addEventListener("resize", resize);
    resize();
    function modelFor(
      map: Map<string, THREE.Group>,
      id: string,
      factory: () => THREE.Group,
    ) {
      let mesh = map.get(id);
      if (!mesh) {
        mesh = factory();
        map.set(id, mesh);
        scene.add(mesh);
      }
      return mesh;
    }
    function removeMissing(map: Map<string, THREE.Group>, ids: Set<string>) {
      for (const [id, mesh] of map)
        if (!ids.has(id)) {
          mesh.removeFromParent();
          world.disposeModel(mesh);
          map.delete(id);
        }
    }
    function syncScene(dt: number) {
      player.position.set(
        state.player.x,
        world.groundHeight(state.player.x, state.player.z),
        state.player.z,
      );
      player.rotation.y = state.player.heading;
      const visibleRadius = innerWidth < 650 ? 38 : 48;
      for (const r of state.resources) {
        const distance = Math.hypot(r.x - state.player.x, r.z - state.player.z);
        let mesh = resourceMeshes.get(r.id);
        if (!mesh && distance < visibleRadius)
          mesh = modelFor(resourceMeshes, r.id, () =>
            world.createResource(r.kind, r.x, r.z),
          );
        if (mesh) {
          mesh.visible = r.remaining > 0 && distance < visibleRadius;
          mesh.position.set(r.x, world.groundHeight(r.x, r.z), r.z);
          mesh.rotation.z =
            !reducedMotion && Number(mesh.userData.hitUntil ?? 0) > visualTime
              ? Math.sin(visualTime * 45) * 0.12
              : 0;
        }
      }
      for (const a of state.animals) {
        const distance = Math.hypot(a.x - state.player.x, a.z - state.player.z);
        let mesh = animalMeshes.get(a.id);
        if (!mesh && distance < visibleRadius)
          mesh = modelFor(animalMeshes, a.id, () =>
            world.createAnimal(a.kind, a.x, a.z),
          );
        if (mesh) {
          mesh.visible = a.hp > 0 && distance < visibleRadius;
          mesh.position.set(a.x, world.groundHeight(a.x, a.z), a.z);
          mesh.rotation.y = a.heading;
          mesh.rotation.x = (a.windup ?? 0) > 0 ? -0.15 : 0;
          let warning = mesh.getObjectByName("attack-warning");
          if (!warning) {
            const m = new THREE.Mesh(warningGeometry, warningMaterial);
            m.name = "attack-warning";
            m.rotation.x = -Math.PI / 2;
            m.position.y = 0.04;
            mesh.add(m);
            warning = m;
          }
          warning.visible = (a.windup ?? 0) > 0;
          if ((a.flee ?? 0) > 0 && !reducedMotion)
            mesh.position.y += Math.abs(Math.sin(visualTime * 13)) * 0.15;
          for (let i = 0; i < 4; i++) {
            const leg = mesh.getObjectByName("leg" + i);
            if (leg)
              leg.rotation.x = reducedMotion
                ? 0
                : Math.sin(visualTime * 9 + (i % 2) * Math.PI) * 0.25;
          }
        }
      }
      for (const b of state.buildings) {
        const distance = Math.hypot(b.x - state.player.x, b.z - state.player.z);
        let mesh = buildingMeshes.get(b.id);
        if (mesh && mesh.userData.buildingKind !== b.kind) {
          mesh.removeFromParent();
          world.disposeModel(mesh);
          buildingMeshes.delete(b.id);
          mesh = undefined;
        }
        if (!mesh && distance < visibleRadius + 10)
          mesh = modelFor(buildingMeshes, b.id, () =>
            world.createStructure(b.kind, b.x, b.z),
          );
        if (mesh) {
          mesh.position.set(b.x, world.groundHeight(b.x, b.z), b.z);
          mesh.rotation.y = b.rotation;
          mesh.visible = distance < visibleRadius + 10;
          mesh.userData.buildingKind = b.kind;
          world.updateBuilding(mesh, b, state.endgame.raftStage);
          updateUpgrades(mesh, b);
        }
      }
      removeMissing(buildingMeshes, new Set(state.buildings.map((b) => b.id)));

      for (const [name, sign] of [
        ["legL", 1],
        ["legR", -1],
        ["armL", -1],
        ["armR", 1],
      ] as const) {
        const limb = player.getObjectByName(name);
        if (limb)
          limb.rotation.x =
            (moving && interactive && !reducedMotion
              ? Math.sin(visualTime * 13) * 0.55 * sign
              : 0) + (name === "armR" ? attackAnimation * 6 : 0);
      }
      const pose = state.adventure.actionPose.kind;
      if (state.adventure.location === "sea")
        player.position.y = 1 + Math.sin(visualTime * 1.6) * 0.1;
      else if (pose === "sit" || pose === "cook" || state.adventure.sneaking) {
        player.position.y -= 0.35;
        for (const name of ["legL", "legR"]) {
          const leg = player.getObjectByName(name);
          if (leg) leg.rotation.x = -1.2;
        }
      }
      player.rotation.z = pose === "sleep" ? Math.PI / 2 : 0;
      attackAnimation = Math.max(0, attackAnimation - dt);
      playerTorch.intensity = (state.equipment.tools.torch ?? 0) > 0 ? 7 : 0;
      syncEquipment();
      const prompt = getPrompt(state);
      const target = prompt.id
        ? resourceMeshes.get(prompt.id) ||
          animalMeshes.get(prompt.id) ||
          buildingMeshes.get(prompt.id)
        : null;
      ring.visible = interactive && !!prompt.id;
      if (target)
        ring.position.set(
          target.position.x,
          target.position.y + 0.1,
          target.position.z,
        );
      else if (prompt.id === "spring")
        ring.position.set(
          SPRING.x,
          world.groundHeight(SPRING.x, SPRING.z) + 0.1,
          SPRING.z,
        );
      else if (prompt.id?.startsWith("fish")) {
        const spot = FISHING_SPOTS.reduce((a, b) =>
          Math.hypot(a.x - state.player.x, a.z - state.player.z) <
          Math.hypot(b.x - state.player.x, b.z - state.player.z)
            ? a
            : b,
        );
        ring.position.set(
          spot.x,
          world.groundHeight(spot.x, spot.z) + 0.1,
          spot.z,
        );
      } else {
        const node = EXPEDITIONS.find((n) => n.id === prompt.id);
        const secret = SECRETS.find((n) => n.id === prompt.id);
        const spot = node ?? (secret ? getSecretPosition(state, secret) : null);
        if (spot)
          ring.position.set(
            spot.x,
            world.groundHeight(spot.x, spot.z) + 0.13,
            spot.z,
          );
        else ring.visible = false;
      }
      adventure.update(state, visualTime, reducedMotion);
    }
    let equipmentKey = "";
    function syncEquipment() {
      const next =
        state.equipment.active ??
        (state.equipment.tools.improvedSpear
          ? "improvedSpear"
          : state.equipment.tools.spear
            ? "spear"
            : "");
      if (next === equipmentKey) return;
      equipmentKey = next;
      const old = player.getObjectByName("held-tool");
      if (old) {
        old.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        old.removeFromParent();
      }
      if (!next) return;
      const group = new THREE.Group();
      group.name = "held-tool";
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.04, 1.75, 5),
        new THREE.MeshStandardMaterial({ color: 0x76523d }),
      );
      shaft.position.y = 0.75;
      group.add(shaft);
      const blade = new THREE.Mesh(
        next.toLowerCase().includes("axe")
          ? new THREE.BoxGeometry(0.45, 0.32, 0.08)
          : new THREE.ConeGeometry(0.12, 0.38, 4),
        new THREE.MeshStandardMaterial({ color: 0xafc2c0, flatShading: true }),
      );
      blade.position.y = 1.72;
      group.add(blade);
      group.position.set(0.47, 0.35, 0.2);
      group.rotation.x = 0.35;
      player.add(group);
    }
    function collision() {
      if (state.adventure.location !== "home") return;
      for (const c of world.colliders) {
        const dx = state.player.x - c.x,
          dz = state.player.z - c.z,
          d = Math.hypot(dx, dz),
          minimum = c.radius + 0.38;
        if (d < minimum && d > 0.001) {
          state.player.x = c.x + (dx / d) * minimum;
          state.player.z = c.z + (dz / d) * minimum;
        }
      }
    }

    this.sync = (next, dt, flags) => {
      state = next;
      visualTime = flags.time;
      moving = flags.moving;
      interactive = flags.interactive;
      reducedMotion = flags.reducedMotion;
      syncScene(dt);
    };
    this.focus = (x, z) => cameraTarget.set(x, world.groundHeight(x, z), z);
    this.reset = (next) => {
      state = next;
      clearDynamic();
      equipmentKey = "__reset__";
      syncEquipment();
      attackAnimation = 0;
      shake = 0;
      this.focus(state.player.x, state.player.z);
    };
    this.burst = burst;
    this.attack = () => {
      attackAnimation = 0.28;
    };
    this.hit = () => {
      shake = 0.18;
    };
    this.collide = (next) => {
      state = next;
      collision();
    };
    this.canBuild = (x, z) =>
      !world.colliders.some(
        (c) => Math.hypot(x - c.x, z - c.z) < c.radius + 1.3,
      );
    this.repairResources = (next) =>
      repairResourcePositions(next, world.colliders);
    this.metrics = () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
    });
    this.render = (next, dt, flags) => {
      state = next;
      visualTime = flags.time;
      reducedMotion = flags.reducedMotion;
      const { active, title, frozen } = flags;
      // Apply weather/culling even on the first frozen QA frame, without
      // advancing particles or simulation time.
      world.update(
        !frozen && (active || title) ? dt : 0,
        reducedMotion ? 0 : visualTime,
        state.weather.kind,
        player.position,
      );
      for (const p of particlePool)
        if (p.life > 0 && active) {
          p.life -= dt;
          p.vy -= dt * 8;
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;
          p.mesh.scale.setScalar(Math.max(0, p.life / 0.6));
          p.mesh.visible = p.life > 0;
        }
      const look = title
        ? new THREE.Vector3(START.x + 3, 0, START.z - 8)
        : player.position;
      cameraTarget.lerp(look, 1 - Math.exp(-dt * 5));
      camera.position.copy(cameraTarget).add(cameraOffset);
      if (shake > 0 && !reducedMotion) {
        camera.position.x += Math.sin(visualTime * 70) * shake;
        shake = Math.max(0, shake - dt);
      }
      camera.lookAt(cameraTarget);
      const cycle = state.cycle;
      const night = Math.max(
        1 - THREE.MathUtils.smoothstep(cycle, 0.17, 0.27),
        THREE.MathUtils.smoothstep(cycle, 0.7, 0.8),
      );
      const weatherDim =
        state.weather.kind === "storm"
          ? 0.48
          : state.weather.kind === "rain"
            ? 0.7
            : state.weather.kind === "cloudy"
              ? 0.87
              : 1;
      if (sun) {
        sun.intensity = THREE.MathUtils.lerp(3.1, 0.6, night) * weatherDim;
        sun.color.copy(baseSun).lerp(moon, night);
        sun.position.set(state.player.x - 24, 40, state.player.z + 18);
        sun.target.position.set(state.player.x, 0, state.player.z);
        if (!sun.target.parent) scene.add(sun.target);
      }
      if (sky)
        sky.intensity = THREE.MathUtils.lerp(2.15, 0.85, night) * weatherDim;
      renderer.toneMappingExposure = THREE.MathUtils.lerp(1.1, 0.66, night);

      renderer.render(scene, camera);
    };
  }
}
