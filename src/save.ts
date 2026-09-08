import { restoreAdventure } from "./adventure-save";
import {
  BUILDING_IDS,
  ITEM_IDS,
  TOOL_IDS,
  type GameState,
  type Inventory,
  type SaveSummary,
  type BuildingState,
  type ResourceState,
  type AnimalState,
} from "./types";
export const SAVE_VERSION = 3;
// Keep the existing storage namespace so V2 slots migrate in place on next save.
export const SAVE_PREFIX = "fernweh.v2.slot.";
const MAX_BYTES = 2_000_000;
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
interface Envelope {
  format: "fernweh";
  version: 3;
  savedAt: string;
  checksum: string;
  state: GameState;
}
export interface SaveResult {
  ok: boolean;
  message: string;
  state?: GameState;
  migrated?: boolean;
}
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): ObjectValue =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as ObjectValue)
    : {};
const finite = (
  v: unknown,
  fallback: number,
  min = -Infinity,
  max = Infinity,
) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(min, v))
    : fallback;
const integer = (v: unknown, fallback: number, min = 0, max = 1_000_000) =>
  Math.floor(finite(v, fallback, min, max));
const strings = (v: unknown, max = 256) =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.filter((x): x is string => typeof x === "string" && x.length < 100),
        ),
      ].slice(0, max)
    : [];
const bool = (v: unknown, fallback = false) =>
  typeof v === "boolean" ? v : fallback;
