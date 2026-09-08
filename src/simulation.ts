import type { GameMode } from "./adventure-types";
import {
  createAdventure,
  nearbyInventory,
  consumeNearby,
  adventureAction,
  adventurePrompt,
  tickAdventure,
  sail,
} from "./adventure";
import { ISLETS } from "./adventure-content";
import {
  type GameState,
  type Effect,
  type InputIntent,
  type GameAction,
  type Recipe,
  type ResourceKind,
  type ToolId,
  type BuildingKind,
  type BuildingState,
  type Inventory,
  type ItemId,
  type ResourceState,
  type AnimalState,
  TOOL_IDS,
  ITEM_IDS,
} from "./types";
import { ITEMS, RECIPES, PERKS, RAFT_STAGES, DAY_LENGTH } from "./catalog";
import {
  START,
  SPRING,
  FISHING_SPOTS,
  PLACES,
  ISLAND_RADIUS,
  regionAt,
} from "./locations";
import {
  count,
  capacity,
  hasItems,
  canAdd,
  addItems,
  consume,
  transfer,
} from "./inventory";
const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, v));
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
const toast = (message: string): Effect[] => [{ type: "toast", message }];
const success = (message: string, id = "craft"): Effect[] => [
  { type: "toast", message },
  { type: "sound", id },
  { type: "save" },
];
const owns = (s: GameState, t: ToolId) => (s.equipment.tools[t] ?? 0) > 0;
const perk = (s: GameState, id: string) => s.progression.perks.includes(id);
const built = (s: GameState, kind: BuildingKind) =>
  s.buildings.some((b) => (b.kind === kind || (kind === "shelter" && b.kind === "cabin")) && b.health > 0);
const near = (s: GameState, kind: BuildingKind, r = 8) =>
  s.buildings.find(
    (b) => b.health > 0 && b.kind === kind && dist(s.player, b) < r,
  );
