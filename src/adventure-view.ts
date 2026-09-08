import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { GameState, BuildingState } from "./types";
import { getSecretPosition, getTide } from "./adventure";
import { EXPEDITIONS, ISLETS, SECRETS } from "./adventure-content";

/** Local, baked prop kit. Every site is one draw call; all repeated life is instanced. */
const geometry = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rock: new THREE.IcosahedronGeometry(1, 0),
  pole: new THREE.CylinderGeometry(0.85, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 7),
};
const surface = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.91,
  flatShading: true,
  side: THREE.DoubleSide,
});
const colors = {
  wood: 0x99724d,
  dark: 0x433c38,
  cloth: 0xc7bb91,
  white: 0xe5e0c6,
  red: 0xa75740,
  rock: 0x768581,
  gold: 0xf0bd5c,
  green: 0x59806b,
};
type Shape = keyof typeof geometry;
class Kit {
  parts: THREE.BufferGeometry[] = [];
  add(
    shape: Shape,
    color: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const clone = geometry[shape].clone();
    const g = clone.index ? clone.toNonIndexed() : clone;
    if (g !== clone) clone.dispose();
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    );
    g.applyMatrix4(transform);
    const c = new THREE.Color(color),
      a = new Float32Array(g.getAttribute("position").count * 3);
    for (let i = 0; i < a.length; i += 3) {
      a[i] = c.r;
      a[i + 1] = c.g;
      a[i + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    this.parts.push(g);
    return this;
  }
  finish() {
    const g = mergeGeometries(this.parts)!;
    this.parts.forEach((p) => p.dispose());
    g.userData.modelOwned = true;
    const mesh = new THREE.Mesh(g, surface);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
export function islandGround(x: number, z: number): number | null {
  for (const isle of ISLETS) {
    if (isle.id === "home") continue;
    const d = Math.hypot(x - isle.x, z - isle.z);
    if (d < isle.radius + 5) {
      const rise = THREE.MathUtils.smoothstep(isle.radius - d, 0, 7);
      return (
        0.15 +
        rise * (isle.id === "ember" ? 2.2 : 1.05) +
        Math.max(0, 1 - d / (isle.radius * 0.75)) *
          (isle.id === "ember" ? 5 : isle.id === "lighthouse" ? 2 : 1)
      );
    }
  }
  return null;
}
export function updateUpgrades(root: THREE.Group, b: BuildingState) {
  const key = `${b.level ?? 0}:${b.reinforced ?? false}:${(b.decorations ?? []).join(",")}`;
  if (root.userData.upgradeKey === key) return;
  root.userData.upgradeKey = key;
  const old = root.getObjectByName("upgrades");
  if (old) {
    old.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    old.removeFromParent();
  }
  const k = new Kit(),
    level = b.level ?? 0;
  if (level > 0 && (b.kind === "cabin" || b.kind === "shelter")) {
    for (let i = 0; i < 8; i++)
      k.add(
        "box",
        i % 2 ? colors.wood : 0xae8459,
        -1.9 + i * 0.55,
        0.2,
        2.7,
        0.5,
        0.22,
        2.1,
      );
    for (const x of [-2.2, 2.2]) {
      k.add("pole", colors.dark, x, 1.55, 3.5, 0.1, 2.8, 0.1);
      k.add("box", colors.wood, x, 0.9, 2.7, 0.12, 0.12, 2.1);
    }
    k.add("box", colors.wood, 0, 0.08, 4.1, 2.4, 0.16, 0.65);
  }
  if (level > 1 && (b.kind === "cabin" || b.kind === "shelter")) {
    k.add("box", colors.cloth, 0, 3.1, 2.6, 5, 0.18, 2.9, -0.08);
    for (const x of [-2.3, 2.3])
      k.add("box", colors.dark, x, 2.3, 3.4, 0.1, 1.6, 0.1);
    k.add("box", colors.red, 0, 3.28, 3.75, 5, 0.23, 0.18);
  }
  if (b.reinforced || level === 3) {
    for (const x of [-1.8, 1.8])
      k.add("box", colors.dark, x, 1, 0, 0.14, 2.4, 0.14, 0, 0, x * 0.17);
  }
  for (const decoration of b.decorations ?? []) {
    if (decoration === "lantern") {
      k.add("pole", colors.dark, 2.7, 1.8, 1.8, 0.08, 3.6, 0.08);
      k.add("box", colors.dark, 2.7, 3.4, 1.8, 0.7, 0.12, 0.7);
      k.add("box", colors.gold, 2.7, 3, 1.8, 0.4, 0.6, 0.4);
      k.add("cone", colors.dark, 2.7, 3.65, 1.8, 0.55, 0.45, 0.55);
    }
    if (decoration === "shelf") {
      for (const y of [0.3, 1, 1.7])
        k.add("box", colors.wood, -2.2, y, 0.4, 0.8, 0.12, 1.8);
      for (let i = 0; i < 4; i++)
        k.add(
          "rock",
          i % 2 ? colors.gold : colors.green,
          -2.2,
          0.55 + (i % 2) * 0.7,
          -0.1 + Math.floor(i / 2) * 0.8,
          0.23,
          0.3,
          0.23,
        );
    }
    if (decoration === "trophy") {
      k.add("box", colors.wood, 0, 1.7, -1.8, 1.2, 1.3, 0.14);
      k.add("rock", colors.white, 0, 1.9, -1.55, 0.4, 0.5, 0.28);
      for (const x of [-0.5, 0.5])
        k.add("pole", colors.white, x, 2.35, -1.5, 0.08, 1, 0.08, 0, 0, x);
    }
  }
  if (k.parts.length) {
    const mesh = k.finish();
    mesh.name = "upgrades";
    root.add(mesh);
  }
}
export class AdventureView {
  private sites: {
    mesh: THREE.Object3D;
    id: string;
    quest: string;
    step: number;
  }[] = [];
  private lands: THREE.Mesh[] = [];
  private boat: THREE.Group;
  private projectiles: THREE.InstancedMesh;
  private crabs: THREE.InstancedMesh;
  private birds: THREE.InstancedMesh;
  private lights: THREE.InstancedMesh;
  private wake: THREE.InstancedMesh;
  private waveCrests: THREE.InstancedMesh;
  private secrets: THREE.InstancedMesh;
  private tracks: THREE.InstancedMesh;
  private trail: { x: number; z: number; heading: number; time: number }[] = [];
  private lastState: GameState | null = null;
  private lastTrack = new Map<string, { x: number; z: number }>();
  private dummy = new THREE.Object3D();
  constructor(
    private scene: THREE.Scene,
    private height: (x: number, z: number) => number,
  ) {
    for (const isle of ISLETS) {
      if (isle.id === "home") continue;
      const k = new Kit(),
        radius = isle.radius;
      // Triangulated rings retain a broad, walkable beach and faceted interior.
      const pos: number[] = [],
        cols: number[] = [],
        c = new THREE.Color();
      for (let ring = 0; ring < 12; ring++)
        for (let j = 0; j < 64; j++) {
          const point = (r: number, a: number) => {
            const x = isle.x + Math.cos(a) * r,
              z = isle.z + Math.sin(a) * r;
            return [x, islandGround(x, z) ?? -0.5, z];
          };
          const a = (j * Math.PI) / 32,
            b = ((j + 1) * Math.PI) / 32,
            r1 = (ring * (radius + 3)) / 12,
            r2 = ((ring + 1) * (radius + 3)) / 12;
          for (const p of [
            point(r1, a),
            point(r2, a),
            point(r1, b),
            point(r1, b),
            point(r2, a),
            point(r2, b),
          ]) {
            pos.push(...p);
            c.setHex(
              ring > 9
                ? 0xe7d7b2
                : isle.id === "ember"
                  ? 0x687372
                  : isle.id === "reef"
                    ? 0x8dab78
                    : 0x809574,
            ).multiplyScalar(0.94 + (j % 3) * 0.035);
            cols.push(c.r, c.g, c.b);
          }
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      g.computeVertexNormals();
      const land = new THREE.Mesh(g, surface);
      land.receiveShadow = true;
      scene.add(land);
      this.lands.push(land);
      for (let j = 0; j < 18; j++) {
        const a = j * 2.399,
          d = radius * (0.3 + (j % 5) * 0.105),
          x = Math.cos(a) * d,
          z = Math.sin(a) * d,
          y = height(isle.x + x, isle.z + z);
        if (isle.id === "ember")
          k.add(
            "rock",
            j % 2 ? 0x515d5d : 0x8d6650,
            x,
            y + 1,
            z,
            1.2 + (j % 3),
            1.8 + (j % 4),
            1.4,
          );
        else {
          k.add("pole", colors.wood, x, y + 2, z, 0.17, 4, 0.17, 0, 0, 0.15);
          for (let l = 0; l < 4; l++)
            k.add(
              "rock",
              j % 2 ? 0x77975e : colors.green,
              x + Math.cos(l * 1.57),
              y + 4,
              z + Math.sin(l * 1.57),
              1.8,
              0.22,
              1,
              0,
              l * 1.57,
              0.12,
            );
        }
      }
      for (let j = 0; j < 12; j++) {
        const a = (j * Math.PI) / 6;
        k.add(
          "rock",
          isle.id === "reef" ? 0x64a6a0 : 0x647b7b,
          Math.cos(a) * (radius + 4),
          -0.05,
          Math.sin(a) * (radius + 4),
          2,
          0.65,
          1.5,
        );
      }
      const prop = k.finish();
      prop.position.set(isle.x, 0, isle.z);
      scene.add(prop);
      this.lands.push(prop);
      const dock = new Kit();
      for (let j = 0; j < 7; j++)
        dock.add("box", colors.wood, 0, 0.45, j * 0.48, 2.3, 0.18, 0.4);
      for (const x of [-1, 1])
        dock.add("pole", colors.dark, x, 0.65, 2.7, 0.12, 2, 0.12);
      const dm = dock.finish();
      dm.position.set(isle.dock.x, 0, isle.dock.z);
      scene.add(dm);
      this.lands.push(dm);
    }
    for (const n of EXPEDITIONS) {
      const k = new Kit();
      if (n.step === 0) {
        const q = n.id.toLowerCase();
        if (q.includes("light")) {
          for (let y = 0; y < 6; y++)
            k.add(
              "pole",
              y % 2 ? colors.red : colors.white,
              0,
              y * 1.8 + 0.9,
              0,
              2.3 - y * 0.14,
              1.8,
              2.3 - y * 0.14,
            );
          k.add("pole", colors.dark, 0, 11, 0, 2.5, 0.3, 2.5);
          k.add("pole", colors.gold, 0, 11.8, 0, 1.5, 1.3, 1.5);
          k.add("cone", colors.dark, 0, 13, 0, 2.4, 1.6, 2.4);
          k.add("box", colors.dark, 0, 1, 2.05, 0.8, 1.8, 0.15);
        } else if (q.includes("cave")) {
          for (const x of [-3, 3])
            k.add("rock", colors.rock, x, 2, 0, 1.8, 3.2, 2);
          k.add("rock", colors.rock, 0, 4.7, 0, 3.3, 1.1, 2);
          k.add("box", 0x324d50, 0, 0.07, -1, 5, 0.12, 4);
          k.add("box", colors.wood, -2, 0.2, 3, 1.6, 0.2, 0.8, 0, 0.3);
        } else if (q.includes("wreck") || q.includes("wrack")) {
          for (let j = 0; j < 5; j++)
            k.add(
              "box",
              j % 2 ? colors.dark : colors.wood,
              -2 + j,
              0.5 + j * 0.15,
              0,
              0.7,
              0.3,
              4 - j * 0.35,
              0,
              0.15 * j,
              0.1,
            );
          k.add("pole", colors.dark, 1, 2.8, 0, 0.14, 5, 0.14, 0, 0, 0.5);
          k.add("box", colors.white, -1, 0.8, 2, 1, 0.65, 0.7);
        } else if (q.includes("reef")) {
          for (let i = 0; i < 7; i++) {
            const a = (i * Math.PI) / 3.5;
            k.add(
              "pole",
              colors.white,
              Math.cos(a) * 3,
              1.4,
              Math.sin(a) * 3,
              0.3,
              2.8,
              0.3,
            );
            k.add(
              "box",
              colors.white,
              Math.cos(a) * 3,
              2.9,
              Math.sin(a) * 3,
              0.9,
              0.25,
              0.9,
            );
          }
          k.add("pole", colors.rock, 0, 0.45, 0, 1.7, 0.7, 1.7);
          k.add("pole", colors.gold, 0, 1.1, 0, 0.6, 0.7, 0.6);
          k.add("cone", 0x81c4bd, 0, 1.7, 0, 0.7, 0.7, 0.7);
        } else if (q.includes("ember")) {
          k.add("box", colors.dark, 0, 1, 0, 3, 2, 2.5);
          k.add("pole", colors.rock, 1, 3, -0.5, 0.65, 4, 0.65);
          k.add("box", 0x222d2d, 0, 1, 1.3, 1.4, 1.3, 0.12);
          k.add("box", 0xb17c49, 0, 0.5, 1.38, 1.1, 0.25, 0.12);
          k.add("box", colors.rock, -2, 0.8, 1, 1.8, 0.5, 0.9);
          k.add("box", colors.dark, -2, 0.3, 1, 0.7, 0.7, 0.7);
        } else if (q.includes("peak")) {
          k.add("pole", colors.dark, 0, 2.5, 0, 0.14, 5, 0.14);
          k.add("box", colors.wood, 0, 3, 0, 4, 0.1, 0.14);
          k.add("box", colors.red, 1.7, 3.3, 0, 0.5, 0.5, 0.1);
          for (const x of [-1, 1])
            k.add(
              "cone",
              colors.white,
              x,
              4.8,
              0,
              0.45,
              0.5,
              0.45,
              Math.PI / 2,
            );
          k.add("box", colors.white, 1.4, 1.3, 1, 1.2, 1.1, 0.7);
          for (let j = 0; j < 5; j++)
            k.add(
              "box",
              colors.dark,
              1.4,
              0.9 + j * 0.19,
              1.37,
              1.1,
              0.035,
              0.05,
            );
        } else if (q.includes("marsh")) {
          for (let j = 0; j < 10; j++)
            k.add(
              "box",
              colors.wood,
              0,
              0.3,
              j * 0.45 - 2,
              2,
              0.14,
              0.38,
              0,
              j * 0.012,
            );
          for (const x of [-1.1, 1.1])
            for (const z of [-2, 2])
              k.add("pole", colors.dark, x, 0.5, z, 0.14, 2.5, 0.14);
          k.add("box", colors.dark, 1.5, 0.25, 1, 1, 0.6, 1, 0, 0.3, 0.15);
        } else if (q.includes("shore")) {
          k.add("rock", colors.rock, 0, 0.16, 0, 0.9, 0.2, 0.6);
          k.add("pole", 0x548b73, 0, 0.38, 0, 0.14, 0.6, 0.14, 0, 0, 1.1);
          k.add("box", colors.cloth, 0, 0.52, 0, 0.23, 0.1, 0.16);
          for (let j = 0; j < 3; j++)
            k.add(
              "box",
              colors.wood,
              1 + j * 0.3,
              0.15,
              -1,
              1.6,
              0.15,
              0.2,
              0,
              j * 0.7,
            );
        } else {
          for (const x of [-2.4, 2.4])
            k.add("pole", colors.wood, x, 1.65, 0, 0.1, 3.3, 0.1);
          k.add(
            "box",
            q.includes("jungle") ? 0x678c82 : colors.cloth,
            0,
            3,
            0,
            5,
            0.13,
            3,
            0,
            0,
            0.1,
          );
          k.add("box", colors.wood, -1, 0.8, 0.4, 2, 0.16, 1.3);
          for (const x of [-1.7, -0.3])
            k.add("pole", colors.dark, x, 0.4, 0.4, 0.08, 0.8, 0.08);
          k.add("box", colors.dark, 1, 0.4, -0.5, 1, 0.8, 0.8);
          k.add("box", colors.white, -1, 0.94, 0.4, 0.6, 0.05, 0.5, 0, 0.3);
          k.add("pole", colors.rock, 2, 1, -1, 0.3, 2, 0.3);
        }
      } else {
        k.add("rock", colors.rock, 0, 0.2, 0, 0.8, 0.35, 0.7);
        k.add("box", colors.wood, 0, 0.55, 0, 0.95, 0.55, 0.7);
        k.add("box", colors.white, 0, 0.85, 0, 0.65, 0.05, 0.4, 0, 0.2);
        k.add("pole", colors.gold, 0.65, 1.1, 0, 0.06, 2.2, 0.06);
        k.add("box", colors.red, 0.9, 1.9, 0, 0.55, 0.3, 0.05);
      }
      const mesh = k.finish();
      const offset = n.step === 0 && n.id !== "shore-1" ? -3 : 0;
      mesh.position.set(n.x, height(n.x, n.z + offset), n.z + offset);
      scene.add(mesh);
      this.sites.push({ mesh, id: n.id, quest: n.quest, step: n.step });
    }
    const track = new Kit()
      .add("box", 0x776849, -0.17, 0.01, 0, 0.12, 0.02, 0.24)
      .add("box", 0x776849, 0.17, 0.01, 0.18, 0.12, 0.02, 0.24)
      .finish();
    this.tracks = new THREE.InstancedMesh(track.geometry, surface, 64);
    this.tracks.frustumCulled = false;
    scene.add(this.tracks);
    const cache = new Kit()
      .add("rock", colors.rock, -0.38, 0.08, 0, 0.18, 0.12, 0.18)
      .add("rock", colors.rock, 0.3, 0.08, 0.3, 0.16, 0.1, 0.2)
      .add("box", colors.gold, 0, 0.06, 0, 0.65, 0.035, 0.1, 0, 0.6)
      .add("box", colors.gold, 0, 0.06, 0, 0.65, 0.035, 0.1, 0, -0.6)
      .finish();
    this.secrets = new THREE.InstancedMesh(
      cache.geometry,
      surface,
      SECRETS.length,
    );
    this.secrets.frustumCulled = false;
    scene.add(this.secrets);
    this.boat = new THREE.Group();
    const k = new Kit();
    for (let j = 0; j < 6; j++)
      k.add(
        "pole",
        j % 2 ? colors.wood : 0xb58a55,
        -2 + j * 0.8,
        0.25,
        0,
        0.42,
        6,
        0.42,
        Math.PI / 2,
      );
    for (const z of [-2, 2])
      k.add("box", colors.dark, 0, 0.65, z, 5, 0.18, 0.22);
    for (let j = 0; j < 11; j++)
      k.add("box", colors.wood, 0, 0.72, -2.5 + j * 0.5, 4.6, 0.16, 0.43);
    k.add("pole", colors.dark, 0, 3.7, -0.5, 0.12, 6, 0.12);
    k.add(
      "pole",
      colors.wood,
      0,
      5.9,
      -0.5,
      0.08,
      4.3,
      0.08,
      0,
      0,
      Math.PI / 2,
    );
    k.add("box", colors.cloth, 0, 4.4, -0.55, 3.9, 2.9, 0.06, 0, 0.04);
    k.add("box", colors.red, -1.45, 4.4, -0.59, 0.22, 2.9, 0.04);
    k.add("box", colors.dark, 1.5, 1.2, 1.4, 1, 0.8, 1);
    k.add("pole", colors.gold, -1.8, 1.3, 1.6, 0.3, 0.7, 0.3);
    this.boat.add(k.finish());
    scene.add(this.boat);
    const projectile = new Kit()
      .add("pole", colors.wood, 0, 0, 0, 0.035, 2.3, 0.035, Math.PI / 2)
      .add("cone", colors.white, 0, 0, 1.3, 0.12, 0.4, 0.12, Math.PI / 2)
      .finish();
    this.projectiles = new THREE.InstancedMesh(
      projectile.geometry,
      surface,
      16,
    );
    scene.add(this.projectiles);
    const crab = new Kit().add("rock", 0xc57650, 0, 0.16, 0, 0.23, 0.13, 0.16);
    for (let i = 0; i < 6; i++)
      crab.add(
        "box",
        0xb56948,
        (i % 2 ? 1 : -1) * 0.24,
        0.1,
        Math.floor(i / 2) * 0.13 - 0.13,
        0.2,
        0.055,
        0.055,
        0,
        (i % 2 ? 1 : -1) * 0.3,
      );
    const cm = crab.finish();
    this.crabs = new THREE.InstancedMesh(cm.geometry, surface, 18);
    scene.add(this.crabs);
    const bird = new Kit()
      .add("rock", colors.white, 0, 0, 0, 0.14, 0.12, 0.45)
      .add("box", colors.white, 0, 0, 0, 1.1, 0.06, 0.27)
      .finish();
    this.birds = new THREE.InstancedMesh(bird.geometry, surface, 12);
    scene.add(this.birds);
    this.lights = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.065, 0),
      new THREE.MeshBasicMaterial({ color: 0xf4e9a0 }),
      40,
    );
    scene.add(this.lights);
    this.wake = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xd0f2e5,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      18,
    );
    scene.add(this.wake);
    this.waveCrests = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xb8e4d7,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      64,
    );
    this.waveCrests.frustumCulled = false;
    scene.add(this.waveCrests);
    for (const mesh of [
      this.projectiles,
      this.crabs,
      this.birds,
      this.lights,
      this.wake,
    ])
      mesh.frustumCulled = false;
  }
  update(s: GameState, time: number, reduced: boolean) {
    if (this.lastState !== s) {
      this.trail = [];
      this.lastTrack.clear();
      this.lastState = s;
    }
    const p = s.player,
      sea = s.adventure.location === "sea",
      d = this.dummy;
    for (const animal of s.animals) {
      const old = this.lastTrack.get(animal.id);
      if (!old || Math.hypot(old.x - animal.x, old.z - animal.z) > 1.1) {
        if (
          old &&
          animal.hp > 0 &&
          Math.hypot(old.x - animal.x, old.z - animal.z) < 4
        )
          this.trail.push({
            x: animal.x,
            z: animal.z,
            heading: animal.heading,
            time,
          });
        this.lastTrack.set(animal.id, { x: animal.x, z: animal.z });
      }
    }
    this.trail = this.trail.filter((t) => time - t.time < 18).slice(-64);
    this.tracks.count = this.trail.length;
    this.trail.forEach((t, i) => {
      d.position.set(t.x, this.height(t.x, t.z) + 0.025, t.z);
      d.rotation.set(0, t.heading, 0);
      d.scale.setScalar(
        Math.hypot(t.x - p.x, t.z - p.z) < 40
          ? Math.min(1, (18 - time + t.time) / 4) *
              (s.adventure.sneaking ? 1.5 : 1)
          : 0,
      );
      d.updateMatrix();
      this.tracks.setMatrixAt(i, d.matrix);
    });
    this.tracks.instanceMatrix.needsUpdate = true;
    SECRETS.forEach((secret, i) => {
      const spot = getSecretPosition(s, secret),
        visible =
          !s.adventure.secrets.includes(secret.id) &&
          Math.hypot(spot.x - p.x, spot.z - p.z) < 36 &&
          (secret.condition === "always" ||
            (secret.condition === "low-tide" && getTide(s) < 0.35) ||
            (secret.condition === "night" &&
              (s.cycle < 0.23 || s.cycle > 0.74)) ||
            (secret.condition === "after-storm" &&
              s.adventure.storm.count > 0));
      d.position.set(spot.x, this.height(spot.x, spot.z) + 0.06, spot.z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(visible ? 1 : 0);
      d.updateMatrix();
      this.secrets.setMatrixAt(i, d.matrix);
    });
    this.secrets.instanceMatrix.needsUpdate = true;
    for (const site of this.sites) {
      site.mesh.visible =
        Math.hypot(site.mesh.position.x - p.x, site.mesh.position.z - p.z) < 65;
      site.mesh.scale.setScalar(
        (s.adventure.quests[site.quest] ?? 0) > site.step ? 0.92 : 1,
      );
    }
    const island = ISLETS.find((i) => i.id === s.adventure.location);
    const dock = island?.dock ?? s.adventure.voyage.homeDock;
    const cx = island?.x ?? 0,
      cz = island?.z ?? 0;
    const length = Math.hypot(dock.x - cx, dock.z - cz) || 1;
    const radius = (island?.radius ?? 96) + 2;
    const anchorX = cx + ((dock.x - cx) / length) * radius,
      anchorZ = cz + ((dock.z - cz) / length) * radius;
    this.boat.visible =
      s.adventure.voyage.unlocked &&
      (sea || Math.hypot(anchorX - p.x, anchorZ - p.z) < 65);
    this.boat.position.set(
      sea ? p.x : anchorX,
      0.12 + (reduced ? 0 : Math.sin(time * 1.6) * 0.1),
      sea ? p.z : anchorZ,
    );
    this.boat.rotation.set(
      reduced ? 0 : Math.sin(time * 1.2) * 0.025,
      sea ? s.adventure.voyage.heading : Math.atan2(dock.x - cx, dock.z - cz),
      reduced ? 0 : Math.cos(time) * 0.035,
    );
    this.projectiles.count = Math.min(16, s.adventure.projectiles.length);
    s.adventure.projectiles.slice(0, 16).forEach((v, i) => {
      d.position.set(v.x, v.y + 1, v.z);
      d.rotation.set(0, Math.atan2(v.vx, v.vz), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.projectiles.setMatrixAt(i, d.matrix);
    });
    this.projectiles.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 18; i++) {
      const a = i * 2.399,
        x = Math.cos(a) * 88,
        z = Math.sin(a) * 88;
      d.position.set(
        x + (reduced ? 0 : Math.sin(time * 0.6 + i) * 0.8),
        this.height(x, z) + 0.03,
        z,
      );
      d.rotation.set(0, a, 0);
      d.scale.setScalar(Math.hypot(x - p.x, z - p.z) < 44 ? 1 : 0);
      d.updateMatrix();
      this.crabs.setMatrixAt(i, d.matrix);
    }
    this.crabs.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 12; i++) {
      const wet = s.weather.kind === "rain" || s.weather.kind === "storm",
        a = i * 0.8 + (reduced ? 0 : time * 0.14);
      d.position.set(
        -16 + Math.cos(a) * (4 + (i % 3)),
        this.height(-16, 44) + (wet ? 0.15 : 3 + Math.sin(a) * 0.7),
        44 + Math.sin(a) * (4 + (i % 3)),
      );
      d.rotation.set(0, -a, wet ? 0 : Math.sin(time * 8 + i) * 0.22);
      d.scale.setScalar(Math.hypot(p.x + 16, p.z - 44) < 48 ? 1 : 0);
      d.updateMatrix();
      this.birds.setMatrixAt(i, d.matrix);
    }
    this.birds.instanceMatrix.needsUpdate = true;
    this.lights.visible = s.cycle < 0.23 || s.cycle > 0.74;
    for (let i = 0; i < 40; i++) {
      const x = 20 + Math.sin(i * 7.3) * 24,
        z = 5 + Math.cos(i * 4.1) * 26;
      d.position.set(
        x + Math.sin(time * 0.4 + i),
        this.height(x, z) + 1.1 + Math.sin(time + i) * 0.5,
        z,
      );
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(
        Math.hypot(x - p.x, z - p.z) < 40
          ? 0.7 + 0.3 * Math.sin(time * 2 + i)
          : 0,
      );
      d.updateMatrix();
      this.lights.setMatrixAt(i, d.matrix);
    }
    this.lights.instanceMatrix.needsUpdate = true;
    this.waveCrests.visible = sea;
    for (let i = 0; i < 64; i++) {
      const x = Math.floor(p.x / 8) * 8 + ((i % 8) - 4) * 8,
        z =
          Math.floor(p.z / 8) * 8 +
          (Math.floor(i / 8) - 4) * 8 +
          Math.sin(i * 3.7) * 2,
        phase = time * 0.65 + i * 1.7;
      d.position.set(
        x + Math.sin(phase) * 0.6,
        0.18,
        z + Math.sin(phase) * 0.2,
      );
      d.rotation.set(-Math.PI / 2, 0, -0.35);
      d.scale.set(
        1.5 + Math.sin(phase) * 0.5,
        0.07 + Math.max(0, Math.sin(phase)) * 0.035,
        1,
      );
      d.updateMatrix();
      this.waveCrests.setMatrixAt(i, d.matrix);
    }
    this.waveCrests.instanceMatrix.needsUpdate = true;
    this.wake.visible = sea && s.adventure.voyage.speed > 0.1;
    for (let i = 0; i < 18; i++) {
      const length = 2 + (i % 9) * 0.8,
        side = i < 9 ? -1 : 1,
        a = s.adventure.voyage.heading;
      d.position.set(
        p.x - Math.sin(a) * length + Math.cos(a) * side * (2 + length * 0.12),
        0.17,
        p.z - Math.cos(a) * length - Math.sin(a) * side * (2 + length * 0.12),
      );
      d.rotation.set(-Math.PI / 2, 0, -a);
      d.scale.set(0.12 + length * 0.035, 0.9, 1);
      d.updateMatrix();
      this.wake.setMatrixAt(i, d.matrix);
    }
    this.wake.instanceMatrix.needsUpdate = true;
  }
}