function cleanInventory(value: unknown): Inventory {
  const data = object(value),
    inv: Inventory = {};
  for (const id of ITEM_IDS) {
    const n = integer(data[id], 0, 0, 100_000);
    if (n) inv[id] = n;
  }
  return inv;
}
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}
function point(v: unknown, f: number) {
  return finite(v, f, -500, 500);
}
function normalize(
  raw: unknown,
  fresh: (seed?: number) => GameState,
): GameState {
  const data = object(raw);
  if (!Object.keys(data).length)
    throw Error("Der Spielstand enthält keine Weltdaten.");
  if (data.version !== undefined && data.version !== 1 && data.version !== 2 && data.version !== 3)
    throw Error("Dieser Spielstand benötigt eine andere Spielversion.");
  const state = fresh(integer(data.seed, 42, 0, 0xffffffff));
  state.adventure = restoreAdventure(data.adventure, state.adventure);
  const p = object(data.player);
  const stats = Object.keys(p).length ? p : data;
  state.elapsed = finite(data.elapsed ?? data.playTime, 0, 0, 1e9);
  state.day = integer(
    data.day,
    1 + Math.floor(state.elapsed / 1200 + 0.3),
    1,
    1000000,
  );
  state.cycle = finite(
    data.cycle,
    (state.elapsed / 1200 + 0.3) % 1,
    0,
    0.999999999,
  );
  state.player = {
    x: point(p.x ?? object(data.position).x, state.player.x),
    z: point(p.z ?? object(data.position).z, state.player.z),
    heading: finite(p.heading ?? data.rotation, 0, -1e6, 1e6),
    health: finite(stats.health, 100, 0, 100),
    hunger: finite(stats.hunger, 90, 0, 100),
    thirst: finite(stats.thirst, 90, 0, 100),
    warmth: finite(stats.warmth, 100, 0, 100),
    stamina: finite(stats.stamina, 100, 0, 100),
    rested: finite(stats.rested, 0, 0, 14400),
    poison: finite(stats.poison, 0, 0, 3600),
  };
  if (state.adventure.location === "home" && Math.hypot(state.player.x, state.player.z) > 97) {
    const r = Math.hypot(state.player.x, state.player.z);
    state.player.x *= 94 / r;
    state.player.z *= 94 / r;
  }
  state.inventory = cleanInventory(data.inventory);
  const equipment = object(data.equipment),
    tools = object(equipment.tools);
  state.equipment = { tools: {}, active: null };
  for (const id of TOOL_IDS)
    if (typeof tools[id] === "number")
      state.equipment.tools[id] = finite(tools[id], 0, 0, 100);
  if (data.hasSpear === true && !state.equipment.tools.spear)
    state.equipment.tools.spear = 100;
  if (
    typeof equipment.active === "string" &&
    TOOL_IDS.includes(equipment.active as (typeof TOOL_IDS)[number])
  )
    state.equipment.active = equipment.active as (typeof TOOL_IDS)[number];
  const progress = object(data.progression),
    xp = object(progress.xp);
  state.progression = {
    xp: {
      survival: integer(xp.survival, 0),
      gathering: integer(xp.gathering, 0),
      hunting: integer(xp.hunting, 0),
      crafting: integer(xp.crafting, 0),
    },
    perks: strings(progress.perks, 15),
    discovered: strings(progress.discovered, 30),
    unlocked: strings(progress.unlocked, 150),
    crafted: strings(progress.crafted, 150),
    gathered: integer(progress.gathered, 0),
    kills: integer(progress.kills, 0),
    fishCaught: integer(progress.fishCaught, 0),
    harvests: integer(progress.harvests, 0),
    drank: bool(progress.drank),
  };
  const ids = new Set<string>();
  state.buildings = [];
  for (const value of array(data.buildings).slice(0, 200)) {
    const b = object(value);
    if (
      typeof b.kind !== "string" ||
      !BUILDING_IDS.includes(b.kind as BuildingState["kind"])
    )
      continue;
    const id =
      typeof b.id === "string" && b.id.length < 100
        ? b.id
        : `migrated-${state.buildings.length}`;
    if (ids.has(id)) continue;
    ids.add(id);
    const result: BuildingState = {
      id,
      kind: b.kind as BuildingState["kind"],
      x: point(b.x, 0),
      z: point(b.z, 65),
      rotation: finite(b.rotation, 0, -1e6, 1e6),
      health: finite(b.health, 100, 0, 300),
      ...(b.level !== undefined ? {level: b.level === 3 ? (b.kind === "cabin" ? 2 : 0) : integer(b.level, 0, 0, 2)} : {}),
      ...(b.reinforced !== undefined || b.level === 3 ? {reinforced: bool(b.reinforced) || b.level === 3} : {}),
      ...(b.decorations !== undefined ? {decorations: strings(b.decorations, 3).filter(x => ["lantern", "shelf", "trophy"].includes(x))} : {}),
      fuel: finite(b.fuel, 0, 0, 36000),
      inventory: cleanInventory(b.inventory),
      progress: finite(b.progress, 0, 0, 100000),
      water: finite(b.water, 0, 0, 100),
      planted: bool(b.planted),
      ready: bool(b.ready),
    };
    if (Math.hypot(result.x, result.z) <= 98) state.buildings.push(result);
  }
  const savedResources = new Map<string, ObjectValue>();
  for (const value of array(data.resources).slice(0, 4000)) {
    const r = object(value);
    if (typeof r.id === "string") savedResources.set(r.id, r);
  }
  state.resources = state.resources.map((base): ResourceState => {
    const r = savedResources.get(base.id);
    return r
      ? {
          ...base,
          remaining: integer(r.remaining, base.remaining, 0, 20),
          respawn: finite(r.respawn, 0, 0, 86400),
        }
      : base;
  });
  // Storm-created salvage is persistent world content, not a base seed node.
  for (const [id,r] of savedResources) {
    if (!/^salvage-\d+-[0-3]$/.test(id) || !["wood","cloth"].includes(String(r.kind))) continue;
    const x=point(r.x,0),z=point(r.z,82);
    if(Math.hypot(x,z)>96)continue;
    state.resources.push({id,kind:r.kind as "wood"|"cloth",x,z,remaining:integer(r.remaining,2,0,20),respawn:finite(r.respawn,0,0,86400)});
  }
  const savedAnimals = new Map<string, ObjectValue>();
  for (const value of array(data.animals).slice(0, 100)) {
    const a = object(value);
    if (typeof a.id === "string") savedAnimals.set(a.id, a);
  }
  state.animals = state.animals.map((base): AnimalState => {
    const a = savedAnimals.get(base.id);
    return a
      ? {
          ...base,
          x: point(a.x, base.x),
          z: point(a.z, base.z),
          hp: finite(a.hp, base.hp, 0, 100),
          respawn: finite(a.respawn, 0, 0, 86400),
          attack: finite(a.attack, 0, 0, 30),
          ...(a.windup !== undefined ? {windup: finite(a.windup, 0, 0, 5)} : {}),
          ...(a.flee !== undefined ? {flee: finite(a.flee, 0, 0, 30)} : {}),
          heading: finite(a.heading, 0, -1e6, 1e6),
        }
      : base;
  });
  const weather = object(data.weather);
  state.weather = {
    kind: ["clear", "cloudy", "rain", "storm"].includes(String(weather.kind))
      ? (weather.kind as GameState["weather"]["kind"])
      : "clear",
    remaining: finite(weather.remaining, 180, 0, 1800),
    wind: finite(weather.wind, 0, 0, 1),
  };
  const endgame = object(data.endgame);
  state.endgame = {
    raftStage: integer(endgame.raftStage, 0, 0, 6),
    signalProgress: finite(endgame.signalProgress, 0, 0, 100000),
    signalActive: bool(endgame.signalActive),
    won:
      endgame.won === "signal" || endgame.won === "raft" ? endgame.won : null,
  };
  const fishing = object(data.fishing);
  state.fishing = {
    active: bool(fishing.active),
    elapsed: finite(fishing.elapsed, 0, 0, 120),
    biteAt: finite(fishing.biteAt, 4, 0, 30),
    window: finite(fishing.window, 2.5, 0.5, 10),
  };
  state.cooldown = finite(data.cooldown, 0, 0, 5);
  state.restCooldown = finite(data.restCooldown, 0, 0, 3600);
  state.nextId = Math.max(
    integer(data.nextId, state.buildings.length + 1),
    state.buildings.length + 1,
    ...state.buildings.map((b) =>
      /^b-\d+$/.test(b.id) ? Number(b.id.slice(2)) + 1 : 1,
    ),
  );
  state.version = 3;
  if (data.version !== 3 && state.endgame.won === "raft") {
    state.endgame.won = null; state.adventure.voyage.unlocked = true;
  }
  return state;
}
export class SaveStore {
  private storage: StorageLike | null;
  lastMessage = "Noch nicht gespeichert";
  constructor(
    private fresh: (seed?: number) => GameState,
    storage?: StorageLike,
  ) {
    try {
      this.storage = storage ?? globalThis.localStorage;
    } catch {
      this.storage = null;
    }
  }
  private key(slot: number) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 3)
      throw Error("Ungültiger Speicherplatz.");
    return SAVE_PREFIX + slot;
  }
  private decode(text: string): {
    state: GameState;
    savedAt: string;
    migrated: boolean;
  } {
    if (text.length > MAX_BYTES)
      throw Error("Der Spielstand ist ungewöhnlich groß.");
    const data = object(JSON.parse(text));
    const envelope = data.format === "fernweh";
    if (envelope && data.version !== 1 && data.version !== 2 && data.version !== 3)
      throw Error("Unbekannte Save-Version – bitte nicht überschreiben.");
    if (
      envelope &&
      (data.version === 2 || data.version === 3) &&
      data.checksum !== hash(JSON.stringify(data.state))
    )
      throw Error("Prüfsumme ungültig: Der Spielstand ist beschädigt.");
    const raw = envelope ? data.state : data;
    if (!envelope && data.version !== 1 && data.version !== 2 && data.version !== 3)
      throw Error("Kein unterstützter FERNWEH-Spielstand.");
    return {
      state: normalize(raw, this.fresh),
      savedAt:
        typeof data.savedAt === "string" &&
        !Number.isNaN(Date.parse(data.savedAt))
          ? data.savedAt
          : "",
      migrated: data.version !== 3,
    };
  }
  save(slot: number, state: GameState): SaveResult {
    try {
      if (!this.storage) throw Error("Lokaler Speicher ist nicht verfügbar.");
      const key = this.key(slot),
        snapshot = structuredClone(state);
      snapshot.version = 3;
      const envelope: Envelope = {
        format: "fernweh",
        version: 3,
        savedAt: new Date().toISOString(),
        checksum: hash(JSON.stringify(snapshot)),
        state: snapshot,
      };
      const text = JSON.stringify(envelope);
      if (text.length > MAX_BYTES) throw Error("Spielstand zu groß.");
      const previous = this.storage.getItem(key);
      this.storage.setItem(key, text);
      if (previous) {
        try {
          this.decode(previous);
          this.storage.setItem(key + ".backup", previous);
        } catch {
          /* Backups are optional; the committed save remains atomic. */
        }
      }
      this.lastMessage = `${slot === 0 ? "Automatisch" : `Slot ${slot}`} gespeichert · ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
      return { ok: true, message: this.lastMessage };
    } catch (e) {
      this.lastMessage = `Speichern fehlgeschlagen: ${e instanceof Error ? e.message : "Speicher voll oder gesperrt."}`;
      return { ok: false, message: this.lastMessage };
    }
  }
  load(slot: number): SaveResult {
    try {
      if (!this.storage) throw Error("Lokaler Speicher ist nicht verfügbar.");
      const text = this.storage.getItem(this.key(slot));
      if (!text) throw Error("Dieser Speicherplatz ist leer.");
      const parsed = this.decode(text);
      this.lastMessage = parsed.migrated
        ? "Alter Spielstand auf Version 2 aktualisiert."
        : "Spielstand geladen.";
      return {
        ok: true,
        message: this.lastMessage,
        state: parsed.state,
        migrated: parsed.migrated,
      };
    } catch (e) {
      return {
        ok: false,
        message:
          e instanceof Error
            ? e.message
            : "Spielstand konnte nicht geladen werden.",
      };
    }
  }
  recover(slot: number): SaveResult {
    try {
      if (!this.storage) throw Error("Speicher nicht verfügbar.");
      const backup = this.storage.getItem(this.key(slot) + ".backup");
      if (!backup) throw Error("Keine Sicherung vorhanden.");
      const parsed = this.decode(backup);
      return {
        ok: true,
        message: "Vorherige Sicherung geladen.",
        state: parsed.state,
        migrated: parsed.migrated,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Keine gültige Sicherung.",
      };
    }
  }
  delete(slot: number): SaveResult {
    try {
      if (!this.storage) throw Error("Speicher nicht verfügbar.");
      this.storage.removeItem(this.key(slot));
      this.storage.removeItem(this.key(slot) + ".backup");
      return {
        ok: true,
        message: `${slot === 0 ? "Autosave" : `Slot ${slot}`} gelöscht.`,
      };
    } catch {
      return {
        ok: false,
        message: "Löschen fehlgeschlagen. Der Speicher ist gesperrt.",
      };
    }
  }
  summaries(): SaveSummary[] {
    return [0, 1, 2, 3].map((slot) => {
      const base: SaveSummary = {
        slot,
        exists: false,
        valid: false,
        date: "",
        day: 1,
        elapsed: 0,
        tier: 0,
        label: "Leer",
      };
      try {
        const text = this.storage?.getItem(this.key(slot));
        if (!text) return base;
        const parsed = this.decode(text),
          s = parsed.state;
        return {
          ...base,
          exists: true,
          valid: true,
          date: parsed.savedAt,
          day: s.day,
          elapsed: s.elapsed,
          tier: s.buildings.some((b) => b.kind === "raft")
            ? 3
            : s.buildings.some((b) => b.kind === "advancedBench")
              ? 2
              : s.buildings.some((b) => b.kind === "workbench")
                ? 1
                : 0,
          label: s.endgame.won
            ? "Gerettet"
            : s.endgame.raftStage
              ? `Floß · Stufe ${s.endgame.raftStage}`
              : s.buildings.some((b) => b.kind === "workbench")
                ? "Werkstatt aufgebaut"
                : s.buildings.length
                  ? "Lager aufgebaut"
                  : "Am Strand",
        };
      } catch (e) {
        return {
          ...base,
          exists: true,
          label: "Nicht lesbar",
          error: e instanceof Error ? e.message : "Beschädigt",
        };
      }
    });
  }
}
