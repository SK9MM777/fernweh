import { writeFileSync } from "node:fs";
import {
  createInitialState,
  act,
  step,
  getPrompt,
  recipeStatus,
} from "../src/simulation";
import { EXPEDITIONS, ISLETS } from "../src/adventure-content";
import { getTide, nearbyInventory } from "../src/adventure";
import { RECIPES, RAFT_STAGES } from "../src/catalog";
import { SPRING, PLACES } from "../src/locations";
import { count } from "../src/inventory";
import type {
  GameAction,
  ItemId,
  Inventory,
  ToolId,
  BuildingKind,
} from "../src/types";
const s = createInitialState(42, "survival");
const log: string[] = [],
  milestones: Record<string, number> = {},
  failures: string[] = [];
let actions = 0,
  steps = 0,
  maintenance = false;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
function note(v: string) {
  log.push(`${s.elapsed.toFixed(1)}s ${v}`);
}
function action(a: GameAction) {
  actions++;
  const e = act(s, a);
  for (const t of e) if (t.type === "toast" && t.message) note(t.message);
  return e;
}
function tick(x = 0, z = 0, dt = 0.1) {
  steps++;
  step(s, dt, { x, z, sprint: false });
  if (s.player.health <= 0) throw Error("Death during progression");
  if (s.elapsed > 14400) throw Error("Four simulated hour bound reached");
}
function upkeep() {
  if (maintenance) return;
  maintenance = true;
  try {
    if (s.player.health < 60 && count(s.inventory, "herb"))
      action({ type: "use", item: "herb" });
    if (s.player.hunger < 65) {
      for (const id of [
        "berry",
        "coconut",
        "cookedMeat",
        "cookedFish",
        "potato",
        "ration",
      ] as ItemId[])
        while (s.player.hunger < 82 && count(s.inventory, id))
          action({ type: "eat", item: id });
    }
    if (s.player.thirst < 65 && count(s.inventory, "water"))
      action({ type: "use", item: "water" });
    if (s.player.thirst < 55 && count(s.inventory, "coconut"))
      action({ type: "eat", item: "coconut" });
    if (s.player.thirst < 40 || s.player.hunger < 40) {
      collect("coconut", 8);
      while (s.player.thirst < 85 && count(s.inventory, "coconut"))
        action({ type: "eat", item: "coconut" });
      while (s.player.hunger < 80 && count(s.inventory, "coconut"))
        action({ type: "eat", item: "coconut" });
    }
    if (s.player.health < 45) {
      collect("herb", 3);
      while (s.player.health < 80 && count(s.inventory, "herb"))
        action({ type: "use", item: "herb" });
    }
  } finally {
    maintenance = false;
  }
}
function walk(p: { x: number; z: number }) {
  let n = 0;
  while (dist(s.player, p) > 0.2) {
    if (++n > 5000) throw Error("Navigation bound " + JSON.stringify(p));
    upkeep();
    const d = dist(s.player, p);
    tick(
      (p.x - s.player.x) / d,
      (p.z - s.player.z) / d,
      Math.min(0.1, d / 4.4),
    );
  }
}
function wait(seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) {
    upkeep();
    tick();
  }
}
function repair(tool: ToolId) {
  if (
    s.equipment.tools[tool] !== undefined &&
    (s.equipment.tools[tool] ?? 0) < 5
  ) {
    ensure({ wood: 2, stone: 2 });
    action({ type: "repair", id: tool });
  }
}
function collect(item: ItemId, amount: number) {
  if (item === "hide" || item === "meat" || item === "bone") {
    craft("trap");
    while (count(s.inventory, item) < amount) {
      const b = s.buildings.find((b) => b.kind === "trap")!;
      walk(b);
      if (!b.ready) wait(181 - b.progress);
      action({ type: "interact" });
    }
    return;
  }
  if (item === "water") {
    craft("canteen");
    while (count(s.inventory, item) < amount) {
      walk(SPRING);
      action({ type: "drink", id: "spring" });
    }
    return;
  }
  if (item === "hardwood") craft("axe");
  if (item === "ore" || item === "coal") craft("pickaxe");
  if (item === "boatPart") craft("hammer");
  let attempts = 0;
  while (count(s.inventory, item) < amount) {
    if (++attempts > 120)
      throw Error(`Unable gather ${item}: ${log.slice(-5).join(" / ")}`);
    upkeep();
    const r = s.resources
      .filter(
        (r) => r.kind === item && r.remaining > 0 && Math.hypot(r.x, r.z) < 94,
      )
      .sort((a, b) => dist(s.player, a) - dist(s.player, b))[0];
    if (!r) throw Error("No reachable available resource " + item);
    if ((item === "ore" || item === "coal") && r.x > 25 && r.z < 0)
      craft("torch");
    repair("axe");
    repair("pickaxe");
    repair("hammer");
    walk(r);
    while (s.cooldown > 0) tick();
    const before = count(s.inventory, item);
    action({ type: "interact" });
    if (count(s.inventory, item) === before) {
      const prompt = getPrompt(s);
      if (prompt.id && EXPEDITIONS.some((n) => n.id === prompt.id))
        action({ type: "investigate", id: prompt.id });
      else if (prompt.id?.startsWith("a-")) {
        craft("spear");
        action({ type: "interact" });
        wait(0.6);
      } else {
        walk({ x: r.x + 1, z: r.z });
      }
    }
  }
}
function ensure(cost: Inventory) {
  for (const [id, n] of Object.entries(cost)) {
    const item = id as ItemId;
    while (count(s.inventory, item) < n!) {
      const recipe = RECIPES.find((r) => r.output?.[item]);
      if (recipe && !["metal"].includes(item)) craft(recipe.id, true);
      else collect(item, n!);
    }
  }
}
function craft(id: string, repeat = false) {
  const r = RECIPES.find((r) => r.id === id);
  if (!r) throw Error("Missing recipe " + id);
  if (
    !repeat &&
    ((r.tool && s.equipment.tools[r.tool] !== undefined) ||
      (r.building && s.buildings.some((b) => b.kind === r.building)))
  )
    return;
  for (const req of r.requires ?? []) {
    const [k, v] = req.split(":");
    if (k === "tool") craft(RECIPES.find((r) => r.tool === v)!.id);
    if (k === "built") craft(v);
    if (k === "discovered" && !s.progression.discovered.includes(v))
      walk(PLACES.find((p) => p.id === v)!);
  }
  if (r.station) craft(r.station);
  ensure(r.cost);
  if (r.station) {
    const b = s.buildings.find((b) => b.kind === r.station)!;
    walk(b);
    if (r.station === "cooker" && b.fuel <= 0) {
      ensure({ wood: 2 });
      walk(b);
      action({ type: "interact" });
    }
  }
  if (r.building === "raft") walk({ x: 0, z: 72 });
  const status = recipeStatus(s, r);
  if (!status.available) throw Error(`Craft blocked ${id}: ${status.reason}`);
  const before = s.buildings.length;
  action({ type: "craft", id });
  if (r.building && s.buildings.length === before)
    throw Error("Building placement failed " + id);
  milestones[id] ??= s.elapsed;
  note("MILESTONE " + id);
}
let outcome = "completed",
  error = "";
