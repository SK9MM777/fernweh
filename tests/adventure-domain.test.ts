import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialState,
  act,
  step,
  placementStatus,
} from "../src/simulation";
import {
  createAdventure,
  getTide,
  getSecretPosition,
  expeditionStatus,
  nearbyInventory,
  consumeNearby,
  tickAdventure,
} from "../src/adventure";
import { EXPEDITIONS, ISLETS, SECRETS } from "../src/adventure-content";
import type { BuildingState, GameState } from "../src/types";
const idle = { x: 0, z: 0, sprint: false };
const building = (
  kind: BuildingState["kind"],
  x = 0,
  z = 69,
): BuildingState => ({
  id: "b-test",
  kind,
  x,
  z,
  rotation: 0,
  health: 100,
  fuel: 0,
  inventory: {},
  progress: 0,
  water: 0,
  planted: false,
  ready: false,
});
function advance(s: GameState, seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) step(s, 0.1, idle);
}
test("three seeded modes preserve safe resources and vary pressure", () => {
  const cozy = createInitialState(19, "cozy"),
    hard = createInitialState(19, "expedition");
  assert.deepEqual(cozy.resources, hard.resources);
  assert.ok(cozy.resources.some((r) => r.id === "starter-wood"));
  advance(cozy, 10);
  advance(hard, 10);
  assert.ok(cozy.player.hunger > hard.player.hunger);
  assert.equal(createAdventure().location, "home");
  assert.deepEqual(createInitialState(19), createInitialState(19));
});
test("content has six authored home chains, three remote chains and deterministic secrets", () => {
  assert.equal(EXPEDITIONS.filter((n) => n.island === "home").length, 18);
  assert.equal(EXPEDITIONS.filter((n) => n.island !== "home").length, 9);
  const s = createInitialState();
  assert.deepEqual(
    getSecretPosition(s, SECRETS[0]),
    getSecretPosition(s, SECRETS[0]),
  );
  assert.notDeepEqual(
    getSecretPosition(s, SECRETS[0]),
    getSecretPosition(createInitialState(100), SECRETS[0]),
  );
});
test("expeditions enforce sequence, equipment and meaningful rewards", () => {
  const s = createInitialState();
  const nodes = EXPEDITIONS.filter((n) => n.quest === "Flaschenpost");
  Object.assign(s.player, nodes[1]);
  assert.equal(expeditionStatus(s, nodes[1]).available, false);
  Object.assign(s.player, nodes[0]);
  act(s, { type: "investigate", id: nodes[0].id });
  assert.equal(s.inventory.cloth, 2);
  Object.assign(s.player, nodes[1]);
  act(s, { type: "investigate", id: nodes[1].id });
  assert.equal(s.adventure.quests["Flaschenpost"], 1);
  s.equipment.tools.knife = 100;
  act(s, { type: "investigate", id: nodes[1].id });
  Object.assign(s.player, nodes[2]);
  act(s, { type: "investigate", id: nodes[2].id });
  assert.equal(s.adventure.quests["Flaschenpost"], 3);
  assert.ok(s.progression.perks.includes("builder"));
});
test("low tide, night and storm secrets gate rewards and cannot duplicate", () => {
  const s = createInitialState();
  const spot = SECRETS[0];
  Object.assign(s.player, getSecretPosition(s, spot));
  s.cycle = 0.125;
  assert.ok(getTide(s) > 0.9);
  act(s, { type: "dig", id: spot.id });
  assert.equal(s.adventure.secrets.length, 0);
  s.cycle = 0.375;
  act(s, { type: "dig", id: spot.id });
  assert.equal(s.inventory.rope, 5);
  act(s, { type: "dig", id: spot.id });
  assert.equal(s.inventory.rope, 5);
});
test("nearby chest materials consume atomically and ignore far storage", () => {
  const s = createInitialState();
  s.inventory = { wood: 2 };
  const near = building("chest", 4, 69),
    far = building("chest", 50, 69);
  near.inventory = { wood: 4, stone: 3 };
  far.id = "far";
  far.inventory = { metal: 9 };
  s.buildings.push(near, far);
  assert.equal(nearbyInventory(s).wood, 6);
  assert.equal(nearbyInventory(s).metal ?? 0, 0);
  assert.equal(consumeNearby(s, { wood: 7 }), false);
  assert.equal(s.inventory.wood, 2);
  assert.equal(consumeNearby(s, { wood: 5, stone: 3 }), true);
  assert.equal(near.inventory.wood, 1);
});
test("explicit placement refuses invalid sites without payment and stores rotation", () => {
  const s = createInitialState();
  s.inventory = { wood: 20, stone: 10 };
  assert.equal(placementStatus(s, "fire", 500, 500).available, false);
  act(s, { type: "craft", id: "fire", x: 500, z: 500 });
  assert.equal(s.inventory.wood, 20);
  act(s, { type: "craft", id: "fire", x: 6, z: 69, rotation: 1.2 });
  assert.equal(s.buildings.length, 1);
  assert.equal(s.buildings[0].rotation, 1.2);
  assert.equal(s.buildings[0].x, 6);
});
test("upgrade, veranda, decorations, reinforcement and repairs persist in state", () => {
  const s = createInitialState();
  s.inventory = {
    plank: 30,
    rope: 20,
    hardwood: 10,
    metal: 10,
    resin: 10,
    wood: 10,
    stone: 10,
  };
  const b = building("shelter");
  s.buildings.push(b);
  act(s, { type: "upgrade", id: b.id });
  assert.equal(b.kind, "cabin");
  act(s, { type: "upgrade", id: b.id });
  assert.equal(b.level, 2);
  act(s, { type: "decorate", id: b.id, label: "lantern" });
  assert.deepEqual(b.decorations, ["lantern"]);
  act(s, { type: "reinforce", id: b.id });
  assert.equal(b.level, 2);
  assert.equal(b.reinforced,true);
  b.health = 40;
  act(s, { type: "repair", id: b.id });
  assert.equal(b.health, 150);
});
test("forecast precedes storm, buildings survive, protected homes suffer less, salvage bounded", () => {
  const s = createInitialState();
  const bare = building("chest", 40, 40),
    strong = building("cabin", 0, 69);
  strong.id = "strong";
  strong.reinforced = true;
  s.buildings = [bare, strong];
  s.adventure.storm.timer = 0.1;
  tickAdventure(s, 1, []);
  assert.equal(s.adventure.storm.phase, "warning");
  tickAdventure(s, 90, []);
  assert.equal(s.adventure.storm.phase, "active");
  tickAdventure(s, 50, []);
  assert.ok(bare.health < strong.health);
  tickAdventure(s, 80, []);
  assert.equal(s.adventure.storm.count, 1);
  assert.ok(bare.health >= 25);
  assert.equal(s.resources.filter((r) => r.id.startsWith("salvage")).length, 4);
  for (let i = 0; i < 20; i++) {
    s.adventure.storm.phase = "active";
    s.adventure.storm.timer = 0;
    tickAdventure(s, 1, []);
  }
  assert.equal(s.resources.filter((r) => r.id.startsWith("salvage")).length, 4);
});
test("boar telegraphs and a moving player can dodge", () => {
  const s = createInitialState();
  s.resources = [];
  s.animals = s.animals.slice(0, 1);
  const b = s.animals[0];
  b.x = s.player.x;
  b.z = s.player.z + 1;
  b.homeX = b.x;
  b.homeZ = b.z;
  step(s, 0.1, idle);
  assert.ok((b.windup ?? 0) > 0);
  const hp = s.player.health;
  s.player.x += 5;
  advance(s, 0.8);
  assert.ok(s.player.health >= hp);
});
test("ranged spear travels, hits and awards loot", () => {
  const s = createInitialState();
  s.equipment.tools.improvedSpear = 100;
  s.player.heading = 0;
  s.animals = s.animals.slice(6, 7);
  const rabbit = s.animals[0];
  rabbit.x = s.player.x;
  rabbit.z = s.player.z + 5;
  rabbit.homeX = rabbit.x;
  rabbit.homeZ = rabbit.z;
  act(s, { type: "throw" });
  assert.equal(s.adventure.projectiles.length, 1);
  advance(s, 0.4);
  assert.equal(s.progression.kills, 1);
  assert.ok((s.inventory.meat ?? 0) > 0);
});
test("completed raft begins controllable voyage rather than immediate ending", () => {
  const s = createInitialState();
  s.endgame.raftStage = 6;
  s.buildings.push(building("raft", 2, 72));
  act(s, { type: "depart", id: "b-test" });
  assert.equal(s.endgame.won, null);
  assert.equal(s.adventure.location, "sea");
  const x = s.player.x;
  step(s, 1, { x: 1, z: 0, sprint: false });
  assert.ok(s.player.x > x);
  assert.ok(s.adventure.voyage.distance > 0);
});
test("all three islands dock, walk locally and reboard without home radius clamp", () => {
  const s = createInitialState();
  s.adventure.voyage.unlocked = true;
  for (const island of ISLETS) {
    s.adventure.location = "sea";
    Object.assign(s.player, island.dock);
    act(s, { type: "dock" });
    assert.equal(s.adventure.location, island.id);
    step(s, 1, { x: 0, z: 1, sprint: false });
    assert.ok(
      Math.hypot(s.player.x - island.x, s.player.z - island.z) < island.radius,
    );
    Object.assign(s.player, island.dock);
    act(s, { type: "board" });
    assert.equal(s.adventure.location, "sea");
  }
  assert.equal(s.adventure.voyage.visited.length, 4);
});
test("sinking safely recovers home with possessions and repairable hull", () => {
  const s = createInitialState();
  s.adventure.location = "sea";
  s.adventure.voyage.unlocked = true;
  s.adventure.voyage.hull = 0.01;
  s.player.x = 120;
  s.weather.kind = "storm";
  s.weather.remaining = 100;
  s.inventory = { wood: 5, fiber: 5 };
  step(s, 1, idle);
  assert.equal(s.adventure.location, "home");
  assert.equal(s.inventory.wood, 5);
  assert.equal(s.adventure.voyage.hull, 35);
  act(s, { type: "repair-raft" });
  assert.equal(s.adventure.voyage.hull, 70);
});
test("lighthouse rescue requires relic chains and final authored sequence", () => {
  const s = createInitialState();
  s.adventure.location = "lighthouse";
  const nodes = EXPEDITIONS.filter((n) => n.island === "lighthouse");
  Object.assign(s.player, nodes[0]);
  act(s, { type: "investigate", id: nodes[0].id });
  assert.equal(s.adventure.quests["Letztes Licht"], undefined);
  s.adventure.quests["Die versunkene Linse"] = 3;
  s.adventure.quests["Herz aus Glut"] = 3;
  s.equipment.tools.repairKit = 100;
  s.inventory = { metal: 3, rope: 2 };
  for (const n of nodes) {
    Object.assign(s.player, n);
    act(s, { type: "investigate", id: n.id });
  }
  act(s, { type: "rescue" });
  assert.equal(s.endgame.won, "raft");
});

 test("reinforcement before cabin upgrades never locks veranda",()=>{const s=createInitialState();const b=building("shelter");s.buildings=[b];s.inventory={plank:30,rope:20,hardwood:10};act(s,{type:"reinforce",id:b.id});act(s,{type:"upgrade",id:b.id});act(s,{type:"upgrade",id:b.id});assert.equal(b.kind,"cabin");assert.equal(b.level,2);assert(b.reinforced);});
 test("remote fishing input reels fish instead of boarding raft",()=>{const s=createInitialState();s.adventure.voyage.unlocked=true;s.adventure.location="reef";s.player.x=157;s.player.z=35;s.equipment.tools.fishingRod=100;act(s,{type:"fish"});assert(s.fishing.active);advance(s,s.fishing.biteAt+.1);act(s,{type:"interact"});assert.equal(s.inventory.fish,1);assert.equal(s.adventure.location,"reef");});
