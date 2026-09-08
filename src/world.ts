import * as THREE from "three";
import { islandGround } from "./adventure-view";
import { EXPEDITIONS } from "./adventure-content";
import type {
  ResourceKind,
  BuildingKind,
  BuildingState,
  WeatherKind,
} from "./types";
import { regionAt, FISHING_SPOTS } from "./locations";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A small, authored tropical world. All factory roots face +Z. */
export function createWorld(scene: THREE.Scene) {
  const palette = {
    bark: 0x725442,
    barkLight: 0x9a7551,
    leaf: 0x527955,
    leafLight: 0x7f9c59,
    rock: 0x91958a,
    rockLight: 0xb0b2a0,
    sand: 0xe9d3a1,
    wood: 0xb68751,
    fruit: 0xdd7256,
    charcoal: 0x393e39,
    rope: 0xd5bd85,
    skin: 0xd79c70,
    shirt: 0xf2bb52,
    pants: 0x345360,
    leather: 0x82533f,
    white: 0xfff4d2,
  };
  const mats = Object.fromEntries(
    Object.entries(palette).map(([k, c]) => [
      k,
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.93,
        flatShading: true,
      }),
    ]),
  ) as Record<keyof typeof palette, THREE.MeshStandardMaterial>;
  const geometries = {
    ball: new THREE.IcosahedronGeometry(1, 0),
    box: new THREE.BoxGeometry(1, 1, 1),
    pole: new THREE.CylinderGeometry(0.85, 1, 1, 7),
    cone: new THREE.ConeGeometry(1, 1, 6),
  };
  const resourceMaterial = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    vertexColors: true,
    flatShading: true,
    roughness: 0.93,
  });
  let seed = 9307;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const decor = new THREE.Group();
  const colliders: Array<{ x: number; z: number; radius: number }> = [];
  function mesh(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = sx,
    sz = sx,
  ) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function pole(
    parent: THREE.Object3D,
    a: THREE.Vector3,
    b: THREE.Vector3,
    r: number,
    mat = mats.bark,
  ) {
    const m = mesh(
      parent,
      geometries.pole,
      mat,
      0,
      0,
      0,
      r,
      a.distanceTo(b),
      r,
    );
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    return m;
  }
  function groundHeight(x: number, z: number) {
    const island = islandGround(x, z);
    if (island !== null) return island;
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const edge = 94 + 2 * Math.sin(a * 3) + Math.sin(a * 7);
    if (r > edge) return Math.max(-3, 0.18 - (r - edge) * 0.5);
    const rise = THREE.MathUtils.smoothstep(edge - r, 0, 10);
    const mountain =
      15 * Math.pow(Math.max(0, 1 - Math.hypot(x, z + 34) / 32), 1.35);
    return (
      0.22 +
      rise * (0.7 + 0.22 * Math.sin(x * 0.12) * Math.cos(z * 0.13)) +
      mountain
    );
  }
  scene.background = new THREE.Color(0x9dcfd0);
  scene.fog = new THREE.Fog(0x9dcfd0, 75, 150);
  scene.add(new THREE.HemisphereLight(0xd7f1e5, 0x7c8b6c, 2.15));
  const sun = new THREE.DirectionalLight(0xffe7bc, 3.1);
  sun.position.set(-24, 40, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -37,
    right: 37,
    top: 37,
    bottom: -37,
    near: 0.5,
    far: 110,
  });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.045;
  scene.add(sun);

  const positions: number[] = [],
    colors: number[] = [];
  const c = new THREE.Color();
  const step = 2;
  for (let x = -100; x < 100; x += step)
    for (let z = -100; z < 100; z += step) {
      for (const [dx, dz] of [
        [0, 0],
        [0, step],
        [step, 0],
        [step, 0],
        [0, step],
        [step, step],
      ]) {
        const xx = x + dx,
          zz = z + dz,
          y = groundHeight(xx, zz);
        positions.push(xx, y, zz);
        const region = regionAt(xx, zz);
        c.setHex(
          Math.hypot(xx, zz) > 84 || region === "beach"
            ? 0xe9d7ad
            : region === "mountain"
              ? y > 10
                ? 0xb0b0a2
                : 0x929686
              : region === "swamp"
                ? 0x637c60
                : region === "cave"
                  ? 0x7a8582
                  : region === "north"
                    ? 0xb8bba2
                    : 0x8ea569,
        );
        c.multiplyScalar(0.97 + 0.065 * Math.sin(x * 1.6 + z * 2.7));
        colors.push(c.r, c.g, c.b);
      }
    }
  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
    }),
  );
  terrain.receiveShadow = true;
  scene.add(terrain);
  const waterGeo = new THREE.PlaneGeometry(650, 650, 80, 80);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({
      color: 0x389eaa,
      roughness: 0.38,
      metalness: 0.08,
      flatShading: true,
    }),
  );
  water.position.y = -0.12;
  water.receiveShadow = true;
  scene.add(water);
  const shallow = mesh(
    scene,
    new THREE.CircleGeometry(102, 100),
    new THREE.MeshBasicMaterial({
      color: 0x76c9bd,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
    }),
    0,
    0.04,
    0,
  );
  shallow.rotation.x = -Math.PI / 2;
  const foamGeo = new THREE.BufferGeometry();
  const foamVertices: number[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    const b = ((i + 0.68) / 128) * Math.PI * 2;
    const ra = 94.6 + 2 * Math.sin(a * 3) + 0.6 * Math.sin(a * 7);
    const rb = 94.6 + 2 * Math.sin(b * 3) + 0.6 * Math.sin(b * 7);
    foamVertices.push(
      Math.cos(a) * ra,
      0.07,
      Math.sin(a) * ra,
      Math.cos(b) * rb,
      0.07,
      Math.sin(b) * rb,
    );
  }
  foamGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(foamVertices, 3),
  );
  const foam = new THREE.LineSegments(
    foamGeo,
    new THREE.LineBasicMaterial({
      color: 0xf1f4d9,
      transparent: true,
      opacity: 0.65,
    }),
  );
  scene.add(foam);

  // Broad pointed fronds are custom strips, preserving a recognisable palm silhouette.
  function palm(x: number, z: number, scale = 1, rot = 0) {
    colliders.push({ x, z, radius: 0.23 * scale });
    const g = new THREE.Group();
    g.position.set(x, groundHeight(x, z), z);
    g.rotation.y = rot;
    g.scale.setScalar(scale);
    decor.add(g);
    const top = new THREE.Vector3(0.8, 5.8, 0.15);
    for (let j = 0; j < 6; j++)
      pole(
        g,
        new THREE.Vector3(0.8 * (j / 6) ** 2, j * 0.94, 0),
        new THREE.Vector3(
          0.8 * ((j + 1) / 6) ** 2,
          (j + 1) * 0.94,
          0.15 * (j / 6),
        ),
        0.18 - j * 0.012,
        j % 2 ? mats.bark : mats.barkLight,
      );
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const verts: number[] = [];
      for (let j = 0; j < 5; j++) {
        const t = j / 4,
          tt = (j + 1) / 4;
        const point = (u: number, s: number) => {
          const r = u * 3.1;
          const w = Math.sin(Math.min(1, u) * Math.PI) * 0.43;
          return [
            top.x + Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * w * s,
            top.y + Math.sin(u * Math.PI) * 0.6 - u * u * 1.25,
            top.z + Math.sin(angle) * r + Math.sin(angle + Math.PI / 2) * w * s,
          ];
        };
        verts.push(
          ...point(t, -1),
          ...point(t, 1),
          ...point(tt, -1),
          ...point(t, 1),
          ...point(tt, 1),
          ...point(tt, -1),
        );
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      geo.computeVertexNormals();
      const frond = mesh(g, geo, i % 2 ? mats.leaf : mats.leafLight, 0, 0, 0);
      frond.material.side = THREE.DoubleSide;
    }
    for (let j = 0; j < 3; j++)
      mesh(
        g,
        geometries.ball,
        mats.leather,
        0.8 + Math.cos(j * 2) * 0.28,
        5.35,
        Math.sin(j * 2) * 0.28,
        0.24,
      );
  }
  for (const [x, z, s] of [
    [-17, -7, 1.2],
    [-19, 1, 1],
    [-15, 10, 0.95],
    [-9, -17, 1.1],
    [1, -19, 1.15],
    [12, -15, 1.3],
    [18, -5, 1.05],
    [17, 7, 1.2],
    [9, 17, 0.85],
    [-19, 7, 0.75],
    [-12, -12, 0.9],
    [10, -9, 0.85],
    [21, 0, 0.8],
  ])
    palm(x * 3.4, z * 3.4, s, random() * 6.28);
  for (const [x, z, scale] of [
    [-13, 73, 1.05],
    [12, 75, 0.95],
    [-19, 62, 1.2],
    [17, 58, 1.1],
    [-9, 84, 0.7],
    [23, 80, 0.8],
    [-26, 48, 1.05],
    [7, 48, 0.85],
  ])
    palm(x, z, scale, random() * 6.28);
  // Weathered ridge and tiny distant islands establish three depth layers.
  for (let i = 0; i < 10; i++) {
    const x = -20 + i * 4.3,
      z = -49 + Math.sin(i) * 3;
    const rock = mesh(
      decor,
      geometries.ball,
      i % 2 ? mats.rock : mats.rockLight,
      x,
      groundHeight(x, z) + 1.2,
      z,
      2.2 + random(),
      2 + random() * 3,
      2.3,
    );
    rock.rotation.set(random() * 0.4, random() * 6, random() * 0.5);
    colliders.push({
      x,
      z,
      radius: Math.min(rock.scale.x, rock.scale.z) * 0.79,
    });
  }
  for (let i = 0; i < 560; i++) {
    const a = random() * 6.28,
      r = 9 + random() * 77,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (z > 7 && Math.abs(x) < 8) continue;
    if (i % 4 === 0) {
      const m = mesh(
        decor,
        geometries.ball,
        mats.rockLight,
        x,
        groundHeight(x, z) + 0.2,
        z,
        0.25 + random() * 0.4,
        0.22 + random() * 0.35,
        0.3 + random() * 0.3,
      );
      m.rotation.y = random() * 6;
    } else {
      const g = new THREE.Group();
      g.position.set(x, groundHeight(x, z), z);
      decor.add(g);
      for (let j = 0; j < 3; j++) {
        const leaf = mesh(
          g,
          geometries.cone,
          j % 2 ? mats.leafLight : mats.leaf,
          Math.cos(j * 2) * 0.15,
          0.3,
          Math.sin(j * 2) * 0.15,
          0.1,
          0.7 + random() * 0.4,
          0.23,
        );
        leaf.rotation.z = (random() - 0.5) * 0.8;
        leaf.rotation.y = j * 2;
      }
    }
  }
  for (const [x, z, s] of [
    [-167, -165, 16],
    [148, -182, 19],
    [187, -134, 18],
  ]) {
    mesh(decor, geometries.ball, mats.leaf, x, -0.5, z, s, s * 0.35, s * 0.65);
    mesh(
      decor,
      geometries.ball,
      mats.sand,
      x,
      -2,
      z,
      s * 1.3,
      s * 0.35,
      s * 0.85,
    );
  }
  // Wreckage at the beach gives the landing site a story and a clear landmark.
  const wreck = new THREE.Group();
  wreck.position.set(-6, groundHeight(-6, 72), 72);
  wreck.rotation.y = -0.45;
  decor.add(wreck);
  for (let j = 0; j < 5; j++) {
    const p = mesh(
      wreck,
      geometries.box,
      j % 2 ? mats.wood : mats.barkLight,
      (j - 2) * 0.34,
      0.25 + Math.abs(j - 2) * 0.12,
      0,
      0.3,
      0.18,
      3.8 - Math.abs(j - 2) * 0.3,
    );
    p.rotation.z = (j - 2) * 0.12;
  }
  pole(
    wreck,
    new THREE.Vector3(0, 0.2, -1.4),
    new THREE.Vector3(0.7, 2, -0.7),
    0.09,
  );
  const bottle = mesh(
    wreck,
    geometries.pole,
    mats.white,
    1.5,
    0.25,
    0.6,
    0.12,
    0.45,
    0.12,
  );
  bottle.rotation.z = 0.9;
  // Author biome silhouettes and landmark destinations using the established prop kit.
  for (let i = 0; i < 180; i++) {
    const x = (random() - 0.5) * 170,
      z = (random() - 0.5) * 140;
    if (
      EXPEDITIONS.some(
        (n) =>
          n.island === "home" &&
          Math.hypot(x - n.x, z - n.z) < (n.step === 0 ? 9 : 4),
      ) ||
      Math.hypot(x, z) > 83 ||
      z > 39 ||
      (z < -16 && Math.abs(x) < 32) ||
      Math.hypot(x - 43, z + 32) < 17 ||
      Math.hypot(x + 32, z - 17) < 7
    )
      continue;
    const g = new THREE.Group();
    g.position.set(x, groundHeight(x, z), z);
    decor.add(g);
    const swamp = regionAt(x, z) === "swamp",
      h = 4 + random() * 5,
      r = 0.22 + random() * 0.2;
    pole(
      g,
      new THREE.Vector3(),
      new THREE.Vector3(0.3, h, 0),
      r,
      swamp ? mats.charcoal : mats.bark,
    );
    colliders.push({ x, z, radius: r + 0.1 });
    for (let j = 0; j < 4; j++) {
      const a = j * 2.4;
      mesh(
        g,
        geometries.ball,
        swamp ? mats.leaf : j % 2 ? mats.leaf : mats.leafLight,
        Math.cos(a) * 1.1,
        h - j * 0.55,
        Math.sin(a) * 1.1,
        2.0 + random(),
        1.6,
        2.1,
      );
    }
    if (swamp)
      for (let j = 0; j < 3; j++)
        pole(
          g,
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(Math.cos(j * 2) * 1.5, 0, Math.sin(j * 2) * 1.5),
          0.12,
        );
  }
  for (let i = 0; i < 140; i++) {
    const x = (random() - 0.5) * 150,
      z = (random() - 0.5) * 150;
    if (Math.hypot(x, z) > 80) continue;
    const y = groundHeight(x, z);
    mesh(decor, geometries.ball, mats.leaf, x, y + 0.25, z, 0.55, 0.5, 0.6);
    if (i % 3 === 0)
      for (let j = 0; j < 3; j++)
        mesh(
          decor,
          geometries.ball,
          j % 2 ? mats.white : mats.fruit,
          x + Math.cos(j * 2) * 0.3,
          y + 0.65,
          z + Math.sin(j * 2) * 0.3,
          0.12,
          0.09,
          0.12,
        );
  }
  // Broken northern sailing ship: ribs, keel, partial hull and a snapped mast.
  const ship = new THREE.Group();
  ship.position.set(3, groundHeight(3, -77), -77);
  ship.rotation.y = 0.32;
  decor.add(ship);
  for (let j = 0; j < 12; j++) {
    const z = -6 + j * 1.05,
      w = 2.7 * Math.sin(((j + 1) / 13) * Math.PI);
    mesh(ship, geometries.box, mats.wood, 0, 0.35, z, w * 2, 0.22, 0.85);
    for (const side of [-1, 1]) {
      pole(
        ship,
        new THREE.Vector3(side * w * 0.7, 0.3, z),
        new THREE.Vector3(side * w, 2.8, z),
        0.12,
      );
      for (let k = 0; k < 3; k++)
        if ((j + k) % 5 !== 0)
          mesh(
            ship,
            geometries.box,
            k % 2 ? mats.bark : mats.barkLight,
            side * w,
            0.8 + k * 0.65,
            z,
            0.19,
            0.48,
            1.0,
          );
    }
  }
  pole(ship, new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(1, 7, -2), 0.2);
  pole(ship, new THREE.Vector3(-3, 4, -1), new THREE.Vector3(3, 4, -1), 0.12);
  const sail = mesh(
    ship,
    geometries.box,
    mats.white,
    1.2,
    4,
    -1,
    2.4,
    2.8,
    0.07,
  );
  sail.rotation.z = 0.16;
  // Cave arch leaves its south-facing approach and interior floor traversable.
  const cave = new THREE.Group();
  cave.position.set(43, groundHeight(43, -32), -32);
  decor.add(cave);
  for (const side of [-1, 1])
    for (let j = 0; j < 3; j++) {
      mesh(
        cave,
        geometries.ball,
        mats.charcoal,
        side * (4 + j * 0.4),
        2.1,
        -j * 2.4,
        2.4,
        3.4,
        2.3,
      );
      colliders.push({
        x: 43 + side * (4 + j * 0.4),
        z: -32 - j * 2.4,
        radius: 1.7,
      });
    }
  mesh(cave, geometries.ball, mats.rock, 0, 5, -2.7, 5.5, 1.7, 5);
  mesh(cave, geometries.box, mats.charcoal, 0, 2.1, -6.3, 7, 4.2, 0.5);
  // Spring and waterfall: the pool is centered on the gameplay water source.
  const poolMaterial = new THREE.MeshStandardMaterial({
    color: 0x56c9b8,
    roughness: 0.25,
    metalness: 0.15,
  });
  const pool = mesh(
    decor,
    geometries.pole,
    poolMaterial,
    -16,
    groundHeight(-16, 44) + 0.06,
    44,
    3,
    0.1,
    2.3,
  );
  for (let j = 0; j < 9; j++) {
    const a = (j / 9) * Math.PI * 2;
    mesh(
      decor,
      geometries.ball,
      mats.rock,
      -16 + Math.cos(a) * 3,
      groundHeight(-16, 44) + 0.2,
      44 + Math.sin(a) * 2.4,
      0.65,
      0.5,
      0.55,
    );
  }
  mesh(
    decor,
    geometries.ball,
    mats.rock,
    -16,
    groundHeight(-16, 40) + 2,
    39.5,
    3.8,
    3,
    2.6,
  );
  const waterfall = mesh(
    scene,
    geometries.box,
    new THREE.MeshBasicMaterial({
      color: 0xa1eddf,
      transparent: true,
      opacity: 0.75,
    }),
    -16,
    groundHeight(-16, 44) + 2.1,
    41.3,
    1.15,
    4.1,
    0.15,
  );
  const tower = new THREE.Group();
  tower.position.set(-32, groundHeight(-32, 17), 17);
  decor.add(tower);
  for (const x of [-1.8, 1.8])
    for (const z of [-1.8, 1.8])
      pole(
        tower,
        new THREE.Vector3(x, 0, z),
        new THREE.Vector3(x * 0.7, 8, z * 0.7),
        0.17,
      );
  for (let j = 0; j < 9; j++)
    mesh(
      tower,
      geometries.box,
      mats.wood,
      0,
      7.5,
      -1.7 + j * 0.42,
      3.8,
      0.16,
      0.36,
    );
  for (const side of [-1, 1]) {
    pole(
      tower,
      new THREE.Vector3(-1.8, 8.7, side * 1.8),
      new THREE.Vector3(1.8, 8.7, side * 1.8),
      0.1,
    );
    pole(
      tower,
      new THREE.Vector3(side * 1.8, 0, -1.8),
      new THREE.Vector3(-side * 1.3, 7.5, -1.3),
      0.08,
    );
  }
  for (let j = 0; j < 15; j++)
    mesh(
      tower,
      geometries.box,
      mats.barkLight,
      0,
      0.5 + j * 0.46,
      2,
      0.9,
      0.09,
      0.12,
    );
  for (const spot of FISHING_SPOTS) {
    const pier = new THREE.Group();
    pier.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
    decor.add(pier);
    for (let j = 0; j < 5; j++)
      mesh(pier, geometries.box, mats.wood, 0, 0.16, j * 0.55, 2, 0.13, 0.48);
    pole(pier, new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 2, 0), 0.08);
    mesh(pier, geometries.box, mats.pants, 1, 1.7, 0, 0.7, 0.4, 0.04);
  }
  // Shallow mossy pools define the wetland without obstructing traversal.
  for (let i = 0; i < 12; i++) {
    const x = -52 + Math.cos(i * 2.4) * (6 + i * 0.8),
      z = -18 + Math.sin(i * 2.4) * (6 + i * 0.7);
    mesh(
      decor,
      geometries.pole,
      poolMaterial,
      x,
      groundHeight(x, z) + 0.025,
      z,
      2 + random() * 2,
      0.045,
      1 + random(),
    );
  }
  // Wind-driven saplings keep their trunks static and share one instanced canopy draw.
  const saplings: Array<{ x: number; z: number; h: number }> = [];
  for (let i = 0; i < 30; i++) {
    const x = -65 + random() * 125,
      z = -8 + random() * 59;
    if (
      Math.hypot(x + 16, z - 44) < 5 ||
      EXPEDITIONS.some(
        (n) =>
          n.island === "home" &&
          Math.hypot(x - n.x, z - n.z) < (n.step === 0 ? 8 : 4),
      )
    )
      continue;
    const h = 2.8 + random() * 1.3;
    saplings.push({ x, z, h });
    pole(
      decor,
      new THREE.Vector3(x, groundHeight(x, z), z),
      new THREE.Vector3(x, groundHeight(x, z) + h, z),
      0.095,
    );
  }
  const movingCanopies = new THREE.InstancedMesh(
      geometries.ball,
      mats.leafLight,
      saplings.length * 3,
    ),
    canopyTransform = new THREE.Object3D();
  movingCanopies.castShadow = true;
  scene.add(movingCanopies);
  // Vertex-color spatial batches combine all material roles into one draw per chunk.
  decor.updateMatrixWorld(true);
  const chunks = new Map<string, THREE.BufferGeometry[]>();
  decor.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry.index
      ? o.geometry.toNonIndexed()
      : o.geometry.clone();
    geo.deleteAttribute("uv");
    geo.applyMatrix4(o.matrixWorld);
    const color = (o.material as THREE.MeshStandardMaterial).color,
      arr = new Float32Array(geo.getAttribute("position").count * 3);
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] = color.r;
      arr[i + 1] = color.g;
      arr[i + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    const pos = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld),
      key = `${Math.floor(pos.x / 28)},${Math.floor(pos.z / 28)}`;
    const parts = chunks.get(key) || [];
    parts.push(geo);
    chunks.set(key, parts);
  });
  const chunkMeshes: THREE.Mesh[] = [];
  for (const parts of chunks.values()) {
    const geo = mergeGeometries(parts, false);
    if (geo) {
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, resourceMaterial);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      chunkMeshes.push(m);
    }
    for (const part of parts) part.dispose();
  }
  const birds: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const wing = mesh(
        g,
        geometries.box,
        mats.white,
        side * 0.25,
        0,
        0,
        0.55,
        0.055,
        0.15,
      );
      wing.rotation.z = side * 0.23;
    }
    birds.push(g);
    scene.add(g);
  }
  const fires: THREE.Group[] = [];
  const smokeColumns: THREE.Group[] = [];
  function base(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, groundHeight(x, z), z);
    return g;
  }
  const resourceCache = new Map<ResourceKind, THREE.BufferGeometry>();
  function createResource(kind: ResourceKind, x: number, z: number) {
    const g = base(x, z);
    g.name = `resource-${kind}`;
    if (kind === "hardwood") g.scale.set(1.3, 1.7, 1.3);
    const cached = resourceCache.get(kind);
    if (cached) {
      mesh(g, cached, resourceMaterial, 0, 0, 0);
      return g;
    }
    if (kind === "wood" || kind === "hardwood") {
      for (let i = 0; i < 3; i++) {
        const log = mesh(
          g,
          geometries.pole,
          mats.bark,
          (i - 1) * 0.29,
          0.2 + i * 0.045,
          (i % 2) * 0.2,
          0.2,
          1.3,
          0.2,
        );
        log.rotation.z = Math.PI / 2;
        log.rotation.y = i * 0.45;
      }
      for (let i = 0; i < 2; i++) {
        const cut = mesh(
          g,
          geometries.pole,
          mats.wood,
          i ? -0.6 : 0.6,
          0.24,
          0,
          0.15,
          0.025,
          0.15,
        );
        cut.rotation.z = Math.PI / 2;
      }
    } else if (["stone", "flint", "ore", "coal"].includes(kind)) {
      for (let i = 0; i < 3; i++) {
        const rock = mesh(
          g,
          geometries.ball,
          i % 2 ? mats.rock : mats.rockLight,
          (i - 1) * 0.36,
          0.27,
          (i % 2) * 0.3,
          0.43,
          0.35 + i * 0.07,
          0.4,
        );
        rock.rotation.y = i * 1.7;
      }
    } else if (["metal", "cloth", "boatPart"].includes(kind)) {
      if (kind === "boatPart") {
        const ring = mesh(
          g,
          new THREE.TorusGeometry(0.48, 0.09, 5, 12),
          mats.rockLight,
          0,
          0.6,
          0,
        );
        ring.rotation.x = 0.4;
        mesh(g, geometries.box, mats.bark, 0, 0.2, 0, 1.1, 0.15, 0.55);
      } else
        for (let i = 0; i < 3; i++) {
          const piece = mesh(
            g,
            geometries.box,
            kind === "cloth" ? mats.white : mats.rock,
            0,
            0.12 + i * 0.12,
            0,
            0.8,
            0.12,
            0.7,
          );
          piece.rotation.y = i * 0.4;
        }
    } else if (kind === "coconut" || kind === "resin") {
      for (let i = 0; i < 3; i++)
        mesh(
          g,
          geometries.ball,
          kind === "coconut" ? mats.leather : mats.shirt,
          (i - 1) * 0.32,
          0.26,
          (i % 2) * 0.2,
          0.28,
          0.3,
          0.27,
        );
    } else {
      for (let i = 0; i < 3; i++)
        mesh(
          g,
          geometries.ball,
          i % 2 ? mats.leaf : mats.leafLight,
          Math.cos(i * 2) * 0.32,
          0.45,
          Math.sin(i * 2) * 0.32,
          0.53,
          0.52,
          0.5,
        );
      if (kind !== "fiber")
        for (let i = 0; i < 7; i++)
          mesh(
            g,
            geometries.ball,
            kind === "herb" ? mats.white : mats.fruit,
            Math.cos(i * 2.4) * 0.53,
            0.6 + (i % 3) * 0.16,
            Math.sin(i * 2.4) * 0.53,
            0.12,
          );
    }
    if (kind === "hardwood") g.scale.set(1.3, 1.7, 1.3);
    if (kind === "ore")
      for (let i = 0; i < 3; i++)
        mesh(
          g,
          geometries.cone,
          mats.shirt,
          (i - 1) * 0.27,
          0.65,
          0,
          0.15,
          0.5,
          0.15,
        );
    if (kind === "coal" || kind === "flint")
      g.traverse((o) => {
        if (o instanceof THREE.Mesh)
          o.material = kind === "coal" ? mats.charcoal : mats.pants;
      });
    // Bake material color into vertices: one draw per interactable, with its original color blocks.
    g.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const geometry = o.geometry.index
          ? o.geometry.toNonIndexed()
          : o.geometry.clone();
        geometry.deleteAttribute("uv");
        geometry.applyMatrix4(
          new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld),
        );
        const color = (o.material as THREE.MeshStandardMaterial).color;
        const colors = new Float32Array(
          geometry.getAttribute("position").count * 3,
        );
        for (let i = 0; i < colors.length; i += 3) {
          colors[i] = color.r;
          colors[i + 1] = color.g;
          colors[i + 2] = color.b;
        }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        parts.push(geometry);
      }
    });
    g.clear();
    const geometry = mergeGeometries(parts, false);
    if (geometry) {
      resourceCache.set(kind, geometry);
      mesh(g, geometry, resourceMaterial, 0, 0, 0);
    }
    for (const part of parts) part.dispose();
    return g;
  }
  function createPlayer() {
    const g = new THREE.Group();
    g.name = "survivor";
    mesh(g, geometries.box, mats.shirt, 0, 1.02, 0, 0.55, 0.62, 0.35);
    mesh(g, geometries.box, mats.leather, 0, 0.75, 0, 0.56, 0.1, 0.37);
    mesh(g, geometries.box, mats.leather, 0, 1.09, -0.27, 0.39, 0.51, 0.22);
    mesh(g, geometries.box, mats.rope, 0, 1.09, -0.39, 0.42, 0.09, 0.03);
    mesh(g, geometries.ball, mats.skin, 0, 1.61, 0.035, 0.32, 0.35, 0.3);
    mesh(g, geometries.pole, mats.rope, 0, 1.89, 0, 0.4, 0.085, 0.37);
    mesh(g, geometries.pole, mats.sand, 0, 1.99, 0, 0.27, 0.19, 0.25);
    mesh(g, geometries.pole, mats.leather, 0, 1.91, 0, 0.28, 0.055, 0.26);
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = side < 0 ? "legL" : "legR";
      leg.position.set(side * 0.16, 0.76, 0);
      g.add(leg);
      mesh(leg, geometries.box, mats.pants, 0, -0.25, 0, 0.23, 0.5, 0.25);
      mesh(
        leg,
        geometries.box,
        mats.leather,
        0,
        -0.54,
        0.045,
        0.25,
        0.14,
        0.36,
      );
      const arm = new THREE.Group();
      arm.name = side < 0 ? "armL" : "armR";
      arm.position.set(side * 0.37, 1.3, 0);
      g.add(arm);
      mesh(arm, geometries.box, mats.shirt, 0, -0.1, 0, 0.22, 0.25, 0.27);
      mesh(arm, geometries.box, mats.skin, 0, -0.36, 0.015, 0.18, 0.31, 0.2);
      mesh(
        g,
        geometries.box,
        mats.charcoal,
        side * 0.115,
        1.64,
        0.282,
        0.047,
        0.05,
        0.024,
      );
    }
    // A red neckerchief remains readable against grass and sand.
    mesh(g, geometries.box, mats.fruit, 0, 1.36, 0.08, 0.34, 0.105, 0.32);
    return g;
  }
  function createBoar(x: number, z: number) {
    const g = base(x, z);
    g.name = "boar";
    mesh(g, geometries.ball, mats.leather, 0, 0.65, 0, 0.56, 0.5, 0.86);
    mesh(g, geometries.ball, mats.bark, 0, 0.66, 0.69, 0.4, 0.37, 0.47);
    mesh(g, geometries.box, mats.barkLight, 0, 0.57, 1, 0.33, 0.23, 0.2);
    for (const s of [-1, 1]) {
      mesh(
        g,
        geometries.cone,
        mats.bark,
        s * 0.23,
        0.99,
        0.64,
        0.16,
        0.32,
        0.17,
      );
      mesh(g, geometries.ball, mats.charcoal, s * 0.285, 0.77, 0.87, 0.047);
      const tusk = mesh(
        g,
        geometries.cone,
        mats.white,
        s * 0.22,
        0.51,
        1,
        0.07,
        0.24,
        0.07,
      );
      tusk.rotation.x = 0.6;
    }
    for (let i = 0; i < 4; i++) {
      const leg = mesh(
        g,
        geometries.box,
        mats.bark,
        i % 2 ? -0.32 : 0.32,
        0.22,
        i < 2 ? -0.48 : 0.49,
        0.18,
        0.42,
        0.2,
      );
      leg.name = `leg${i}`;
    }
    for (let i = 0; i < 5; i++)
      mesh(
        g,
        geometries.cone,
        mats.bark,
        0,
        1.08,
        -0.5 + i * 0.23,
        0.11,
        0.23,
        0.13,
      );
    pole(
      g,
      new THREE.Vector3(0, 0.65, -0.73),
      new THREE.Vector3(0.12, 0.91, -1.0),
      0.055,
    );
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...g.children])
      if (child instanceof THREE.Mesh && !/^leg[0-3]$/.test(child.name)) {
        const material = child.material as THREE.Material,
          parts = batches.get(material) || [];
        const geometry = child.geometry.index
          ? child.geometry.toNonIndexed()
          : child.geometry.clone();
        geometry.deleteAttribute("uv");
        geometry.applyMatrix4(
          new THREE.Matrix4().multiplyMatrices(inv, child.matrixWorld),
        );
        parts.push(geometry);
        batches.set(material, parts);
        g.remove(child);
      }
    for (const [material, parts] of batches) {
      const geometry = mergeGeometries(parts, false);
      if (geometry) {
        geometry.userData.modelOwned = true;
        mesh(g, geometry, material, 0, 0, 0);
      }
      for (const part of parts) part.dispose();
    }
    return g;
  }
  function createStructure(kind: BuildingKind, x: number, z: number) {
    const g = base(x, z);
    g.name = kind;
    if (kind === "fire" || kind === "signal") {
      const scale = kind === "signal" ? 1.45 : 1;
      for (let i = 0; i < 9; i++)
        mesh(
          g,
          geometries.ball,
          mats.rock,
          Math.cos((i / 9) * Math.PI * 2) * 0.8 * scale,
          0.13,
          Math.sin((i / 9) * Math.PI * 2) * 0.8 * scale,
          0.24,
          0.2,
          0.22,
        );
      for (let i = 0; i < 4; i++) {
        const log = mesh(
          g,
          geometries.pole,
          mats.bark,
          0,
          0.18 + i * 0.08,
          0,
          0.15,
          1.3 * scale,
          0.15,
        );
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (i * Math.PI) / 4;
      }
      const flames = new THREE.Group();
      flames.name = "flames";
      g.add(flames);
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xffaa43 });
      const inner = new THREE.MeshBasicMaterial({ color: 0xffe49a });
      for (let i = 0; i < 4; i++) {
        const f = mesh(
          flames,
          geometries.cone,
          i % 2 ? inner : fireMat,
          Math.sin(i * 2) * 0.19,
          0.55,
          Math.cos(i * 2) * 0.16,
          0.28,
          0.8,
          0.26,
        );
        f.rotation.z = i * 0.22;
      }
      flames.scale.setScalar(scale);
      fires.push(flames);
      const light = new THREE.PointLight(0xff9d3f, 8, 9, 2);
      light.position.y = 1;
      g.add(light);
      if (kind === "signal") {
        const smoke = new THREE.Group();
        smoke.name = "signal-smoke";
        g.add(smoke);
        smokeColumns.push(smoke);
        for (let i = 0; i < 7; i++) {
          const material = new THREE.MeshBasicMaterial({
            color: 0xe0dbcc,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
          });
          const puff = mesh(
            smoke,
            geometries.ball,
            material,
            0,
            2 + i * 0.75,
            0,
            0.4 + i * 0.07,
          );
          puff.castShadow = false;
          puff.receiveShadow = false;
        }
        for (const side of [-1, 1])
          pole(
            g,
            new THREE.Vector3(side * 1.35, 0, 0),
            new THREE.Vector3(side * 0.9, 3.9, 0),
            0.11,
          );
        pole(
          g,
          new THREE.Vector3(-0.9, 3.7, 0),
          new THREE.Vector3(0.9, 3.7, 0),
          0.1,
        );
        const banner = mesh(
          g,
          geometries.box,
          mats.fruit,
          0,
          3.15,
          0,
          1.5,
          0.95,
          0.045,
        );
        banner.rotation.z = 0.06;
        mesh(g, geometries.box, mats.white, 0, 3.15, 0.025, 0.18, 0.7, 0.02);
        mesh(g, geometries.box, mats.white, 0, 3.15, 0.027, 0.65, 0.16, 0.02);
      }
    } else if (kind === "shelter") {
      for (const x1 of [-1.4, 1.4])
        for (const z1 of [-1, 1])
          pole(
            g,
            new THREE.Vector3(x1, 0, z1),
            new THREE.Vector3(x1, z1 < 0 ? 2.45 : 0.85, z1),
            0.09,
          );
      pole(
        g,
        new THREE.Vector3(-1.5, 2.45, -1),
        new THREE.Vector3(1.5, 2.45, -1),
        0.12,
      );
      for (let i = 0; i < 9; i++) {
        const roof = mesh(
          g,
          geometries.box,
          i % 2 ? mats.leaf : mats.leafLight,
          -1.45 + i * 0.36,
          1.74,
          0,
          0.39,
          0.15,
          2.9,
        );
        roof.rotation.x = 0.68;
      }
      for (let i = 0; i < 7; i++)
        mesh(
          g,
          geometries.box,
          mats.wood,
          -1.2 + i * 0.4,
          0.12,
          0,
          0.34,
          0.11,
          1.65,
        );
      mesh(g, geometries.box, mats.sand, 0.25, 0.24, -0.05, 1.4, 0.12, 1.2);
      mesh(g, geometries.box, mats.rope, 0.25, 0.34, -0.45, 1.05, 0.15, 0.3);
    }
    if (!["fire", "signal", "shelter"].includes(kind)) {
      const board = (
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
        mat = mats.wood,
      ) => mesh(g, geometries.box, mat, x, y, z, sx, sy, sz);
      const post = (x: number, z: number, h: number) =>
        pole(g, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, h, z), 0.09);
      if (kind === "workbench" || kind === "advancedBench") {
        for (const x of [-1, 1]) for (const z of [-0.5, 0.5]) post(x, z, 1.1);
        for (let i = 0; i < 5; i++)
          board(0, 1.1, -0.55 + i * 0.27, 2.5, 0.17, 0.24);
        board(0, 1.9, -0.65, 2.5, 1.3, 0.1, mats.bark);
        for (let i = 0; i < 4; i++)
          pole(
            g,
            new THREE.Vector3(-0.8 + i * 0.5, 1.3, -0.52),
            new THREE.Vector3(-0.8 + i * 0.5, 1.95, -0.52),
            0.04,
          );
        board(0.65, 1.33, 0, 0.45, 0.35, 0.3, mats.rock);
        board(-0.45, 1.27, 0.1, 0.6, 0.12, 0.5, mats.rope);
        if (kind === "advancedBench") {
          board(0, 0.3, 0, 2, 0.15, 1.2);
          mesh(
            g,
            geometries.pole,
            mats.charcoal,
            0.7,
            1.45,
            0.1,
            0.35,
            0.25,
            0.25,
          );
        }
      } else if (kind === "chest") {
        for (let i = 0; i < 4; i++)
          board(
            0,
            0.2 + i * 0.22,
            0,
            1.8,
            0.2,
            1.1,
            i % 2 ? mats.wood : mats.barkLight,
          );
        for (const x of [-0.6, 0.6])
          board(x, 0.56, 0.57, 0.13, 0.85, 0.05, mats.charcoal);
        board(0, 1, 0, 1.9, 0.16, 1.18);
        board(0, 0.8, 0.62, 0.22, 0.23, 0.08, mats.rockLight);
      } else if (kind === "bed") {
        for (const x of [-0.65, 0.65])
          for (const z of [-1, 1]) post(x, z, 0.45);
        board(0, 0.45, 0, 1.6, 0.2, 2.3);
        board(0, 0.64, 0, 1.4, 0.24, 2.1, mats.rope);
        board(0, 0.85, -0.75, 1.2, 0.18, 0.5, mats.white);
        board(0, 0.82, 0.35, 1.4, 0.1, 1.3, mats.pants);
      } else if (kind === "raincatcher") {
        for (const x of [-1, 1]) for (const z of [-1, 1]) post(x, z, 2.5);
        for (const side of [-1, 1]) {
          const panel = board(side * 0.52, 2.13, 0, 1.2, 0.07, 2.2, mats.white);
          panel.rotation.z = side * 0.3;
        }
        mesh(g, geometries.pole, mats.bark, 0, 0.5, 0, 0.65, 0.95, 0.65);
        const waterLevel = mesh(
          g,
          geometries.pole,
          poolMaterial,
          0,
          0.92,
          0,
          0.57,
          0.03,
          0.57,
        );
        waterLevel.name = "water-level";
      } else if (kind === "dryer" || kind === "cooker") {
        for (const x of [-1.2, 1.2]) {
          pole(
            g,
            new THREE.Vector3(x, 0, -0.65),
            new THREE.Vector3(x, 2.2, 0),
            0.1,
          );
          pole(
            g,
            new THREE.Vector3(x, 0, 0.65),
            new THREE.Vector3(x, 2.2, 0),
            0.1,
          );
        }
        pole(
          g,
          new THREE.Vector3(-1.4, 2.15, 0),
          new THREE.Vector3(1.4, 2.15, 0),
          0.1,
        );
        for (let i = 0; i < 4; i++) {
          pole(
            g,
            new THREE.Vector3(-0.8 + i * 0.5, 2.1, 0),
            new THREE.Vector3(-0.8 + i * 0.5, 1.65, 0),
            0.025,
            mats.rope,
          );
          mesh(
            g,
            geometries.ball,
            mats.leather,
            -0.8 + i * 0.5,
            1.4,
            0,
            0.18,
            0.38,
            0.1,
          );
        }
        if (kind === "cooker") {
          mesh(g, geometries.pole, mats.charcoal, 0, 0.6, 0, 0.6, 0.5, 0.6);
          for (let i = 0; i < 6; i++)
            mesh(
              g,
              geometries.ball,
              mats.rock,
              Math.cos(i) * 0.8,
              0.15,
              Math.sin(i) * 0.8,
              0.25,
              0.2,
              0.23,
            );
        }
      } else if (kind === "trap" || kind === "bigTrap") {
        for (let i = 0; i < 6; i++)
          for (const side of [-1, 1])
            board(
              side * 0.65,
              0.55,
              -0.65 + i * 0.26,
              0.06,
              1.0,
              0.07,
              mats.bark,
            );
        for (let i = 0; i < 6; i++)
          board(-0.65 + i * 0.26, 1, 0, 0.07, 0.06, 1.4, mats.bark);
        board(0, 0.1, 0, 1.4, 0.1, 1.4);
        const catchMesh = mesh(
          g,
          geometries.ball,
          mats.leather,
          0,
          0.3,
          0,
          0.4,
          0.25,
          0.5,
        );
        catchMesh.name = "catch";
        catchMesh.visible = false;
        if (kind === "bigTrap") g.scale.setScalar(1.6);
      } else if (kind === "farm") {
        board(0, 0.06, 0, 3, 0.15, 2.4, mats.bark);
        for (const side of [-1, 1]) {
          board(side * 1.55, 0.16, 0, 0.15, 0.22, 2.65);
          board(0, 0.16, side * 1.25, 3.2, 0.22, 0.15);
        }
        const crop = new THREE.Group();
        crop.name = "crop";
        g.add(crop);
        for (let i = 0; i < 9; i++) {
          const x = -1 + (i % 3),
            z = -0.8 + Math.floor(i / 3) * 0.8;
          mesh(crop, geometries.cone, mats.leafLight, x, 0.5, z, 0.3, 0.8, 0.3);
          mesh(crop, geometries.ball, mats.fruit, x, 0.4, z, 0.2);
        }
      } else if (kind === "furnace") {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          mesh(
            g,
            geometries.ball,
            mats.rock,
            Math.cos(a) * 0.65,
            0.6,
            Math.sin(a) * 0.65,
            0.4,
            0.7,
            0.4,
          );
        }
        mesh(g, geometries.pole, mats.rock, 0, 1.6, -0.3, 0.42, 1.6, 0.45);
        board(0, 0.45, 0.67, 0.6, 0.55, 0.04, mats.charcoal);
      } else if (kind === "cabin") {
        for (let i = 0; i < 10; i++)
          board(-2 + i * 0.45, 0.18, 0, 0.4, 0.25, 4);
        for (const side of [-1, 1])
          for (let i = 0; i < 9; i++) {
            board(side * 2, 0.42 + i * 0.25, 0, 0.17, 0.22, 4);
            board(side * 1.4, 0.42 + i * 0.25, 2, 1.2, 0.22, 0.18);
          }
        for (let i = 0; i < 9; i++)
          board(0, 0.42 + i * 0.25, -2, 4, 0.22, 0.17);
        for (const side of [-1, 1]) {
          const roof = board(side * 1.12, 3.0, 0, 2.7, 0.15, 4.6, mats.leaf);
          roof.rotation.z = side * -0.5;
        }
        board(1.4, 1.8, 2.12, 0.5, 0.6, 0.08, mats.rope);
      } else if (kind === "raft") {
        for (let stage = 0; stage < 6; stage++) {
          const part = new THREE.Group();
          part.name = `raft-stage-${stage}`;
          g.add(part);
          if (stage === 0) {
            for (const x of [-1.5, 1.5]) {
              const log = mesh(
                part,
                geometries.pole,
                mats.bark,
                x,
                0.35,
                0,
                0.3,
                5,
                0.3,
              );
              log.rotation.x = Math.PI / 2;
            }
            for (const z of [-1.5, 1.5])
              pole(
                part,
                new THREE.Vector3(-2, 0.6, z),
                new THREE.Vector3(2, 0.6, z),
                0.15,
              );
          }
          if (stage === 1)
            for (let i = 0; i < 10; i++)
              mesh(
                part,
                geometries.box,
                i % 2 ? mats.wood : mats.barkLight,
                0,
                0.75,
                -2.2 + i * 0.48,
                4.2,
                0.18,
                0.42,
              );
          if (stage === 2) {
            pole(
              part,
              new THREE.Vector3(0, 0.8, 0),
              new THREE.Vector3(0, 5.8, 0),
              0.15,
            );
            pole(
              part,
              new THREE.Vector3(-2, 4.9, 0),
              new THREE.Vector3(2, 4.9, 0),
              0.09,
            );
            for (const side of [-1, 1])
              pole(
                part,
                new THREE.Vector3(side * 1.8, 0.8, 1.8),
                new THREE.Vector3(0, 5, 0),
                0.025,
                mats.rope,
              );
          }
          if (stage === 3) {
            const shape = new THREE.Shape();
            shape.moveTo(-1.7, 0);
            shape.lineTo(1.7, 0);
            shape.lineTo(1.45, -2.7);
            shape.lineTo(-1.5, -2.6);
            shape.closePath();
            const mat = mats.white.clone();
            mat.side = THREE.DoubleSide;
            mesh(part, new THREE.ShapeGeometry(shape), mat, 0, 4.85, 0.1);
            mesh(
              part,
              geometries.box,
              mats.fruit,
              0,
              3.6,
              0.12,
              0.12,
              1.5,
              0.02,
            );
          }
          if (stage === 4) {
            for (const x of [-1.1, 1.1]) {
              mesh(
                part,
                geometries.pole,
                mats.bark,
                x,
                1.2,
                -1.4,
                0.38,
                0.9,
                0.38,
              );
              mesh(
                part,
                geometries.pole,
                mats.charcoal,
                x,
                1.4,
                -1.4,
                0.39,
                0.06,
                0.39,
              );
            }
            mesh(
              part,
              geometries.box,
              mats.rope,
              1.2,
              1,
              -0.2,
              0.65,
              0.5,
              0.75,
            );
          }
          if (stage === 5) {
            pole(
              part,
              new THREE.Vector3(-1.8, 0.9, 1),
              new THREE.Vector3(-2.6, 0.5, 3),
              0.07,
            );
            mesh(part, geometries.box, mats.wood, -2.6, 0.5, 3, 0.4, 0.12, 0.8);
          }
        }
      }
      // Bake immutable model parts; dynamic named groups retain their own transforms.
    }
    bakeGroup(g);
    return g;
  }
  function bakeGroup(g: THREE.Group) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(),
      parts: THREE.BufferGeometry[] = [];
    for (const o of [...g.children]) {
      if (!(o instanceof THREE.Mesh) || o.name) continue;
      const geo = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      geo.deleteAttribute("uv");
      geo.applyMatrix4(
        new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld),
      );
      const color = (o.material as THREE.MeshStandardMaterial).color,
        arr = new Float32Array(geo.getAttribute("position").count * 3);
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = color.r;
        arr[i + 1] = color.g;
        arr[i + 2] = color.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      parts.push(geo);
      g.remove(o);
    }
    if (parts.length) {
      const geo = mergeGeometries(parts, false);
      if (geo) {
        geo.userData.modelOwned = true;
        mesh(g, geo, resourceMaterial, 0, 0, 0);
      }
      for (const part of parts) part.dispose();
    }
    for (const child of g.children)
      if (
        child instanceof THREE.Group &&
        child.name !== "flames" &&
        child.name !== "signal-smoke"
      )
        bakeGroup(child);
  }
  function createAnimal(kind: "boar" | "rabbit", x: number, z: number) {
    if (kind === "boar") return createBoar(x, z);
    const g = base(x, z);
    g.name = "rabbit";
    mesh(g, geometries.ball, mats.rope, 0, 0.35, 0, 0.28, 0.3, 0.43);
    mesh(g, geometries.ball, mats.rope, 0, 0.58, 0.3, 0.23, 0.22, 0.24);
    for (const side of [-1, 1]) {
      const ear = mesh(
        g,
        geometries.ball,
        mats.rope,
        side * 0.12,
        0.95,
        0.3,
        0.065,
        0.3,
        0.08,
      );
      ear.rotation.z = -side * 0.15;
      mesh(g, geometries.ball, mats.charcoal, side * 0.16, 0.6, 0.46, 0.035);
    }
    mesh(g, geometries.ball, mats.white, 0, 0.4, -0.4, 0.14);
    bakeGroup(g);
    return g;
  }
  function updateBuilding(
    g: THREE.Group,
    state: BuildingState,
    raftStage: number,
  ) {
    const flames = g.getObjectByName("flames");
    if (flames) flames.visible = state.fuel > 0;
    const smoke = g.getObjectByName("signal-smoke");
    if (smoke) smoke.visible = state.fuel > 0;
    for (const child of g.children)
      if (child instanceof THREE.PointLight)
        child.intensity = state.fuel > 0 ? 8 : 0;
    const crop = g.getObjectByName("crop");
    if (crop) {
      crop.visible = state.planted || state.ready;
      crop.scale.y = 0.15 + Math.min(1, state.progress / 480) * 0.85;
    }
    const caught = g.getObjectByName("catch");
    if (caught) caught.visible = state.ready;
    const level = g.getObjectByName("water-level");
    if (level) {
      level.visible = state.water > 0;
      level.position.y = 0.2 + Math.min(1, state.water / 20) * 0.72;
    }
    for (let i = 0; i < 6; i++) {
      const part = g.getObjectByName(`raft-stage-${i}`);
      if (part) part.visible = i <= raftStage;
    }
  }
  const cloudGeometry = new THREE.IcosahedronGeometry(1, 0),
    cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0f2de,
      flatShading: true,
      roughness: 1,
    });
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 48),
    dummy = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    dummy.position.set(
      ((i % 12) - 5.5) * 23,
      // Above the highest summit camera, so cloud geometry cannot cover interactables.
      70 + (i % 3) * 2,
      (Math.floor(i / 12) - 1.5) * 55,
    );
    dummy.scale.set(7 + (i % 4), 2.2, 4 + (i % 3));
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
  scene.add(clouds);
  const rainPositions = new Float32Array(600 * 6);
  for (let i = 0; i < 600; i++) {
    const x = (random() - 0.5) * 44,
      y = random() * 25,
      z = (random() - 0.5) * 44;
    rainPositions.set([x, y, z, x - 0.15, y - 0.85, z], i * 6);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({
      color: 0xb6d9db,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  );
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  function update(
    dt: number,
    time: number,
    weather: WeatherKind = "clear",
    playerPosition?: THREE.Vector3,
  ) {
    for (let i = 0; i < saplings.length; i++) {
      const tree = saplings[i],
        wind = (weather === "storm" ? 0.28 : 0.07) * Math.sin(time * 1.8 + i);
      for (let j = 0; j < 3; j++) {
        canopyTransform.position.set(
          tree.x + Math.cos(j * 2) * 0.6 + wind,
          groundHeight(tree.x, tree.z) + tree.h - j * 0.32,
          tree.z + Math.sin(j * 2) * 0.6,
        );
        canopyTransform.rotation.z = wind * 0.3;
        canopyTransform.scale.set(1.25, 0.95, 1.3);
        canopyTransform.updateMatrix();
        movingCanopies.setMatrixAt(i * 3 + j, canopyTransform.matrix);
      }
    }
    movingCanopies.instanceMatrix.needsUpdate = true;
    const wet = weather === "rain" || weather === "storm";
    rain.visible = wet;
    // Camera-to-player distance is about 48m: keep nearby actions readable while
    // shortening the distant horizon during rough weather.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = weather === "storm" ? 38 : wet ? 52 : 75;
      scene.fog.far = weather === "storm" ? 85 : wet ? 112 : 150;
      scene.fog.color.setHex(
        weather === "storm" ? 0x7f999d : wet ? 0x9bb7b9 : 0x9dcfd0,
      );
      if (scene.background instanceof THREE.Color)
        scene.background.copy(scene.fog.color);
    }

    cloudMaterial.color.setHex(
      weather === "storm" ? 0x67797e : weather === "rain" ? 0xa0b2b1 : 0xf0f2de,
    );
    clouds.visible = true;
    clouds.position.x = Math.sin(time * 0.008) * 10;
    if (playerPosition) {
      rain.position.copy(playerPosition);
      for (const chunk of chunkMeshes) {
        const center = chunk.geometry.boundingSphere?.center;
        chunk.visible =
          !center ||
          Math.hypot(center.x - playerPosition.x, center.z - playerPosition.z) <
            88;
      }
    }
    if (wet) {
      const attr = rainGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < 600; i++) {
        let y = attr.getY(i * 2) - dt * (weather === "storm" ? 23 : 16);
        if (y < 0) y += 25;
        attr.setY(i * 2, y);
        attr.setY(i * 2 + 1, y - 0.85);
      }
      attr.needsUpdate = true;
    }
    waterfall.scale.x = 1.15 + Math.sin(time * 6) * 0.05;

    const attr = waterGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++)
      attr.setY(
        i,
        Math.sin(attr.getX(i) * 0.24 + time * 0.65) * 0.08 +
          Math.cos(attr.getZ(i) * 0.32 + time * 0.43) * 0.065,
      );
    attr.needsUpdate = true;
    foam.scale.setScalar(1 + Math.sin(time * 0.6) * 0.006);
    (foam.material as THREE.LineBasicMaterial).opacity =
      0.48 + Math.sin(time * 0.6) * 0.16;
    birds.forEach((b, i) => {
      const a = time * 0.055 + i * 1.5;
      b.position.set(
        Math.cos(a) * (29 + i * 3),
        11 + Math.sin(time * 0.5 + i) * 0.3,
        Math.sin(a) * (26 + i * 2),
      );
      b.rotation.y = -a;
      b.children.forEach(
        (wing, j) =>
          (wing.rotation.z =
            (j ? 1 : -1) * (0.1 + Math.sin(time * 4 + i) * 0.24)),
      );
    });
    for (let i = fires.length - 1; i >= 0; i--)
      if (!fires[i].parent?.parent) {
        const materials = new Set<THREE.Material>();
        fires[i].traverse((o) => {
          if (o instanceof THREE.Mesh)
            materials.add(o.material as THREE.Material);
        });
        for (const material of materials) material.dispose();
        fires.splice(i, 1);
      }
    for (let i = smokeColumns.length - 1; i >= 0; i--)
      if (!smokeColumns[i].parent?.parent) {
        smokeColumns[i].traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
        });
        smokeColumns.splice(i, 1);
      }
    smokeColumns.forEach((column) =>
      column.children.forEach((puff, i) => {
        const phase = (time * 0.14 + i / 7) % 1;
        puff.position.set(
          phase * 1.65 + Math.sin(time * 0.65 + i) * 0.14,
          1.3 + phase * 6.8,
          Math.sin(phase * 3 + i) * phase * 0.32,
        );
        puff.scale.setScalar(0.28 + phase * 0.95);
        puff.rotation.y = time * 0.12 + i;
        ((puff as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity =
          Math.sin(phase * Math.PI) * 0.25;
      }),
    );
    fires.forEach((f, i) => {
      const s = f.parent?.name === "signal" ? 1.45 : 1;
      f.scale.set(
        s * (1 + Math.sin(time * 13 + i) * 0.09),
        s * (1 + Math.sin(time * 17 + i) * 0.18),
        s,
      );
      f.rotation.y = time * 0.5;
    });
  }
  /** Dispose only geometry allocated by a model bake, never cached resources or primitives. */
  function disposeModel(group: THREE.Group) {
    const owned = new Set<THREE.BufferGeometry>();
    group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry.userData.modelOwned)
        owned.add(object.geometry);
    });
    for (const geometry of owned) geometry.dispose();
  }
  return {
    groundHeight,
    water,
    colliders,
    update,
    createResource,
    createBoar,
    createAnimal,
    updateBuilding,
    createPlayer,
    createStructure,
    disposeModel,
  };
}