const night = (s: GameState) => s.cycle < 0.22 || s.cycle > 0.76;
function wear(s: GameState, t: ToolId, amount = 1) {
  if (owns(s, t))
    s.equipment.tools[t] = Math.max(
      0,
      (s.equipment.tools[t] ?? 0) - amount * (perk(s, "durable") ? 0.7 : 1),
    );
}
function random(seed: number) {
  let v = seed >>> 0;
  return () => {
    v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
    return v / 4294967296;
  };
}
export function createInitialState(
  seed = 42,
  mode: GameMode = "survival",
): GameState {
  const rng = random(seed),
    resources: ResourceState[] = [];
  const groups: Array<{
    x: number;
    z: number;
    r: number;
    kinds: ResourceKind[];
    n: number;
  }> = [
    {
      x: 0,
      z: 65,
      r: 22,
      kinds: ["wood", "wood", "stone", "fiber", "coconut", "berry"],
      n: 48,
    },
    {
      x: 22,
      z: 17,
      r: 30,
      kinds: ["wood", "hardwood", "fiber", "berry", "herb"],
      n: 62,
    },
    { x: 0, z: -33, r: 18, kinds: ["stone", "flint", "ore", "stone"], n: 35 },
    { x: -50, z: -17, r: 21, kinds: ["fiber", "resin", "herb", "wood"], n: 38 },
    {
      x: 3,
      z: -76,
      r: 14,
      kinds: ["metal", "cloth", "boatPart", "wood"],
      n: 32,
    },
    { x: 43, z: -32, r: 11, kinds: ["ore", "coal", "flint", "stone"], n: 30 },
  ];
  for (const [gi, g] of groups.entries())
    for (let i = 0; i < g.n; i++) {
      const angle = rng() * Math.PI * 2,
        r = Math.sqrt(rng()) * g.r;
      resources.push({
        id: `r-${gi}-${i}`,
        kind: g.kinds[i % g.kinds.length],
        x: g.x + Math.cos(angle) * r,
        z: g.z + Math.sin(angle) * r,
        remaining: 3,
        respawn: 0,
      });
    }
  resources.unshift(
    {
      id: "starter-wood",
      kind: "wood",
      x: 1.3,
      z: 69.5,
      remaining: 3,
      respawn: 0,
    },
    {
      id: "starter-stone",
      kind: "stone",
      x: -3,
      z: 67,
      remaining: 3,
      respawn: 0,
    },
    {
      id: "starter-fiber",
      kind: "fiber",
      x: 4,
      z: 64,
      remaining: 3,
      respawn: 0,
    },
  );
  const animals: AnimalState[] = [];
  for (let i = 0; i < 12; i++) {
    const kind = i < 6 ? "boar" : "rabbit",
      x = i < 6 ? 12 + rng() * 35 : -25 + rng() * 55,
      z = i < 6 ? -12 + rng() * 36 : 32 + rng() * 18;
    animals.push({
      id: `a-${i}`,
      kind,
      x,
      z,
      homeX: x,
      homeZ: z,
      hp: kind === "boar" ? 90 : 30,
      respawn: 0,
      attack: 0,
      heading: rng() * Math.PI * 2,
    });
  }
  for (const island of ISLETS)
    for (let i = 0; i < 16; i++) {
      const angle = i * 2.399;
      const radius = 6 + (i % 4) * 3;
      resources.push({
        id: `islet-${island.id}-${i}`,
        kind: (["wood", "fiber", "coconut", "berry"] as ResourceKind[])[i % 4],
        x: island.x + Math.cos(angle) * radius,
        z: island.z + Math.sin(angle) * radius,
        remaining: 4,
        respawn: 0,
      });
    }
  return {
    version: 3,
    adventure: createAdventure(mode),
    seed,
    elapsed: 0,
    day: 1,
    cycle: 0.3,
    player: {
      ...START,
      heading: Math.PI,
      health: 100,
      hunger: 88,
      thirst: 78,
      warmth: 95,
      stamina: 100,
      rested: 0,
      poison: 0,
    },
    inventory:
      mode === "cozy"
        ? { berry: 6, coconut: 3, wood: 5, stone: 3 }
        : mode === "expedition"
          ? { berry: 2 }
          : { berry: 3, coconut: 1 + Math.floor(rng() * 2) },
    equipment: { tools: {}, active: null },
    progression: {
      xp: { survival: 0, gathering: 0, hunting: 0, crafting: 0 },
      perks: [],
      discovered: ["beach"],
      unlocked: RECIPES.filter((r) => r.tier === 0).map((r) => r.id),
      crafted: [],
      gathered: 0,
      kills: 0,
      fishCaught: 0,
      harvests: 0,
      drank: false,
    },
    buildings: [],
    resources,
    animals,
    weather: { kind: "clear", remaining: 240, wind: 0.2 },
    endgame: {
      raftStage: 0,
      signalProgress: 0,
      signalActive: false,
      won: null,
    },
    fishing: { active: false, elapsed: 0, biteAt: 4, window: 2.5 },
    cooldown: 0,
    restCooldown: 0,
    nextId: 1,
  };
}
export function getTier(s: GameState) {
  return built(s, "raft") || built(s, "signal")
    ? 3
    : built(s, "advancedBench")
      ? 2
      : built(s, "workbench")
        ? 1
        : 0;
}
function requirement(s: GameState, token: string): string {
  const [kind, id] = token.split(":");
  if (kind === "tool" && !owns(s, id as ToolId))
    return `Benötigt: ${RECIPES.find((r) => r.tool === id)?.name ?? id}`;
  if (kind === "built" && !built(s, id as BuildingKind))
    return `Zuerst bauen: ${RECIPES.find((r) => r.building === id)?.name ?? id}`;
  if (kind === "discovered" && !s.progression.discovered.includes(id))
    return `Entdecken: ${PLACES.find((p) => p.id === id)?.name ?? id}`;
  return "";
}
export function recipeStatus(
  s: GameState,
  r: Recipe,
): { available: boolean; reason: string } {
  if (r.tool && s.equipment.tools[r.tool] !== undefined)
    return {
      available: false,
      reason: "Bereits vorhanden — bei Bedarf reparieren",
    };
  for (const req of r.requires ?? []) {
    const reason = requirement(s, req);
    if (reason) return { available: false, reason };
  }
  if (r.station) {
    const station =
      near(s, r.station) ??
      (r.station === "workbench" ? near(s, "advancedBench") : undefined);
    if (!station)
      return {
        available: false,
        reason: `In der Nähe benötigt: ${RECIPES.find((q) => q.building === r.station)?.name ?? r.station}`,
      };
    if (r.station === "cooker" && station.fuel <= 0)
      return {
        available: false,
        reason: "Kochstation mit E anfeuern (2 Holz)",
      };
  }
  if (
    r.building === "signal" &&
    dist(
      s.player,
      PLACES.find((p) => p.id === "mountain")!,
    ) > 14
  )
    return { available: false, reason: "Nur oben am Windgrat errichten" };
  if (r.building === "raft" && Math.hypot(s.player.x, s.player.z) < 65)
    return { available: false, reason: "Floßbauplatz an der Küste errichten" };
  if (
    (r.building === "raft" || r.building === "signal") &&
    built(s, r.building)
  )
    return { available: false, reason: "Bauplatz bereits vorhanden" };
  if (!hasItems(nearbyInventory(s), r.cost))
    return { available: false, reason: "Material fehlt" };
  const next = { ...s.inventory };
  for (const item of ITEM_IDS) {
    const amount = Math.min(count(next, item), count(r.cost, item));
    if (amount) consume(next, { [item]: amount });
  }
  if (r.output && !canAdd(next, r.output, capacity(s)))
    return {
      available: false,
      reason: "Inventar voll — zuerst etwas einlagern",
    };
  return { available: true, reason: "Herstellbar" };
}
function advanceWorld(
  s: GameState,
  dt: number,
  effects: Effect[],
  sleeping = false,
) {
  const p = s.player;
  const previousSurvivalInterval = Math.floor((s.elapsed + 1e-8) / 120);
  s.elapsed += dt;
  const total = s.cycle + dt / DAY_LENGTH;
  const daysPassed = Math.floor(total);
  s.day += daysPassed;
  // Persisted elapsed time makes interval rewards safe across save/load and sleep.
  s.progression.xp.survival +=
    Math.floor((s.elapsed + 1e-8) / 120) -
    previousSurvivalInterval +
    daysPassed * 10;
  s.cycle = total % 1;
  s.cooldown = Math.max(0, s.cooldown - dt);
  s.restCooldown = Math.max(0, s.restCooldown - dt);
  p.rested = Math.max(0, p.rested - dt);
  s.weather.remaining -= dt;
  while (s.weather.remaining <= 0) {
    const index = Math.floor(s.elapsed / 210) + s.seed;
    const kinds = [
      "clear",
      "cloudy",
      "rain",
      "clear",
      "rain",
      "cloudy",
    ] as const;
    s.weather.kind =
      kinds[((index % kinds.length) + kinds.length) % kinds.length];
    s.weather.remaining += 180 + ((index * 37) % 121);
    s.weather.wind =
      s.weather.kind === "rain" ? 0.6 : 0.2;
    effects.push({
      type: "toast",
      message: `Wetter: ${{ clear: "Klar", cloudy: "Bewölkt", rain: "Regen", storm: "Sturm" }[s.weather.kind]}`,
    });
  }
  tickAdventure(s, dt, effects);
  const wet = s.weather.kind === "rain" || s.weather.kind === "storm";
  const shelter = near(s, "shelter", 5) || near(s, "cabin", 7) || sleeping;
  const warm = s.buildings.some(
    (b) =>
      (b.kind === "fire" || b.kind === "cooker" || b.kind === "signal") &&
      b.fuel > 0 &&
      dist(p, b) < 7,
  );
  const frugal =
    (perk(s, "thrifty") ? 0.85 : 1) *
    (s.adventure.mode === "cozy"
      ? 0.45
      : s.adventure.mode === "expedition"
        ? 1.3
        : 1);
  p.hunger = clamp(p.hunger - dt * 0.026 * frugal);
  p.thirst = clamp(p.thirst - dt * 0.038 * frugal);
  const loss =
    (night(s) ? 0.027 : 0) +
    (wet && !shelter ? 0.043 : 0) +
    (regionAt(p.x, p.z) === "mountain" ? 0.009 : 0);
  p.warmth = clamp(
    p.warmth +
      dt *
        (warm
          ? 0.4
          : shelter
            ? 0.11
            : owns(s, "torch") && s.equipment.active === "torch"
              ? 0.08
              : loss > 0
                ? -loss * (perk(s, "warmblood") ? 0.7 : 1)
                : 0.07),
  );
  if (p.poison > 0) {
    p.poison = Math.max(0, p.poison - dt);
    p.health = clamp(p.health - dt * 0.06);
  }
  if (p.hunger <= 0 || p.thirst <= 0 || p.warmth <= 0)
    p.health = clamp(p.health - dt * 0.22);
  else if (p.hunger > 65 && p.thirst > 50 && p.warmth > 35)
    p.health = clamp(p.health + dt * 0.015);
  if (s.equipment.active === "torch") wear(s, "torch", dt * 0.015);
  for (const b of s.buildings) {
    if (b.fuel > 0) {
      const protectedFire = s.buildings.some(
        (a) => (a.kind === "shelter" || a.kind === "cabin") && dist(a, b) < 7,
      );
      b.fuel = Math.max(0, b.fuel - dt * (wet && !protectedFire ? 1.8 : 1));
    }
    if (b.kind === "raincatcher" && wet)
      b.water = Math.min(
        20,
        b.water + dt * (s.weather.kind === "storm" ? 0.075 : 0.045),
      );
    if ((b.kind === "trap" || b.kind === "bigTrap") && !b.ready) {
      b.progress += dt * (perk(s, "trapper") ? 1.25 : 1);
      if (b.progress >= 180) {
        b.progress = 180;
        b.ready = true;
      }
    }
    if (b.kind === "farm" && b.planted && !b.ready) {
      b.progress += dt * (wet ? 1.5 : 1);
      if (b.progress >= 480) {
        b.progress = 480;
        b.ready = true;
      }
    }
  }
  for (const r of s.resources)
    if (r.remaining <= 0) {
      r.respawn -= dt;
      if (r.respawn <= 0) {
        r.remaining = 3;
        r.respawn = 0;
      }
    }
  for (const a of s.animals) {
    if (a.hp <= 0) {
      a.respawn -= dt;
      if (a.respawn <= 0) {
        a.hp = a.kind === "boar" ? 90 : 30;
        a.x = a.homeX;
        a.z = a.homeZ;
      }
      continue;
    }
    a.attack = Math.max(0, a.attack - dt);
    if (sleeping) continue;
    a.flee = Math.max(0, (a.flee ?? 0) - dt);
    if ((a.windup ?? 0) > 0) {
      a.windup = Math.max(0, a.windup! - dt);
      if (a.windup === 0) {
        if (dist(p, a) < 2.1) {
          p.health = clamp(
            p.health -
              (s.adventure.mode === "cozy"
                ? 3
                : s.adventure.mode === "expedition"
                  ? 11
                  : 7),
          );
          effects.push(
            { type: "sound", id: "hit" },
            { type: "burst", x: p.x, z: p.z },
          );
        }
        a.attack = 1.9;
      }
      continue;
    }
    const d = dist(p, a),
      aggro =
        a.kind === "boar" && d < (s.adventure.sneaking ? 3 : night(s) ? 9 : 7),
      flee =
        (a.kind === "rabbit" && d < (s.adventure.sneaking ? 2.5 : 6)) ||
        (a.flee ?? 0) > 0;
    const tx = aggro
      ? p.x
      : flee
        ? a.x + (a.x - p.x) * 3
        : a.homeX + Math.sin(s.elapsed * 0.07 + Number(a.id.slice(2))) * 5;
    const tz = aggro
      ? p.z
      : flee
        ? a.z + (a.z - p.z) * 3
        : a.homeZ + Math.cos(s.elapsed * 0.05 + Number(a.id.slice(2))) * 5;
    const dx = tx - a.x,
      dz = tz - a.z,
      len = Math.hypot(dx, dz),
      speed = aggro ? 2.65 : flee ? 3.5 : 0.55;
    if (len > 0.1) {
      a.x += (dx / len) * Math.min(len, speed * dt);
      a.z += (dz / len) * Math.min(len, speed * dt);
      a.heading = Math.atan2(dx, dz);
      const shoreDistance = Math.hypot(a.x, a.z);
      const animalBoundary = ISLAND_RADIUS - 3;
      if (shoreDistance > animalBoundary) {
        a.x *= animalBoundary / shoreDistance;
        a.z *= animalBoundary / shoreDistance;
      }
    }
    if (aggro && d < 1.55 && a.attack <= 0) {
      a.windup = 0.7;
      effects.push(...toast("Das Wildschwein scharrt! Weiche zur Seite aus."));
    }
  }
  if (s.endgame.signalActive && p.health > 0) {
    const fire = s.buildings.find((b) => b.kind === "signal");
    if (fire && fire.fuel > 0 && s.weather.kind === "clear") {
      s.endgame.signalProgress += dt;
      if (s.endgame.signalProgress >= 300) {
        s.endgame.won = "signal";
        s.endgame.signalActive = false;
        effects.push(
          ...success(
            "Ein Schiff hat dein Signal gesehen. Du bist gerettet!",
            "success",
          ),
        );
      }
    } else if (!fire || fire.fuel <= 0) s.endgame.signalActive = false;
  }
}
export function step(s: GameState, dt: number, input: InputIntent): Effect[] {
  if (!Number.isFinite(dt) || dt <= 0 || s.player.health <= 0 || s.endgame.won)
    return [];
  dt = Math.min(dt, 2);
  const effects: Effect[] = [];
  const p = s.player,
    moving = Math.hypot(input.x, input.z) > 0.01,
    sprinting = moving && input.sprint && p.stamina > 2;
  if (s.adventure.location === "sea") sail(s, dt, input, effects);
  else if (moving) {
    s.adventure.actionPose = { kind: "idle", remaining: 0 };
    const length = Math.max(1, Math.hypot(input.x, input.z)),
      speed =
        (s.adventure.sneaking ? 2.2 : sprinting ? 6.7 : 4.4) *
        (p.warmth < 20 ? 0.75 : 1);
    p.x += (input.x / length) * speed * dt;
    p.z += (input.z / length) * speed * dt;
    p.heading = Math.atan2(input.x, input.z);
    const island = ISLETS.find((i) => i.id === s.adventure.location);
    const cx = island?.x ?? 0,
      cz = island?.z ?? 0,
      boundary = island ? island.radius - 2 : ISLAND_RADIUS;
    const radial = Math.hypot(p.x - cx, p.z - cz);
    if (radial > boundary) {
      p.x = cx + ((p.x - cx) * boundary) / radial;
      p.z = cz + ((p.z - cz) * boundary) / radial;
    }
    if (s.fishing.active) {
      s.fishing.active = false;
      effects.push(...toast("Angel eingeholt."));
    }
  }
  p.stamina = clamp(
    p.stamina +
      dt *
        (sprinting
          ? -14 * (perk(s, "endurance") ? 0.75 : 1) * (p.rested > 0 ? 0.75 : 1)
          : 12),
  );
  advanceWorld(s, dt, effects);
  for (const place of PLACES)
    if (
      dist(p, place) < place.radius &&
      !s.progression.discovered.includes(place.id)
    ) {
      s.progression.discovered.push(place.id);
      s.progression.xp.survival += 15;
      effects.push(...success(`Entdeckt: ${place.name}`, "discover"));
    }
  if (s.fishing.active) {
    const before = s.fishing.elapsed;
    s.fishing.elapsed += dt;
    if (before < s.fishing.biteAt && s.fishing.elapsed >= s.fishing.biteAt)
      effects.push(
        { type: "toast", message: "Ein Biss! Jetzt E drücken!" },
        { type: "sound", id: "fish" },
      );
    if (s.fishing.elapsed > s.fishing.biteAt + s.fishing.window) {
      s.fishing.active = false;
      effects.push(
        ...toast("Der Fisch ist entkommen. Erneut E zum Auswerfen."),
      );
    }
  }
  return effects;
}
type Target =
  | { kind: "resource"; value: ResourceState }
  | { kind: "animal"; value: AnimalState }
  | { kind: "building"; value: BuildingState }
  | { kind: "spring"; value: typeof SPRING }
  | { kind: "fishing"; value: typeof SPRING };