try {
  walk(SPRING);
  action({ type: "drink", id: "spring" });
  milestones.source = s.elapsed;
  walk({ x: 0, z: 69 });
  craft("fire");
  craft("shelter");
  craft("rope", true);
  craft("workbench");
  craft("axe");
  craft("pickaxe");
  craft("hammer");
  craft("knife");
  craft("spear");
  craft("trap");
  craft("canteen");
  for (const n of EXPEDITIONS.filter((n) => n.quest === "Die Morgenstern")) {
    walk(n);
    while (n.requires === "low-tide" && getTide(s) >= 0.35) wait(1);
    action({ type: "investigate", id: n.id });
    if ((s.adventure.quests[n.quest] ?? 0) !== n.step + 1)
      throw Error("Expedition blocked " + n.id);
  }
  milestones.northExpedition = s.elapsed;
  craft("backpack");
  craft("advancedBench");
  craft("metalAxe");
  craft("metalPickaxe");
  craft("repairKit");
  craft("dryer");
  craft("cooker");
  craft("torch");
  walk(PLACES.find((p) => p.id === "cave")!);
  walk({ x: 0, z: 69 });
  craft("raft");
  for (const stage of RAFT_STAGES) {
    ensure(stage.cost);
    const b = s.buildings.find((b) => b.kind === "raft")!;
    walk(b);
    const old = s.endgame.raftStage;
    action({ type: "raft", id: b.id });
    if (s.endgame.raftStage === old)
      throw Error("Raft stage blocked " + stage.name);
  }
  milestones.raftComplete = s.elapsed;
  ensure({
    rope: 6,
    cloth: 2,
    metal: 6,
    water: 20,
    coconut: 20,
    wood: 6,
    fiber: 6,
  });
  walk(s.buildings.find((b) => b.kind === "raft")!);
  while (s.weather.kind === "rain" || s.weather.kind === "storm") wait(1);
  action({ type: "depart" });
  function sailTo(point: { x: number; z: number }) {
    let n = 0;
    while (dist(s.player, point) > 6) {
      if (++n > 5000)
        throw Error("Sailing route blocked " + JSON.stringify(point));
      upkeep();
      const d = dist(s.player, point);
      tick((point.x - s.player.x) / d, (point.z - s.player.z) / d);
      if (s.adventure.location !== "sea") throw Error("Voyage interrupted");
    }
  }
  for (const island of ISLETS) {
    if (island.id === "reef") {
      sailTo({ x: 120, z: 110 });
    }
    if (island.id === "ember") {
      sailTo({ x: 130, z: -140 });
      sailTo({ x: -130, z: -140 });
    }
    if (island.id === "lighthouse") sailTo({ x: -140, z: -180 });
    sailTo(island.dock);
    action({ type: "dock" });
    if (s.adventure.location !== island.id)
      throw Error("Dock failed " + island.id);
    milestones["visit-" + island.id] = s.elapsed;
    for (const n of EXPEDITIONS.filter((n) => n.island === island.id)) {
      walk(n);
      while (n.requires === "low-tide" && getTide(s) >= 0.35) wait(1);
      action({ type: "investigate", id: n.id });
      if ((s.adventure.quests[n.quest] ?? 0) !== n.step + 1)
        throw Error("Remote expedition blocked " + n.id);
    }
    if (island.id !== "lighthouse") {
      walk(island.dock);
      action({ type: "board" });
    }
  }
  action({ type: "rescue" });
  if (s.endgame.won !== "raft") throw Error("Rescue failed");
  milestones.rescue = s.elapsed;
} catch (e) {
  outcome = "blocked";
  error = String(e);
  failures.push(error);
  note("STOP " + error);
}
const report = {
  seed: 42,
  mode: "survival",
  scope:
    "Pure rules bot with actual act/step only; direct desired heading walking, no world mesh/collider navigation and no browser input. Accelerated simulated time, not human play.",
  outcome,
  error,
  simulatedSeconds: s.elapsed,
  simulatedMinutes: s.elapsed / 60,
  actions,
  steps,
  milestones,
  deaths: s.player.health <= 0 ? 1 : 0,
  failures,
  player: s.player,
  inventory: s.inventory,
  equipment: s.equipment,
  buildingKinds: s.buildings.map((b) => b.kind),
  progression: s.progression,
  quests: s.adventure.quests,
  raftStage: s.endgame.raftStage,
  visited: s.adventure.voyage.visited,
  voyageDistance: s.adventure.voyage.distance,
  ending: s.endgame.won,
};
writeFileSync(
  "artifacts/v3/progression-bot.json",
  JSON.stringify(report, null, 2),
);
writeFileSync("artifacts/v3/progression-bot.log", log.join("\n"));
console.log(JSON.stringify(report, null, 2));
