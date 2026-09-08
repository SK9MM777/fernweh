import type {
  AdventureState,
  GameMode,
  ExpeditionNode,
  SecretSpot,
} from "./adventure-types";
import type {
  GameState,
  Inventory,
  GameAction,
  Effect,
  InputIntent,
} from "./types";
import { ITEM_IDS } from "./types";
import {
  addItems,
  canAdd,
  capacity,
  consume,
  count,
  hasItems,
} from "./inventory";
import { EXPEDITIONS, ISLETS, SECRETS } from "./adventure-content";
import { RECIPES } from "./catalog";
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
const message = (text: string, save = false): Effect[] => [
  { type: "toast", message: text },
  ...(save
    ? [{ type: "save" } as Effect, { type: "sound", id: "discover" } as Effect]
    : []),
];
export function createAdventure(mode: GameMode = "survival"): AdventureState {
  return {
    mode,
    location: "home",
    quests: {},
    notes: [],
    secrets: [],
    markers: [],
    storm: {
      phase: "calm",
      timer: mode === "expedition" ? 360 : 600,
      count: 0,
      salvaged: 0,
    },
    voyage: {
      unlocked: false,
      hull: 100,
      speed: 0,
      heading: 0,
      visited: ["home"],
      homeDock: { x: 0, z: 92 },
      distance: 0,
    },
    sneaking: false,
    projectiles: [],
    actionPose: { kind: "idle", remaining: 0 },
  };
}
export function getTide(s: GameState) {
  return (Math.sin(s.cycle * Math.PI * 4) + 1) / 2;
}
export function getSecretPosition(s: GameState, p: SecretSpot) {
  let n = s.seed >>> 0;
  for (const c of p.id) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return {
    x: p.x + ((n % 601) / 100 - 3),
    z: p.z + (((n >>> 10) % 601) / 100 - 3),
  };
}
export function nearbyInventory(s: GameState): Inventory {
  const result = { ...s.inventory };
  for (const b of s.buildings)
    if (b.kind === "chest" && b.health > 0 && distance(s.player, b) <= 10)
      for (const id of ITEM_IDS)
        result[id] = count(result, id) + count(b.inventory, id);
  return result;
}
export function consumeNearby(s: GameState, cost: Inventory) {
  if (!hasItems(nearbyInventory(s), cost)) return false;
  for (const id of ITEM_IDS) {
    let need = count(cost, id);
    for (const inv of [
      s.inventory,
      ...s.buildings
        .filter(
          (b) =>
            b.kind === "chest" && b.health > 0 && distance(s.player, b) <= 10,
        )
        .map((b) => b.inventory),
    ]) {
      const n = Math.min(need, count(inv, id));
      if (n) consume(inv, { [id]: n });
      need -= n;
      if (!need) break;
    }
  }
  return true;
}
export function expeditionStatus(s: GameState, n: ExpeditionNode) {
  let reason = "";
  const done = s.adventure.quests[n.quest] ?? 0;
  if (done > n.step) reason = "Bereits untersucht";
  else if (done < n.step) reason = "Folge zuerst dem vorherigen Hinweis";
  else if (s.adventure.location !== n.island)
    reason = "Reise zuerst zu diesem Ort";
  else if (n.requires === "night" && s.cycle >= 0.22 && s.cycle <= 0.76)
    reason = "Nur nachts sichtbar";
  else if (n.requires === "low-tide" && getTide(s) >= 0.35)
    reason = "Warte auf Ebbe";
  else if (
    n.requires === "voyage-relics" &&
    ((s.adventure.quests["Die versunkene Linse"] ?? 0) < 3 ||
      (s.adventure.quests["Herz aus Glut"] ?? 0) < 3)
  )
    reason = "Linse von Korallenwacht und Batterie von Glutinsel fehlen";
  else if (n.requires?.startsWith("tool:")) {
    const tool = n.requires.split(":")[1] as keyof typeof s.equipment.tools;
    const alternate =
      tool === "axe" ? "metalAxe" : tool === "pickaxe" ? "metalPickaxe" : tool;
    if (!(
      (s.equipment.tools[tool] ?? 0) > 0 ||
      (s.equipment.tools[alternate] ?? 0) > 0
    ))
      reason =
        "Werkzeug benötigt: " +
        (RECIPES.find((r) => r.tool === tool)?.name ?? tool);
  }
  if (!reason && n.cost && !hasItems(nearbyInventory(s), n.cost))
    reason = "Material für die Bergung fehlt";
  return { available: !reason, reason };
}
export function secretStatus(s: GameState, n: SecretSpot) {
  if (s.adventure.secrets.includes(n.id)) return "Bereits geborgen";
  if (n.island !== s.adventure.location) return "Anderer Ort";
  if (n.condition === "low-tide" && getTide(s) >= 0.35)
    return "Nur bei Ebbe erreichbar";
  if (n.condition === "night" && s.cycle >= 0.22 && s.cycle <= 0.76)
    return "Nur nachts sichtbar";
  if (n.condition === "after-storm" && s.adventure.storm.count === 0)
    return "Erst nach einem großen Sturm freigelegt";
  return "";
}
export function adventurePrompt(
  s: GameState,
): { text: string; id: string | null } | null {
  const a = s.adventure;
  if (a.location === "sea") {
    const dock = ISLETS.find((i) => distance(s.player, i.dock) < 13);
    if (dock || distance(s.player, a.voyage.homeDock) < 14)
      return { text: "E · Anlegen", id: "dock" };
    return {
      text: "Segeln · WASD steuern · Rumpf " + Math.ceil(a.voyage.hull) + " %",
      id: null,
    };
  }
  const ready = EXPEDITIONS.find(
    (n) =>
      n.island === a.location &&
      (a.quests[n.quest] ?? 0) === n.step &&
      distance(s.player, n) < 4.5,
  );
  if (ready) return { text: "E · " + ready.title, id: ready.id };
  const secret = SECRETS.find(
    (n) =>
      !secretStatus(s, n) && distance(s.player, getSecretPosition(s, n)) < 4,
  );
  if (secret) return { text: "E · " + secret.title + " bergen", id: secret.id };
  if (a.voyage.unlocked) {
    const dock =
      a.location === "home"
        ? a.voyage.homeDock
        : ISLETS.find((i) => i.id === a.location)?.dock;
    if (dock && distance(s.player, dock) < 10)
      return { text: "E · Floß besteigen", id: "board" };
  }
  if (
    a.location === "lighthouse" &&
    (a.quests["Letztes Licht"] ?? 0) >= 3 &&
    distance(s.player, { x: 35, z: -229 }) < 5
  )
    return { text: "E · Rettung rufen", id: "rescue" };
  return null;
}
export function adventureAction(
  s: GameState,
  action: GameAction,
  canPlace?: (x: number, z: number) => boolean,
): Effect[] | null {
  const a = s.adventure;
  let t = action.type,
    id = action.id;
  if (t === "interact") {
    const p = adventurePrompt(s);
    if (!p?.id)
      return a.location === "sea"
        ? message("Segle zu einem Anleger auf der Seekarte.")
        : null;
    id = p.id;
    t =
      id === "dock"
        ? "dock"
        : id === "board"
          ? "board"
          : id === "rescue"
            ? "rescue"
            : SECRETS.some((n) => n.id === id)
              ? "dig"
              : "investigate";
  }
  if (t === "investigate") {
    const n = EXPEDITIONS.find((n) => n.id === id);
    if (!n || distance(s.player, n) > 5)
      return message("Gehe näher an den Hinweis heran.");
    const status = expeditionStatus(s, n);
    if (!status.available) return message(status.reason);
    if (n.reward && !canAdd(s.inventory, n.reward, capacity(s)))
      return message("Für den Fund fehlt Inventarplatz.");
    if (n.cost) consumeNearby(s, n.cost);
    if (n.reward) addItems(s.inventory, n.reward, capacity(s));
    a.quests[n.quest] = n.step + 1;
    a.notes.push(n.title + ": " + n.description);
    s.progression.xp.survival += 12;
    if (n.id === "jungle-3" && !s.progression.perks.includes("botany"))
      s.progression.perks.push("botany");
    if (n.id === "cave-3" && !s.progression.perks.includes("durable"))
      s.progression.perks.push("durable");
    if (n.id === "shore-3" && !s.progression.perks.includes("builder"))
      s.progression.perks.push("builder");
    if (n.id === "wreck-3")
      for (const i of ISLETS)
        if (!a.markers.some((m) => m.id === i.id))
          a.markers.push({ id: i.id, label: i.name, x: i.x, z: i.z });
    return message(n.description + " " + n.clue, true);
  }
  if (t === "dig") {
    const n = SECRETS.find((n) => n.id === id);
    if (!n || distance(s.player, getSecretPosition(s, n)) > 5)
      return message("Gehe zum Fundort.");
    const reason = secretStatus(s, n);
    if (reason) return message(reason);
    if (!addItems(s.inventory, n.reward, capacity(s)))
      return message("Für den Schatz fehlt Platz.");
    a.secrets.push(n.id);
    if (n.condition === "after-storm") a.storm.salvaged++;
    s.progression.xp.survival += 20;
    return message(n.title + " geborgen!", true);
  }
  if (t === "marker") {
    if (a.markers.length >= 30)
      return message("Höchstens 30 Kartenmarkierungen.");
    const x = action.x ?? s.player.x,
      z = action.z ?? s.player.z;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      Math.abs(x) > 350 ||
      Math.abs(z) > 350
    )
      return message("Ungültige Kartenposition.");
    a.markers.push({
      id: "mark-" + s.nextId++,
      label: (action.label || "Mein Lager").slice(0, 40),
      x,
      z,
    });
    return message("Karte markiert.", true);
  }
  if (t === "remove-marker") {
    a.markers = a.markers.filter((m) => m.id !== id);
    return message("Markierung entfernt.", true);
  }
  if (t === "sneak") {
    a.sneaking = !a.sneaking;
    return message(
      a.sneaking
        ? "Du schleichst. Tiere bemerken dich später."
        : "Du gehst wieder aufrecht.",
    );
  }
  if (t === "sit") {
    a.actionPose = { kind: "sit", remaining: 3600 };
    s.player.stamina = 100;
    return message("Du setzt dich. Bewegung steht wieder auf.");
  }
  if (t === "throw") {
    const tool =
      (s.equipment.tools.improvedSpear ?? 0) > 0
        ? "improvedSpear"
        : (s.equipment.tools.spear ?? 0) > 0
          ? "spear"
          : null;
    if (!tool) return message("Du brauchst einen Speer.");
    if (s.cooldown > 0 || a.location === "sea") return [];
    if (s.player.stamina < 12)
      return message("Erhole dich vor dem nächsten Wurf.");
    s.player.stamina -= 12;
    s.equipment.tools[tool] = Math.max(0, (s.equipment.tools[tool] ?? 0) - 1.2);
    a.projectiles.push({
      id: s.nextId++,
      x: s.player.x,
      z: s.player.z,
      y: 1.3,
      vx: Math.sin(s.player.heading) * 22,
      vz: Math.cos(s.player.heading) * 22,
      life: 1.4,
      damage: (tool === "improvedSpear" ? 55 : 35) * (a.sneaking ? 1.35 : 1),
    });
    a.actionPose = { kind: "throw", remaining: 0.45 };
    s.cooldown = 0.7;
    return [{ type: "sound", id: "swing" }];
  }
  if (t === "board") {
    if (!a.voyage.unlocked) return message("Baue zuerst dein Floß.");
    const dock =
      a.location === "home"
        ? a.voyage.homeDock
        : ISLETS.find((i) => i.id === a.location)?.dock;
    if (!dock || distance(s.player, dock) > 12)
      return message("Gehe zum Anleger.");
    a.location = "sea";
    s.player.x = dock.x;
    s.player.z = dock.z;
    a.voyage.speed = 0;
    return message("Segel gesetzt. WASD steuert, E legt am Anleger an.", true);
  }
  if (t === "dock") {
    if (a.location !== "sea") return message("Du bist bereits an Land.");
    const island = ISLETS.find((i) => distance(s.player, i.dock) < 13);
    const home = distance(s.player, a.voyage.homeDock) < 14;
    if (!island && !home) return message("Segle näher an einen Anleger.");
    a.location = island?.id ?? "home";
    const dock = island?.dock ?? a.voyage.homeDock;
    s.player.x = dock.x;
    s.player.z = dock.z;
    a.voyage.speed = 0;
    if (!a.voyage.visited.includes(a.location)) {
      a.voyage.visited.push(a.location);
      s.progression.xp.survival += 30;
    }
    return message(
      "Angelegt: " +
        (island?.name ?? "Heimatinsel") +
        ". Das Floß wartet hier auf dich.",
      true,
    );
  }
  if (t === "repair-raft") {
    if (!a.voyage.unlocked)
      return message("Du brauchst ein seetüchtiges Floß.");
    if (a.voyage.hull >= 100) return message("Der Rumpf ist unbeschädigt.");
    if (!consumeNearby(s, { wood: 2, fiber: 2 }))
      return message("Reparatur: 2 Holz und 2 Fasern.");
    a.voyage.hull = Math.min(100, a.voyage.hull + 35);
    return message("Rumpf repariert: +35 %. ", true);
  }
  if (t === "rescue") {
    if (
      a.location !== "lighthouse" ||
      (a.quests["Letztes Licht"] ?? 0) < 3 ||
      distance(s.player, { x: 35, z: -229 }) > 6
    )
      return message("Vollende die Expedition am Leuchtturm.");
    s.endgame.won = "raft";
    return message(
      "Ein Schiff antwortet auf dein Leuchtfeuer. Deine Reise hat dich nach Hause geführt!",
      true,
    );
  }
  if (
    ["upgrade", "decorate", "move-building", "reinforce"].includes(t) ||
    (t === "repair" && s.buildings.some((b) => b.id === id))
  ) {
    const b = s.buildings.find((b) => b.id === id);
    if (!b || distance(s.player, b) > 10)
      return message("Gehe näher an dein Gebäude.");
    if (t === "move-building") {
      const x = action.x,
        z = action.z;
      if (
        x === undefined ||
        z === undefined ||
        !Number.isFinite(x) ||
        !Number.isFinite(z) ||
        distance(s.player, { x, z }) > 12 ||
        Math.hypot(
          x - (ISLETS.find((i) => i.id === a.location)?.x ?? 0),
          z - (ISLETS.find((i) => i.id === a.location)?.z ?? 0),
        ) >
          (ISLETS.find((i) => i.id === a.location)?.radius ?? 96) - 2 ||
        s.buildings.some((q) => q !== b && distance(q, { x, z }) < 4.2) ||
        (canPlace && !canPlace(x, z))
      )
        return message("Hier ist kein freier Bauplatz.");
      if (b.kind === "raft" || b.kind === "signal")
        return message("Dieser Fluchtbauplatz bleibt an seinem Ort.");
      b.x = x;
      b.z = z;
      b.rotation = Number.isFinite(action.rotation)
        ? action.rotation!
        : b.rotation;
      return message("Gebäude versetzt.", true);
    }
    if (t === "repair") {
      const fullHealth=b.reinforced?150:b.kind==="cabin"?130:100;
      if (b.health >= fullHealth) return message("Gebäude ist intakt.");
      if (!consumeNearby(s, { wood: 2, stone: 1 }))
        return message("Reparatur: 2 Holz, 1 Stein.");
      b.health = fullHealth;
      return message("Gebäude repariert.", true);
    }
    if (t === "reinforce") {
      if (b.reinforced === true) return message("Bereits sturmfest verstärkt.");
      if (!consumeNearby(s, { plank: 4, rope: 2 }))
        return message("Verstärken: 4 Bretter, 2 Seile.");
      b.reinforced = true;
      b.health = 150;
      return message("Gebäude gegen Sturm verstärkt.", true);
    }
    if (t === "upgrade") {
      if (!["shelter", "cabin"].includes(b.kind))
        return message("Nur Unterschlupf und Hütte lassen sich ausbauen.");
      if ((b.level ?? 0) >= 2)
        return message("Die Veranda ist bereits fertig.");
      const cost =
        b.kind === "shelter"
          ? { plank: 8, rope: 4 }
          : { plank: 6, hardwood: 4 };
      if (!consumeNearby(s, cost))
        return message(
          "Ausbau benötigt " +
            (b.kind === "shelter"
              ? "8 Bretter, 4 Seile."
              : "6 Bretter, 4 Hartholz."),
        );
      b.level = b.kind === "shelter" ? 1 : 2;
      b.kind = "cabin";
      b.health = b.reinforced ? 150 : 130;
      return message(
        b.level === 1
          ? "Aus dem Unterschlupf wird eine wetterfeste Hütte."
          : "Deine Hütte hat jetzt eine Veranda.",
        true,
      );
    }
    const decoration = action.label ?? "lantern";
    const costs: Record<string, Inventory> = {
      lantern: { metal: 2, resin: 2 },
      shelf: { plank: 3 },
      trophy: { hide: 2, bone: 3 },
    };
    if (!costs[decoration]) return message("Unbekannte Dekoration.");
    b.decorations ??= [];
    if (b.decorations.includes(decoration))
      return message("Bereits angebracht.");
    if (!consumeNearby(s, costs[decoration]))
      return message("Material für diese Dekoration fehlt.");
    b.decorations.push(decoration);
    return message("Dekoration angebracht.", true);
  }
  return null;
}
export function sail(
  s: GameState,
  dt: number,
  input: InputIntent,
  effects: Effect[],
) {
  const a = s.adventure,
    p = s.player;
  const len = Math.hypot(input.x, input.z);
  if (len > 0.01) {
    p.heading = Math.atan2(input.x, input.z);
    a.voyage.heading = p.heading;
  }
  const windDirection = 0.65 + Math.sin(s.elapsed / 400) * 0.3;
  const alignment = Math.cos(p.heading - windDirection);
  const target =
    len > 0.01
      ? (7 + 3 * alignment) * (s.weather.kind === "storm" ? 0.65 : 1)
      : 0;
  a.voyage.speed += (target - a.voyage.speed) * Math.min(1, dt * 1.4);
  const dx = Math.sin(p.heading) * a.voyage.speed * dt,
    dz = Math.cos(p.heading) * a.voyage.speed * dt;
  p.x += dx;
  p.z += dz;
  a.voyage.distance += Math.hypot(dx, dz);
  for (const island of [
    { x: 0, z: 0, radius: 96, dock: a.voyage.homeDock },
    ...ISLETS,
  ]) {
    const r = distance(p, island);
    if (r < island.radius - 1 && distance(p, island.dock) > 14) {
      const angle = Math.atan2(p.x - island.x, p.z - island.z);
      p.x = island.x + Math.sin(angle) * (island.radius - 1);
      p.z = island.z + Math.cos(angle) * (island.radius - 1);
      if (a.voyage.speed > 2)
        a.voyage.hull = Math.max(0, a.voyage.hull - dt * 3);
      a.voyage.speed = 0;
    }
  }
  if (Math.abs(p.x) > 320 || Math.abs(p.z) > 320) {
    p.x = Math.max(-320, Math.min(320, p.x));
    p.z = Math.max(-320, Math.min(320, p.z));
  }
  if (s.weather.kind === "storm")
    a.voyage.hull -= dt * (a.mode === "cozy" ? 0.025 : 0.12);
  if (a.voyage.hull <= 0) {
    a.location = "home";
    p.x = a.voyage.homeDock.x;
    p.z = a.voyage.homeDock.z;
    a.voyage.hull = 35;
    a.voyage.speed = 0;
    p.health = Math.max(25, p.health - 20);
    effects.push(
      ...message(
        "Die Strömung trägt dich und dein Floß nach Hause. Repariere den beschädigten Rumpf.",
        true,
      ),
    );
  }
}
export function tickAdventure(s: GameState, dt: number, effects: Effect[]) {
  const a = s.adventure;
  a.actionPose.remaining = Math.max(0, a.actionPose.remaining - dt);
  if (!a.actionPose.remaining) a.actionPose.kind = "idle";
  const storm = a.storm;
  storm.timer -= dt;
  if (storm.timer <= 0) {
    if (storm.phase === "calm") {
      storm.phase = "warning";
      storm.timer = 90;
      effects.push(
        ...message(
          "Sturmwarnung: In 90 Sekunden erreicht eine Front die Insel. Sichere Feuer und verstärke Gebäude.",
        ),
      );
    } else if (storm.phase === "warning") {
      storm.phase = "active";
      storm.timer = a.mode === "cozy" ? 60 : 120;
      s.weather.kind = "storm";
      s.weather.wind = 1;
      s.weather.remaining = storm.timer;
      effects.push(...message("Die Sturmfront ist da. Suche Schutz!"));
    } else if (storm.phase === "active") {
      storm.phase = "aftermath";
      storm.timer = 180;
      storm.count++;
      s.weather.kind = "cloudy";
      s.weather.wind = 0.3;
      s.weather.remaining = 180;
      const k = storm.count;
      s.resources = s.resources.filter((r) => !r.id.startsWith("salvage-"));
      for (let i = 0; i < 4; i++)
        s.resources.push({
          id: `salvage-${k}-${i}`,
          kind: i % 2 ? "cloth" : "wood",
          x: -12 + i * 8,
          z: 81 + (i % 2) * 2,
          remaining: 2,
          respawn: 0,
        });
      effects.push(
        ...message(
          "Der Sturm zieht ab. Neues Strandgut liegt am Südstrand; am Nordwrack wurde Fracht freigelegt.",
          true,
        ),
      );
    } else {
      storm.phase = "calm";
      storm.timer = a.mode === "expedition" ? 360 : 600;
    }
  }
  if (storm.phase === "active") {
    s.weather.kind = "storm";
    for (const b of s.buildings) {
      const protectedBuilding =
        b.reinforced === true ||
        s.buildings.some((q) => q.kind === "cabin" && distance(q, b) < 8);
      b.health = Math.max(
        25,
        b.health -
          dt * (protectedBuilding ? 0.005 : a.mode === "cozy" ? 0.015 : 0.12),
      );
    }
  }
  for (const projectile of a.projectiles) {
    const oldX = projectile.x,
      oldZ = projectile.z;
    projectile.x += projectile.vx * dt;
    projectile.z += projectile.vz * dt;
    projectile.life -= dt;
    const vx = projectile.x - oldX,
      vz = projectile.z - oldZ;
    const hit = s.animals.find((an) => {
      if (an.hp <= 0) return false;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((an.x - oldX) * vx + (an.z - oldZ) * vz) / (vx * vx + vz * vz || 1),
        ),
      );
      return Math.hypot(an.x - oldX - vx * t, an.z - oldZ - vz * t) < 1.1;
    });
    if (hit) {
      projectile.life = 0;
      hit.hp = Math.max(0, hit.hp - projectile.damage);
      hit.flee = 2;
      effects.push(
        { type: "burst", x: hit.x, z: hit.z },
        { type: "sound", id: "hit" },
      );
      if (hit.hp === 0) {
        hit.respawn = 720;
        const loot = { meat: hit.kind === "boar" ? 4 : 1, hide: 2, bone: 1 };
        if (addItems(s.inventory, loot, capacity(s)))
          effects.push(...message("Speerwurf getroffen: Jagdbeute geborgen."));
        else {
          const chest = s.buildings.find(
            (b) => b.kind === "chest" && distance(b, hit) < 15,
          );
          if (chest && addItems(chest.inventory, loot, 32))
            effects.push(...message("Jagdbeute in naher Kiste verstaut."));
          else {
            hit.hp = 1;
            hit.respawn = 0;
            effects.push(
              ...message("Inventar voll: Das verletzte Tier entkommt."),
            );
          }
        }
        if (hit.hp === 0) {
          s.progression.kills++;
          s.progression.xp.hunting += 15;
        }
      }
    }
  }
  a.projectiles = a.projectiles.filter((p) => p.life > 0);
}
