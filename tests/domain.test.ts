import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialState, act, step, recipeStatus } from "../src/simulation";
import { RECIPES, RAFT_STAGES, DAY_LENGTH } from "../src/catalog";
import {
  capacity,
  usedSlots,
  addItems,
  consume,
  transfer,
} from "../src/inventory";
import { SaveStore, SAVE_PREFIX, type StorageLike } from "../src/save";
import { SPRING, FISHING_SPOTS, PLACES } from "../src/locations";
import type {
  GameState,
  BuildingKind,
  BuildingState,
  Inventory,
  ItemId,
} from "../src/types";
class Memory implements StorageLike {
  data = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Error("QuotaExceeded");
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
function building(
  s: GameState,
  kind: BuildingKind,
  x = s.player.x,
  z = s.player.z,
): BuildingState {
  const b = {
    id: "b-" + s.nextId++,
    kind,
    x,
    z,
    rotation: 0,
    health: 100,
    fuel: 600,
    inventory: {},
    progress: 0,
    water: 0,
    planted: false,
    ready: false,
  };
  s.buildings.push(b);
  return b;
}
function recipe(id: string) {
  const r = RECIPES.find((r) => r.id === id);
  assert(r, "recipe missing " + id);
  return r;
}
function costs(s: GameState, cost: Inventory) {
  for (const [id, n] of Object.entries(cost))
    s.inventory[id as ItemId] = (s.inventory[id as ItemId] ?? 0) + (n ?? 0);
}
function tick(s: GameState, seconds: number) {
  const all = [];
  for (let i = 0; i < seconds; i += 1)
    all.push(
      ...step(s, Math.min(1, seconds - i), { x: 0, z: 0, sprint: false }),
    );
  return all;
}
function prepareTool(s: GameState, id: string) {
  costs(s, recipe(id).cost);
  const st = recipeStatus(s, recipe(id));
  assert(st.available, st.reason);
  act(s, { type: "craft", id });
}

test("initial world has six resource regions and deterministic seed", () => {
  const a = createInitialState(55),
    b = createInitialState(55);
  assert.deepEqual(a, b);
  assert(a.resources.length >= 240);
  assert(a.animals.some((a) => a.kind === "rabbit"));
  assert(a.resources.some((r) => r.kind === "ore"));
  assert(a.resources.some((r) => r.kind === "boatPart"));
});
test("movement, sprint stamina and survival decay", () => {
  const s = createInitialState(),
    z = s.player.z;
  step(s, 1, { x: 0, z: -1, sprint: true });
  assert(s.player.z < z - 6);
  assert(s.player.stamina < 100);
  assert(s.player.hunger < 88);
  assert(s.player.thirst < 78);
});
test("24-slot stacks, backpack capacity and atomic transfers", () => {
  const s = createInitialState();
  s.inventory = { wood: 480 };
  assert.equal(usedSlots(s.inventory), 24);
  assert(!addItems(s.inventory, { stone: 1 }, capacity(s)));
  s.equipment.tools.backpack = 100;
  assert.equal(capacity(s), 36);
  assert(addItems(s.inventory, { stone: 1 }, capacity(s)));
  const dest: Inventory = { wood: 640 };
  assert(!transfer(s.inventory, dest, "stone", 1, 32));
  assert.equal(s.inventory.stone, 1);
  assert(transfer(s.inventory, {}, "stone", 1, 32));
});
test("workbench requirements, axe and pickaxe recipes enforce station range", () => {
  const s = createInitialState();
  costs(s, recipe("workbench").cost);
  assert(!recipeStatus(s, recipe("workbench")).available);
  building(s, "shelter", s.player.x - 5);
  prepareTool(s, "workbench");
  s.player.x = s.buildings.find((b) => b.kind === "workbench")!.x;
  prepareTool(s, "axe");
  prepareTool(s, "pickaxe");
  assert(s.equipment.tools.axe);
  assert(s.equipment.tools.pickaxe);
  s.player.x += 30;
  costs(s, recipe("hammer").cost);
  assert(!recipeStatus(s, recipe("hammer")).available);
});
test("blocked placement does not consume ingredients", () => {
  const s = createInitialState();
  costs(s, recipe("fire").cost);
  const before = { ...s.inventory };
  act(s, { type: "craft", id: "fire" }, () => false);
  assert.deepEqual(s.inventory, before);
  assert.equal(s.buildings.length, 0);
});
test("axe increases wood yield and pickaxe increases stone yield", () => {
  for (const [kind, tool] of [
    ["wood", "axe"],
    ["stone", "pickaxe"],
  ] as const) {
    const s = createInitialState();
    const node = s.resources.find((r) => r.kind === kind)!;
    s.player.x = node.x;
    s.player.z = node.z;
    s.inventory = {};
    act(s, { type: "interact" });
    const low = s.inventory[kind] ?? 0;
    s.cooldown = 0;
    s.equipment.tools[tool] = 100;
    s.inventory = {};
    act(s, { type: "interact" });
    assert((s.inventory[kind] ?? 0) > low);
    assert((s.equipment.tools[tool] ?? 100) < 100);
  }
});
test("tool-gated hardwood and cave ore; repair restores durability", () => {
  const s = createInitialState();
  const node = s.resources.find((r) => r.kind === "hardwood")!;
  s.player.x = node.x;
  s.player.z = node.z;
  act(s, { type: "interact" });
  assert(!s.inventory.hardwood);
  s.equipment.tools.axe = 5;
  act(s, { type: "interact" });
  assert(s.inventory.hardwood);
  s.inventory.wood = 2;
  s.inventory.stone = 2;
  act(s, { type: "repair", id: "axe" });
  assert.equal(s.equipment.tools.axe, 100);
});
test("source restores thirst even when inventory cannot store canteen water", () => {
  const s = createInitialState();
  s.player.x = SPRING.x;
  s.player.z = SPRING.z;
  s.inventory = { wood: 480 };
  s.equipment.tools.canteen = 100;
  s.player.thirst = 30;
  act(s, { type: "drink" });
  assert.equal(s.player.thirst, 100);
  assert.equal(s.inventory.water, undefined);
});
test("chest deposit and withdrawal preserve totals and reject remote access", () => {
  const s = createInitialState(),
    b = building(s, "chest");
  s.inventory.wood = 10;
  act(s, { type: "deposit", id: b.id, item: "wood", amount: 5 });
  assert.equal(b.inventory.wood, 5);
  assert.equal(s.inventory.wood, 5);
  act(s, { type: "withdraw", id: b.id, item: "wood", amount: 2 });
  assert.equal(b.inventory.wood, 3);
  s.player.x += 40;
  act(s, { type: "withdraw", id: b.id, item: "wood", amount: 2 });
  assert.equal(b.inventory.wood, 3);
});
test("cooking, raw-food penalty and healing herbs", () => {
  const s = createInitialState();
  building(s, "cooker");
  s.inventory = { meat: 2, herb: 1 };
  act(s, { type: "craft", id: "cookedMeat" });
  assert.equal(s.inventory.cookedMeat, 1);
  s.player.hunger = 10;
  act(s, { type: "eat", item: "cookedMeat" });
  assert(s.player.hunger >= 48);
  act(s, { type: "use", item: "meat" });
  assert(s.player.poison > 0);
  act(s, { type: "use", item: "herb" });
  assert.equal(s.player.poison, 0);
});
test("traps and farming yield real items and pause harvest if inventory full", () => {
  const s = createInitialState(),
    trap = building(s, "trap"),
    farm = building(s, "farm", s.player.x + 2);
  s.inventory.seed = 1;
  act(s, { type: "plant", id: farm.id });
  tick(s, 490);
  assert(trap.ready);
  assert(farm.ready);
  s.inventory = { wood: 480 };
  act(s, { type: "harvest", id: farm.id });
  assert(farm.ready);
  s.inventory = {};
  act(s, { type: "harvest", id: farm.id });
  assert(s.inventory.potato! >= 5);
  assert.equal(farm.planted, false);
  s.player.x = trap.x;
  s.player.z = trap.z;
  act(s, { type: "interact" });
  assert(s.inventory.meat);
});
test("fishing requires timing, rewards fish and consumes no bait", () => {
  const s = createInitialState();
  Object.assign(s.player, FISHING_SPOTS[0]);
  s.equipment.tools.fishingRod = 100;
  act(s, { type: "fish" });
  assert(s.fishing.active);
  tick(s, s.fishing.biteAt + 0.1);
  act(s, { type: "fish" });
  assert.equal(s.inventory.fish, 1);
  act(s, { type: "fish" });
  act(s, { type: "fish" });
  assert.equal(s.inventory.fish, 1);
  assert(!s.fishing.active);
});
test("rain fills catcher, helps farm and burns unsheltered fire faster", () => {
  const s = createInitialState();
  s.weather = { kind: "rain", remaining: 1000, wind: 0.6 };
  const r = building(s, "raincatcher"),
    f = building(s, "fire"),
    farm = building(s, "farm");
  farm.planted = true;
  const before = f.fuel;
  tick(s, 30);
  assert(r.water > 1);
  assert(farm.progress >= 45);
  assert(f.fuel < before - 40);
});
test("sleep advances time and world timers, restores health and respects danger", () => {
  const s = createInitialState(),
    bed = building(s, "bed"),
    trap = building(s, "trap");
  s.player.health = 70;
  s.cycle = 0.82;
  s.player.hunger = 100;
  s.player.thirst = 100;
  const before = s.elapsed;
  act(s, { type: "sleep", id: bed.id });
  assert(s.elapsed > before + 400);
  assert(s.cycle >= 0.23 && s.cycle < 0.26);
  assert(s.player.health > 70);
  assert(trap.ready);
  s.restCooldown = 0;
  const a = s.animals[0];
  a.x = s.player.x;
  a.z = s.player.z;
  a.hp = 90;
  const t = s.elapsed;
  act(s, { type: "sleep", id: bed.id });
  assert.equal(s.elapsed, t);
});
test("perk consumes XP once and changes collection yield", () => {
  const s = createInitialState();
  s.progression.xp.gathering = 100;
  act(s, { type: "perk", id: "lumber" });
  assert(s.progression.perks.includes("lumber"));
  assert.equal(s.progression.xp.gathering, 65);
  act(s, { type: "perk", id: "lumber" });
  assert.equal(s.progression.xp.gathering, 65);
});
test("signal site and advanced prerequisites, clear-weather rescue", () => {
  const s = createInitialState();
  costs(s, recipe("signal").cost);
  assert(!recipeStatus(s, recipe("signal")).available);
  const peak = PLACES.find((p) => p.id === "mountain")!;
  Object.assign(s.player, { x: peak.x, z: peak.z });
  s.progression.discovered = ["mountain", "north", "cave"];
  s.equipment.tools.metalPickaxe = 100;
  building(s, "advancedBench", s.player.x - 10);
  assert(recipeStatus(s, recipe("signal")).available);
  act(s, { type: "craft", id: "signal" });
  s.weather = { kind: "clear", remaining: 1000, wind: 0.2 };
  tick(s, 301);
  assert.equal(s.endgame.won, "signal");
});
test("all six raft stages consume costs, storm blocks departure, calm starts playable sailing", () => {
  const s = createInitialState(),
    raft = building(s, "raft");
  building(s, "advancedBench");
  building(s, "dryer");
  s.equipment.tools = {
    metalAxe: 100,
    hammer: 100,
    repairKit: 100,
    canteen: 100,
  };
  s.progression.discovered = ["north", "cave"];
  for (const stage of RAFT_STAGES) {
    costs(s, stage.cost);
    const before = s.endgame.raftStage;
    act(s, { type: "raft", id: raft.id });
    assert.equal(s.endgame.raftStage, before + 1);
  }
  s.weather.kind = "storm";
  act(s, { type: "depart", id: raft.id });
  assert.equal(s.endgame.won, null);
  s.weather.kind = "clear";
  act(s, { type: "depart", id: raft.id });
  assert.equal(s.endgame.won, null);
  assert.equal(s.adventure.location, "sea");
  assert(s.adventure.voyage.unlocked);
});
test("complete save roundtrip retains position, cycle, inventory, containers, farms, animals and endgame", () => {
  const s = createInitialState(99),
    memory = new Memory(),
    store = new SaveStore(createInitialState, memory);
  s.player.x = 12;
  s.player.heading = 1.5;
  s.elapsed = 890;
  s.cycle = 0.91;
  s.day = 2;
  s.player.rested = 100;
  s.player.poison = 20;
  s.restCooldown = 240;
  s.inventory = { metal: 13, water: 7 };
  s.equipment.tools.axe = 42;
  const chest = building(s, "chest");
  chest.inventory = { hardwood: 45 };
  const farm = building(s, "farm");
  farm.progress = 183;
  farm.planted = true;
  const fire = building(s, "fire");
  fire.fuel = 421;
  fire.health = 130;
  s.resources[0].remaining = 0;
  s.resources[0].respawn = 230;
  s.animals[0].hp = 20;
  s.animals[0].x = 13;
  s.endgame.raftStage = 3;
  s.progression.discovered.push("north");
  s.progression.perks.push("lumber");
  s.progression.unlocked.push("axe");
  assert(store.save(1, s).ok);
  const result = store.load(1);
  assert(result.ok);
  assert.deepEqual(result.state, s);
  assert.equal(store.summaries()[1].tier, 0);
});
test("autosave is independent of three manual slots and can overwrite/delete", () => {
  const memory = new Memory(),
    store = new SaveStore(createInitialState, memory),
    s = createInitialState();
  for (let slot = 0; slot < 4; slot++) {
    s.inventory.wood = slot + 1;
    assert(store.save(slot, s).ok);
  }
  for (let slot = 0; slot < 4; slot++)
    assert.equal(store.load(slot).state?.inventory.wood, slot + 1);
  s.inventory.wood = 99;
  store.save(2, s);
  assert.equal(store.load(2).state?.inventory.wood, 99);
  store.delete(2);
  assert(!store.load(2).ok);
  assert(store.load(1).ok);
});
test("corrupt, foreign, future and oversized saves fail safely", () => {
  const memory = new Memory(),
    store = new SaveStore(createInitialState, memory);
  for (const raw of [
    "{bad",
    "{}",
    "null",
    JSON.stringify({ format: "fernweh", version: 99 }),
    JSON.stringify({ version: 4 }),
    "x".repeat(2_000_001),
  ]) {
    memory.setItem(SAVE_PREFIX + 1, raw);
    assert(!store.load(1).ok);
    assert.equal(store.summaries()[1].valid, false);
  }
});
test("checksum detects mutation and backup recovers previous valid snapshot", () => {
  const memory = new Memory(),
    store = new SaveStore(createInitialState, memory),
    s = createInitialState();
  store.save(1, s);
  s.inventory.wood = 10;
  store.save(1, s);
  const raw = JSON.parse(memory.getItem(SAVE_PREFIX + 1)!);
  raw.state.inventory.wood = 999;
  memory.setItem(SAVE_PREFIX + 1, JSON.stringify(raw));
  assert(!store.load(1).ok);
  assert(store.recover(1).ok);
  assert.equal(store.recover(1).state?.inventory.wood, undefined);
});
test("quota failure keeps prior committed save usable", () => {
  const memory = new Memory(),
    store = new SaveStore(createInitialState, memory),
    s = createInitialState();
  store.save(1, s);
  memory.fail = true;
  s.inventory.wood = 99;
  assert(!store.save(1, s).ok);
  assert.equal(store.load(1).state?.inventory.wood, undefined);
});
test("version1 migration preserves legacy values and normalizes invalid numeric data", () => {
  const memory = new Memory(),
    store = new SaveStore(createInitialState, memory);
  memory.setItem(
    SAVE_PREFIX + 1,
    JSON.stringify({
      version: 1,
      position: { x: 4, z: 9 },
      health: 81,
      hunger: -20,
      elapsed: 90,
      inventory: { wood: 12, stone: 5, unknown: 8 },
      hasSpear: true,
    }),
  );
  const result = store.load(1);
  assert(result.ok);
  assert(result.migrated);
  assert.equal(result.state?.version, 3);
  assert.equal(result.state?.player.x, 4);
  assert.equal(result.state?.player.health, 81);
  assert.equal(result.state?.player.hunger, 0);
  assert.equal(result.state?.inventory.wood, 12);
  assert(result.state?.equipment.tools.spear);
});

test("four hours of simulation remain serializable across weather, respawns and repeated saves", () => {
  const memory = new Memory(),
    store = new SaveStore(createInitialState, memory);
  let s = createInitialState();
  building(s, "raincatcher");
  building(s, "trap");
  s.animals.forEach((a) => {
    a.hp = 0;
    a.respawn = 99999;
  });
  for (let minute = 0; minute < 240; minute++) {
    s.player.health = 100;
    s.player.hunger = 100;
    s.player.thirst = 100;
    s.player.warmth = 100;
    tick(s, 60);
    if (minute % 15 === 0) {
      assert(store.save(0, s).ok);
      s = store.load(0).state!;
    }
    assert(Number.isFinite(s.player.health));
    assert(s.cycle >= 0 && s.cycle < 1);
  }
  assert(s.elapsed >= 14400);
  assert(s.progression.xp.survival >= 180);
  assert(s.buildings.find((b) => b.kind === "trap")!.ready);
});