function target(s: GameState): Target | null {
  const weapon = owns(s, "improvedSpear") || owns(s, "spear");
  const range = owns(s, "improvedSpear") ? 3.8 : 2.8;
  const threat = s.animals
    .filter((a) => a.hp > 0 && a.kind === "boar" && dist(s.player, a) < range)
    .sort((a, b) => dist(s.player, a) - dist(s.player, b))[0];
  if (threat && weapon) return { kind: "animal", value: threat };
  let result: Target | null = null,
    best = Infinity;
  function offer(t: Target, r: number) {
    const d = dist(s.player, t.value);
    if (d < r && d < best) {
      result = t;
      best = d;
    }
  }
  for (const r of s.resources)
    if (r.remaining > 0) offer({ kind: "resource", value: r }, 2.7);
  for (const a of s.animals)
    if (a.hp > 0) offer({ kind: "animal", value: a }, range);
  for (const b of s.buildings)
    if (b.health > 0) offer({ kind: "building", value: b }, 4);
  offer({ kind: "spring", value: SPRING }, 4.5);
  if (owns(s, "fishingRod"))
    for (const spot of FISHING_SPOTS)
      offer({ kind: "fishing", value: spot }, 5);
  return result;
}
export function getPrompt(s: GameState): { text: string; id: string | null } {
  if (s.fishing.active)
    return {
      text:
        s.fishing.elapsed >= s.fishing.biteAt
          ? "E · BISS! Einholen"
          : "Warte auf einen Biss …",
      id: "fishing",
    };
  const adventure = adventurePrompt(s);
  if (adventure) return adventure;
  const t = target(s);
  if (!t) return { text: "", id: null };
  if (t.kind === "resource")
    return { text: `E · ${ITEMS[t.value.kind].name} sammeln`, id: t.value.id };
  if (t.kind === "animal")
    return {
      text: `E · ${t.value.kind === "boar" ? "Wildschwein" : "Kaninchen"} jagen`,
      id: t.value.id,
    };
  if (t.kind === "spring")
    return { text: "E · Trinken / Wasser abfüllen", id: "spring" };
  if (t.kind === "fishing")
    return {
      text: "E · Angel auswerfen",
      id: `fish:${FISHING_SPOTS.indexOf(t.value)}`,
    };
  const b = t.value,
    name = RECIPES.find((r) => r.building === b.kind)?.name ?? b.kind;
  const extra =
    b.kind === "fire" || b.kind === "cooker"
      ? ` · ${Math.ceil(b.fuel)}s Glut`
      : b.kind === "trap" || b.kind === "bigTrap"
        ? b.ready
          ? " · Beute abholen"
          : ` · ${Math.floor((b.progress / 180) * 100)} %`
        : b.kind === "farm"
          ? b.ready
            ? " · Ernten"
            : b.planted
              ? ` · ${Math.floor((b.progress / 480) * 100)} %`
              : " · Pflanzen"
          : b.kind === "raincatcher"
            ? ` · ${Math.floor(b.water)} Wasser`
            : "";
  return { text: `E · ${name}${extra}`, id: b.id };
}
function gather(s: GameState, r: ResourceState): Effect[] {
  const axe = owns(s, "metalAxe") ? "metalAxe" : owns(s, "axe") ? "axe" : null,
    pick = owns(s, "metalPickaxe")
      ? "metalPickaxe"
      : owns(s, "pickaxe")
        ? "pickaxe"
        : null;
  if (r.kind === "hardwood" && !axe)
    return toast("Für Hartholz brauchst du eine Axt.");
  if ((r.kind === "ore" || r.kind === "coal") && !pick)
    return toast("Dafür brauchst du eine Spitzhacke.");
  if (
    (r.kind === "ore" || r.kind === "coal") &&
    regionAt(r.x, r.z) === "cave" &&
    !owns(s, "torch")
  )
    return toast("In der Höhle brauchst du eine Fackel.");
  if (r.kind === "boatPart" && !owns(s, "hammer"))
    return toast("Löse die Beschläge mit einem Hammer.");
  const woody = r.kind === "wood" || r.kind === "hardwood",
    rocky = ["stone", "flint", "ore", "coal"].includes(r.kind),
    plant = ["fiber", "berry", "herb", "resin"].includes(r.kind);
  let amount = woody
    ? axe === "metalAxe"
      ? 7
      : axe
        ? 5
        : 3
    : rocky
      ? pick === "metalPickaxe"
        ? 6
        : pick
          ? 4
          : 2
      : plant && owns(s, "knife")
        ? 3
        : 2;
  if (woody && perk(s, "lumber")) amount++;
  if (rocky && perk(s, "miner")) amount++;
  if (plant && perk(s, "botany")) amount++;
  const loot: Inventory = { [r.kind]: amount };
  if (r.kind === "berry") loot.seed = 1;
  if (!addItems(s.inventory, loot, capacity(s)))
    return toast("Inventar voll — baue eine Kiste oder lagere Material ein.");
  if (woody && axe) wear(s, axe, 0.7);
  if (rocky && pick) wear(s, pick, 0.7);
  if (plant && owns(s, "knife")) wear(s, "knife", 0.4);
  if (r.kind === "boatPart") wear(s, "hammer", 1);
  r.remaining--;
  if (r.remaining <= 0)
    r.respawn =
      r.kind === "boatPart" || r.kind === "cloth" || r.kind === "metal"
        ? 900
        : 600;
  s.progression.gathered += amount;
  s.progression.xp.gathering += 2;
  s.cooldown = 0.4;
  return [
    {
      type: "toast",
      message: `+${amount} ${ITEMS[r.kind].name}${loot.seed ? " · +1 Samen" : ""}`,
    },
    { type: "sound", id: rocky ? "stone" : woody ? "wood" : "gather" },
    { type: "burst", x: r.x, z: r.z },
  ];
}
function hunt(s: GameState, a: AnimalState): Effect[] {
  const weapon = owns(s, "improvedSpear")
    ? "improvedSpear"
    : owns(s, "spear")
      ? "spear"
      : null;
  if (!weapon) return toast("Stelle zuerst einen Speer her.");
  const damage =
    (weapon === "improvedSpear" ? 42 : 25) * (perk(s, "hunter") ? 1.2 : 1);
  const loot: Inventory = {
    meat: a.kind === "boar" ? (owns(s, "knife") ? 4 : 3) : 1,
    hide: owns(s, "knife") ? 2 : 1,
    bone: 1,
  };
  if (a.hp <= damage && !canAdd(s.inventory, loot, capacity(s)))
    return toast("Für die Jagdbeute ist kein Platz im Inventar.");
  a.hp -= damage;
  wear(s, weapon, 0.8);
  s.cooldown = 0.55;
  const effects: Effect[] = [
    { type: "sound", id: "hit" },
    { type: "burst", x: a.x, z: a.z },
  ];
  if (a.hp <= 0) {
    a.hp = 0;
    a.respawn = 720;
    addItems(s.inventory, loot, capacity(s));
    s.progression.kills++;
    s.progression.xp.hunting += 12;
    effects.push(
      ...toast(`Jagdbeute: ${loot.meat} Fleisch, ${loot.hide} Haut, 1 Knochen`),
    );
    if (owns(s, "knife")) wear(s, "knife", 0.5);
  }
  return effects;
}
function drink(s: GameState, b?: BuildingState): Effect[] {
  if (b && b.water < 1) return toast("Der Regenfänger braucht noch Regen.");
  const amount = b ? Math.min(3, Math.floor(b.water)) : 3;
  const filled =
    owns(s, "canteen") && addItems(s.inventory, { water: amount }, capacity(s));
  if (b) b.water -= filled ? amount : 1;
  s.player.thirst = 100;
  if (!s.progression.drank) s.progression.xp.survival += 5;
  s.progression.drank = true;
  s.cooldown = 0.5;
  return success(
    filled
      ? "Getrunken und Wasser abgefüllt."
      : owns(s, "canteen")
        ? "Getrunken. Für weitere Wasservorräte fehlt Inventarplatz."
        : "Frisches Wasser getrunken.",
    "water",
  );
}
function buildingInteraction(s: GameState, b: BuildingState): Effect[] {
  if (b.kind === "fire" || b.kind === "cooker" || b.kind === "signal") {
    if (b.kind === "signal" && b.fuel > 300 && !s.endgame.signalActive) {
      s.endgame.signalActive = true;
      return success(
        "Signal entzündet. Sammle fünf klare Minuten bis zur Sichtung; Wolken pausieren die Sichtung.",
        "fire",
      );
    }
    if (!consume(s.inventory, { wood: 2 }))
      return toast("Zum Nachlegen brauchst du 2 Holz.");
    b.fuel = Math.min(1800, b.fuel + 180);
    if (b.kind === "signal") s.endgame.signalActive = true;
    return success("Feuer geschürt: +3 Minuten Brennstoff.", "fire");
  }
  if (b.kind === "raincatcher") return drink(s, b);
  if (b.kind === "trap" || b.kind === "bigTrap") {
    if (!b.ready)
      return toast(
        `Die Falle arbeitet: ${Math.floor((b.progress / 180) * 100)} %.`,
      );
    const loot: Inventory =
      b.kind === "bigTrap"
        ? { meat: 4, hide: 2, bone: 2 }
        : { meat: 1, hide: 1, bone: 1 };
    if (!addItems(s.inventory, loot, capacity(s)))
      return toast("Inventar voll; die Beute bleibt sicher in der Falle.");
    b.ready = false;
    b.progress = 0;
    s.progression.xp.hunting += 8;
    return success(
      "Fallenbeute eingesammelt. Die Falle ist wieder scharf.",
      "gather",
    );
  }
  if (b.kind === "farm") return farm(s, b, b.ready ? "harvest" : "plant");
  return [{ type: "open", id: b.id }];
}
function farm(
  s: GameState,
  b: BuildingState,
  action: "plant" | "harvest",
): Effect[] {
  if (b.kind !== "farm") return toast("Das ist kein Pflanzbeet.");
  if (action === "plant") {
    if (b.planted) return toast("Hier wächst bereits etwas.");
    if (!consume(s.inventory, { seed: 1 }))
      return toast("Ein Samen fehlt. Sammle Beeren.");
    b.planted = true;
    b.progress = 0;
    b.ready = false;
    return success("Samen gepflanzt. Ernte in etwa acht Minuten.");
  }
  if (!b.ready) return toast("Die Pflanzen brauchen noch Zeit.");
  const output: Inventory = {
    potato: perk(s, "botany") ? 7 : 5,
    seed: 2,
    herb: 1,
  };
  if (!addItems(s.inventory, output, capacity(s)))
    return toast("Kein Platz für die Ernte. Sie bleibt im Beet.");
  b.planted = false;
  b.ready = false;
  b.progress = 0;
  s.progression.harvests++;
  s.progression.xp.gathering += 10;
  return success("Kartoffeln, Samen und Kräuter geerntet.", "gather");
}
function fish(s: GameState): Effect[] {
  if (!owns(s, "fishingRod"))
    return toast("Du brauchst eine Angel von der Werkbank.");
  if (
    !FISHING_SPOTS.some((p) => dist(s.player, p) < 5) &&
    !ISLETS.some(
      (i) => i.id === s.adventure.location && dist(s.player, i.dock) < 8,
    )
  )
    return toast("Suche einen Angelplatz an der Küste.");
  if (!s.fishing.active) {
    s.fishing = {
      active: true,
      elapsed: 0,
      biteAt: 3 + random(s.seed + Math.floor(s.elapsed * 10))() * 3,
      window: perk(s, "angler") ? 4 : 2.5,
    };
    return toast("Angel ausgeworfen. Warte auf den Biss, dann E!");
  }
  if (s.fishing.elapsed < s.fishing.biteAt) {
    s.fishing.active = false;
    return toast("Zu früh eingeholt. Warte beim nächsten Mal auf den Biss.");
  }
  if (s.fishing.elapsed > s.fishing.biteAt + s.fishing.window) {
    s.fishing.active = false;
    return toast("Zu spät — der Fisch ist entkommen.");
  }
  const amount = perk(s, "angler") ? 2 : 1;
  if (!addItems(s.inventory, { fish: amount }, capacity(s)))
    return toast("Kein Platz für Fisch.");
  s.fishing.active = false;
  s.progression.fishCaught += amount;
  s.progression.xp.hunting += 6;
  wear(s, "fishingRod", 0.5);
  return success(`+${amount} Fisch!`, "fish");
}
function eat(s: GameState, item?: ItemId): Effect[] {
  const food =
    item ??
    (
      [
        "cookedMeat",
        "cookedFish",
        "potato",
        "berry",
        "coconut",
        "ration",
      ] as ItemId[]
    ).find((id) => count(s.inventory, id) > 0);
  if (!food || !count(s.inventory, food))
    return toast("Keine Nahrung im Inventar.");
  const nutrition: Partial<Record<ItemId, number>> = {
    berry: 10,
    coconut: 14,
    meat: 10,
    fish: 9,
    cookedMeat: 38,
    cookedFish: 30,
    potato: 20,
    ration: 42,
    herb: 0,
    water: 0,
  };
  if (nutrition[food] === undefined)
    return toast("Dieser Gegenstand ist nicht essbar.");
  consume(s.inventory, { [food]: 1 });
  s.player.hunger = clamp(
    s.player.hunger +
      (nutrition[food] ?? 0) *
        ((food === "cookedMeat" || food === "cookedFish") && perk(s, "chef")
          ? 1.25
          : 1),
  );
  if (food === "coconut") s.player.thirst = clamp(s.player.thirst + 24);
  if (food === "water") s.player.thirst = clamp(s.player.thirst + 38);
  if (food === "herb") {
    s.player.health = clamp(s.player.health + 18);
    s.player.poison = 0;
  }
  if (food === "meat" || food === "fish") s.player.poison = 90;
  return success(
    `${ITEMS[food].name} verwendet.${food === "meat" || food === "fish" ? " Rohkost hat deinen Magen verdorben." : ""}`,
    "eat",
  );
}
function sleep(s: GameState, b: BuildingState): Effect[] {
  if (!["shelter", "bed", "cabin"].includes(b.kind))
    return toast("Hier kannst du nicht schlafen.");
  if (s.player.poison > 0)
    return toast(
      "Behandle die Vergiftung vor dem Schlafen mit einem Heilkraut.",
    );
  if (s.restCooldown > 0)
    return toast(
      `Du bist noch ausgeruht. In ${Math.ceil(s.restCooldown)} Sekunden erneut schlafen.`,
    );
  if (
    s.animals.some(
      (a) => a.kind === "boar" && a.hp > 0 && dist(s.player, a) < 12,
    )
  )
    return toast(
      "Ein Wildschwein ist zu nahe. Bringe dich zuerst in Sicherheit.",
    );
  const duration = night(s) ? ((0.24 - s.cycle + 1) % 1) * DAY_LENGTH : 180;
  const consumption=(perk(s,"thrifty") ? 0.85 : 1)*(s.adventure.mode==="cozy"?0.45:s.adventure.mode==="expedition"?1.3:1);
  if (
    s.player.hunger < duration * 0.026 * consumption + 20 ||
    s.player.thirst < duration * 0.038 * consumption + 20
  )
    return toast("Vor dem Schlafen gut essen und trinken.");
  const effects: Effect[] = [];
  let remain = duration;
  while (remain > 0) {
    const dt = Math.min(1, remain);
    advanceWorld(s, dt, effects, true);
    remain -= dt;
  }
  s.player.health = clamp(s.player.health + (b.kind === "shelter" ? 18 : 30));
  s.player.stamina = 100;
  s.player.rested = b.kind === "shelter" ? 300 : 600;
  s.restCooldown = 240;
  s.adventure.actionPose = { kind: "sleep", remaining: 2 };
  s.fishing.active = false;
  return [
    ...effects.filter((e) => e.id === "success"),
    ...success(
      `Ausgeschlafen. ${Math.round(duration / 60)} Minuten vergangen.`,
    ),
  ];
}
export function act(
  s: GameState,
  a: GameAction,
  canPlace?: (x: number, z: number) => boolean,
): Effect[] {
  if (s.player.health <= 0 || s.endgame.won) return [];
  if (a.type === "interact" && s.fishing.active) return fish(s);
  const adventureResult = adventureAction(s, a, canPlace);
  if (adventureResult !== null) return adventureResult;
  if (a.type === "craft") {
    const r = RECIPES.find((r) => r.id === a.id);
    if (!r) return toast("Unbekanntes Rezept.");
    const status = recipeStatus(s, r);
    if (!status.available) return toast(status.reason);
    let position: { x: number; z: number } | null = null;
    if (r.building) {
      const explicit = a.x !== undefined || a.z !== undefined;
      for (let attempt = 0; attempt < (explicit ? 1 : 16); attempt++) {
        const angle = s.player.heading + (attempt * Math.PI) / 8;
        const candidate = {
          x: explicit ? a.x! : s.player.x + Math.sin(angle) * 4.6,
          z: explicit ? a.z! : s.player.z + Math.cos(angle) * 4.6,
        };
        if (!placementStatus(s, r.building, candidate.x, candidate.z).available)
          continue;
        if (canPlace && !canPlace(candidate.x, candidate.z)) continue;
        position = candidate;
        break;
      }
      if (!position)
        return toast("Nicht genug Bauplatz. Gehe ein paar Schritte weiter.");
    }
    consumeNearby(s, r.cost);
    if (r.output) addItems(s.inventory, r.output, capacity(s));
    if (r.station === "cooker")
      s.adventure.actionPose = { kind: "cook", remaining: 2 };
    if (r.tool) {
      s.equipment.tools[r.tool] = 100;
      s.equipment.active = r.tool;
    }
    if (r.building && position)
      s.buildings.push({
        id: `b-${s.nextId++}`,
        kind: r.building,
        ...position,
        rotation: Number.isFinite(a.rotation) ? a.rotation! : s.player.heading,
        health: perk(s, "builder") ? 130 : 100,
        fuel:
          r.building === "fire" || r.building === "cooker"
            ? 180
            : r.building === "signal"
              ? 600
              : 0,
        inventory: {},
        progress: 0,
        water: 0,
        planted: false,
        ready: false,
      });
    if (!s.progression.crafted.includes(r.id)) s.progression.crafted.push(r.id);
    s.progression.xp.crafting += r.building ? 10 : 4;
    s.progression.unlocked = RECIPES.filter(
      (q) =>
        !(q.requires ?? []).some((req) => requirement(s, req)) &&
        (!q.station || built(s, q.station)),
    ).map((q) => q.id);
    if (r.building === "signal") s.endgame.signalActive = true;
    return success(`${r.name} hergestellt.`);
  }
  if (a.type === "eat" || a.type === "use") return eat(s, a.item);
  if (a.type === "equip") {
    if (!TOOL_IDS.includes(a.id as ToolId) || !owns(s, a.id as ToolId))
      return toast("Dieses Werkzeug fehlt oder ist kaputt.");
    s.equipment.active = a.id as ToolId;
    return success("Ausrüstung gewechselt.");
  }
  if (a.type === "repair") {
    if (
      !TOOL_IDS.includes(a.id as ToolId) ||
      s.equipment.tools[a.id as ToolId] === undefined
    )
      return toast("Werkzeug nicht vorhanden.");
    if ((s.equipment.tools[a.id as ToolId] ?? 0) >= 100)
      return toast("Werkzeug ist bereits in gutem Zustand.");
    const cost =
      owns(s, "repairKit") || perk(s, "builder")
        ? { wood: 1, stone: 1 }
        : { wood: 2, stone: 2 };
    if (!consume(s.inventory, cost))
      return toast("Reparatur benötigt Holz und Stein.");
    s.equipment.tools[a.id as ToolId] = 100;
    return success("Werkzeug vollständig repariert.");
  }
  if (a.type === "perk") {
    const p = PERKS.find((p) => p.id === a.id);
    if (!p) return toast("Unbekannte Fähigkeit.");
    if (perk(s, p.id)) return toast("Bereits gelernt.");
    if (s.progression.xp[p.skill] < p.cost)
      return toast("Noch nicht genug Erfahrung in dieser Fähigkeit.");
    s.progression.xp[p.skill] -= p.cost;
    s.progression.perks.push(p.id);
    return success(`${p.name} gelernt.`, "success");
  }
  if (a.type === "fish") return fish(s);
  if (a.type === "interact") {
    if (s.cooldown > 0) return [];
    if (s.fishing.active) return fish(s);
    const t = target(s);
    if (!t) return toast("Gehe näher an ein Objekt heran.");
    if (t.kind === "resource") return gather(s, t.value);
    if (t.kind === "animal") return hunt(s, t.value);
    if (t.kind === "spring") return drink(s);
    if (t.kind === "fishing") return fish(s);
    return buildingInteraction(s, t.value);
  }
  if (a.type === "drink" && (!a.id || a.id === "spring")) {
    if (dist(s.player, SPRING) > 4.5)
      return toast("Gehe zur Quelle oder verwende einen Wasservorrat.");
    return drink(s);
  }
  const b =
    s.buildings.find((b) => b.id === a.id) ??
    (a.type === "raft" || a.type === "depart" ? near(s, "raft", 8) : undefined);
  if (!b || dist(s.player, b) > 8)
    return toast("Gehe näher an das Gebäude heran.");
  if (a.type === "deposit" || a.type === "withdraw") {
    if (b.kind !== "chest" || !a.item)
      return toast("Wähle einen Gegenstand in einer Lagerkiste.");
    const depositing = a.type === "deposit";
    const ok = transfer(
      depositing ? s.inventory : b.inventory,
      depositing ? b.inventory : s.inventory,
      a.item,
      a.amount ?? 1,
      depositing ? 32 : capacity(s),
    );
    return ok
      ? success("Gegenstände übertragen.")
      : toast("Nicht genug Gegenstände oder kein freier Lagerplatz.");
  }
  if (a.type === "plant" || a.type === "harvest") return farm(s, b, a.type);
  if (a.type === "sleep") return sleep(s, b);
  if (a.type === "drink" && b.kind === "raincatcher") return drink(s, b);
  if (a.type === "raft") {
    if (b.kind !== "raft") return toast("Gehe zum Floßbauplatz.");
    const stage = RAFT_STAGES[s.endgame.raftStage];
    if (!stage)
      return toast(
        "Das Floß ist fertig. Warte auf ruhiges Wetter und fahre ab.",
      );
    const requirements = [
      "tool:metalAxe",
      "tool:hammer",
      "built:advancedBench",
      "discovered:north",
      "discovered:cave",
    ];
    if (s.endgame.raftStage >= 4) requirements.push("tool:repairKit");
    if (s.endgame.raftStage === 5)
      requirements.push("tool:canteen", "built:dryer");
    for (const req of requirements) {
      const reason = requirement(s, req);
      if (reason) return toast(reason);
    }
    if (!consumeNearby(s, stage.cost))
      return toast(`Für „${stage.name}“ fehlen Materialien.`);
    s.endgame.raftStage++;
    b.progress = s.endgame.raftStage;
    s.progression.xp.crafting += 20;
    return success(`Floß ${s.endgame.raftStage}/6: ${stage.name} fertig.`);
  }
  if (a.type === "depart") {
    if (b.kind !== "raft" || s.endgame.raftStage < RAFT_STAGES.length)
      return toast("Baue zunächst alle sechs Floßstufen.");
    if (s.weather.kind === "storm" || s.weather.kind === "rain")
      return toast(
        "Die See ist zu rau. Warte auf klares oder bewölktes Wetter.",
      );
    if (s.player.health < 35 || s.player.hunger < 25 || s.player.thirst < 25)
      return toast("Stärke dich vor der Überfahrt.");
    const length = Math.hypot(b.x, b.z) || 1;
    s.adventure.voyage.homeDock = {
      x: (b.x / length) * 93,
      z: (b.z / length) * 93,
    };
    s.adventure.voyage.unlocked = true;
    s.adventure.location = "sea";
    s.player.x = s.adventure.voyage.homeDock.x;
    s.player.z = s.adventure.voyage.homeDock.z;
    return success(
      "Die Segel stehen! Steuere mit WASD. Reise zu Korallenwacht, Glutinsel und Letztes Licht. E legt am Anleger an.",
      "success",
    );
  }
  return toast("Hier ist diese Aktion nicht möglich.");
}
export function getObjective(s: GameState): string {
  if (s.endgame.won)
    return s.endgame.won === "raft"
      ? "Du hast die Insel mit deinem Floß verlassen."
      : "Dein Signal wurde gesehen. Du bist gerettet!";
  if (s.adventure.location === "sea")
    return "Segle zu den markierten Inseln. E legt am Anleger an. Korallenwacht: Osten · Glutinsel: Nordwesten · Leuchtturm: Norden.";
  if (s.adventure.location !== "home")
    return s.adventure.location === "lighthouse"
      ? "Setze Linse und Batterie ein und rufe am Leuchtfeuer die Rettung."
      : "Folge den drei Expeditionshinweisen. Das Floß wartet am Anleger; E bringt dich zurück an Bord.";
  if (!s.progression.drank)
    return "Finde die Smaragdquelle nordwestlich vom Strand und trinke mit E.";
  if (!built(s, "fire"))
    return "Dein erstes Lager: 5 Holz und 3 Stein sammeln; mit B ein Lagerfeuer bauen.";
  if (!built(s, "shelter"))
    return "Baue einen Unterschlupf aus 8 Holz und 6 Fasern.";
  if (!built(s, "workbench"))
    return "Flechte Seil und baue eine Werkbank. Stelle danach Axt und Spitzhacke her.";
  if (!owns(s, "axe") && !owns(s, "metalAxe"))
    return "Stelle an deiner Werkbank eine Axt her — sie erschließt Hartholz.";
  if (!owns(s, "pickaxe") && !owns(s, "metalPickaxe"))
    return "Eine Spitzhacke erschließt Erz. Stelle sie an der Werkbank her.";
  if (!built(s, "trap") && !owns(s, "fishingRod") && !built(s, "farm"))
    return "Sichere Nahrung: baue eine Falle, eine Angel oder ein Pflanzbeet.";
  if (!s.progression.discovered.includes("north"))
    return "Erkunde die Nordküste und finde das Wrack der Morgenstern.";
  if (!s.progression.discovered.includes("cave"))
    return "Fertige eine Fackel und erkunde die Basalthöhle im Nordosten.";
  if (!built(s, "advancedBench"))
    return "Baue eine verbesserte Werkbank mit Metall vom Wrack.";
  if (s.endgame.signalActive)
    return `Signalfeuer: ${Math.floor(s.endgame.signalProgress)}/300 gesammelte klare Sekunden. Halte es am Brennen.`;
  if (!built(s, "raft"))
    return "Zwei Wege nach Hause: Floßbauplatz an der Küste oder Signalfeuer am Windgrat.";
  if (s.endgame.raftStage < RAFT_STAGES.length)
    return `Floß ${s.endgame.raftStage}/6 — nächste Stufe: ${RAFT_STAGES[s.endgame.raftStage].name}. E am Floßbauplatz.`;
  return "Das Floß ist seetüchtig. Stärke dich und starte bei ruhigem Wetter.";
}

export function placementStatus(
  s: GameState,
  kind: BuildingKind,
  x: number,
  z: number,
  movingId?: string,
): { available: boolean; reason: string } {
  let reason = "";
  const island = ISLETS.find((i) => i.id === s.adventure.location);
  const radius = island ? island.radius - 3 : 94;
  if (!Number.isFinite(x) || !Number.isFinite(z)) reason = "Ungültige Position";
  else if (s.adventure.location === "sea") reason = "Auf See ist kein Bauplatz";
  else if (Math.hypot(x - (island?.x ?? 0), z - (island?.z ?? 0)) > radius)
    reason = "Bauplatz muss an Land liegen";
  else if (dist(s.player, { x, z }) > 12)
    reason = "Bauplatz ist zu weit entfernt";
  else if (
    s.buildings.some((b) => b.id !== movingId && dist(b, { x, z }) < 4.2)
  )
    reason = "Zu nah an einem Gebäude";
  else if (
    kind === "raft" &&
    (s.adventure.location !== "home" || Math.hypot(x, z) < 65)
  )
    reason = "Floßbauplatz gehört an die Heimatküste";
  else if (
    kind === "signal" &&
    (s.adventure.location !== "home" ||
      dist(
        { x, z },
        PLACES.find((p) => p.id === "mountain")!,
      ) > 14)
  )
    reason = "Signalfeuer gehört auf den Windgrat";
  return { available: !reason, reason };
}
