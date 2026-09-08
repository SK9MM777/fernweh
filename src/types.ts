import type { AdventureState } from "./adventure-types";
export const ITEM_IDS = [
  "wood",
  "hardwood",
  "stone",
  "flint",
  "fiber",
  "berry",
  "coconut",
  "herb",
  "meat",
  "cookedMeat",
  "hide",
  "bone",
  "rope",
  "plank",
  "metal",
  "ore",
  "coal",
  "fish",
  "cookedFish",
  "water",
  "resin",
  "seed",
  "potato",
  "ration",
  "cloth",
  "boatPart",
] as const;
export type ItemId = (typeof ITEM_IDS)[number];
export type Inventory = Partial<Record<ItemId, number>>;
export const TOOL_IDS = [
  "knife",
  "spear",
  "axe",
  "pickaxe",
  "hammer",
  "improvedSpear",
  "metalAxe",
  "metalPickaxe",
  "fishingRod",
  "torch",
  "canteen",
  "backpack",
  "repairKit",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];
export const BUILDING_IDS = [
  "fire",
  "shelter",
  "workbench",
  "chest",
  "bed",
  "cooker",
  "raincatcher",
  "dryer",
  "trap",
  "bigTrap",
  "farm",
  "advancedBench",
  "furnace",
  "signal",
  "raft",
  "cabin",
] as const;
export type BuildingKind = (typeof BUILDING_IDS)[number];
export type ResourceKind =
  | "wood"
  | "hardwood"
  | "stone"
  | "flint"
  | "fiber"
  | "berry"
  | "coconut"
  | "herb"
  | "ore"
  | "coal"
  | "metal"
  | "resin"
  | "cloth"
  | "boatPart";
export type WeatherKind = "clear" | "cloudy" | "rain" | "storm";
export type SkillId = "survival" | "gathering" | "hunting" | "crafting";
export type RegionId =
  "beach" | "jungle" | "mountain" | "swamp" | "north" | "cave";
export interface Place {
  id: string;
  name: string;
  region: RegionId;
  x: number;
  z: number;
  radius: number;
  description: string;
}
export interface ResourceState {
  id: string;
  kind: ResourceKind;
  x: number;
  z: number;
  remaining: number;
  respawn: number;
}
export interface AnimalState {
  windup?: number;
  flee?: number;
  id: string;
  kind: "boar" | "rabbit";
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  hp: number;
  respawn: number;
  attack: number;
  heading: number;
}
export interface BuildingState {
  level?: number;
  reinforced?: boolean;
  decorations?: string[];
  id: string;
  kind: BuildingKind;
  x: number;
  z: number;
  rotation: number;
  health: number;
  fuel: number;
  inventory: Inventory;
  progress: number;
  water: number;
  planted: boolean;
  ready: boolean;
}
export interface Equipment {
  tools: Partial<Record<ToolId, number>>;
  active: ToolId | null;
}
export interface Progression {
  xp: Record<SkillId, number>;
  perks: string[];
  discovered: string[];
  unlocked: string[];
  crafted: string[];
  gathered: number;
  kills: number;
  fishCaught: number;
  harvests: number;
  drank: boolean;
}
export interface GameState {
  version: 3;
  adventure: AdventureState;
  seed: number;
  elapsed: number;
  day: number;
  cycle: number;
  player: {
    x: number;
    z: number;
    heading: number;
    health: number;
    hunger: number;
    thirst: number;
    warmth: number;
    stamina: number;
    rested: number;
    poison: number;
  };
  inventory: Inventory;
  equipment: Equipment;
  progression: Progression;
  buildings: BuildingState[];
  resources: ResourceState[];
  animals: AnimalState[];
  weather: { kind: WeatherKind; remaining: number; wind: number };
  endgame: {
    raftStage: number;
    signalProgress: number;
    signalActive: boolean;
    won: "signal" | "raft" | null;
  };
  fishing: { active: boolean; elapsed: number; biteAt: number; window: number };
  cooldown: number;
  restCooldown: number;
  nextId: number;
}
export type GameAction = {
  x?: number; z?: number; rotation?: number; label?: string;
  type:
    | "craft"
    | "interact"
    | "eat"
    | "use"
    | "repair"
    | "deposit"
    | "withdraw"
    | "plant"
    | "harvest"
    | "sleep"
    | "fish"
    | "perk"
    | "raft"
    | "depart"
    | "drink"
    | "equip"
    | "investigate" | "dig" | "upgrade" | "decorate" | "move-building" | "reinforce" | "sit" | "throw" | "sneak" | "board" | "dock" | "repair-raft" | "marker" | "remove-marker" | "rescue";
  id?: string;
  item?: ItemId;
  amount?: number;
};
export interface Effect {
  type: "toast" | "sound" | "save" | "open" | "burst";
  message?: string;
  id?: string;
  x?: number;
  z?: number;
}
export interface InputIntent {
  x: number;
  z: number;
  sprint: boolean;
}
export interface Recipe {
  id: string;
  name: string;
  description: string;
  tier: 0 | 1 | 2 | 3;
  category:
    "Werkzeuge" | "Waffen" | "Nahrung" | "Bauen" | "Überleben" | "Flucht";
  cost: Inventory;
  output?: Inventory;
  tool?: ToolId;
  building?: BuildingKind;
  station?: BuildingKind;
  requires?: string[];
  duration?: number;
}
export interface RecipeView extends Recipe {
  available: boolean;
  reason: string;
}
export interface Perk {
  id: string;
  skill: SkillId;
  name: string;
  description: string;
  cost: number;
}
export interface SaveSummary {
  slot: number;
  exists: boolean;
  valid: boolean;
  date: string;
  day: number;
  elapsed: number;
  tier: number;
  label: string;
  error?: string;
}
export interface ViewModel {
  placement?: {id: string; movingId?: string; x: number; z: number; rotation: number; valid: boolean} | null;
  state: GameState;
  phase: "title" | "play" | "pause" | "dead" | "win";
  objective: string;
  prompt: string;
  targetId: string | null;
  region: string;
  recipes: RecipeView[];
  slots: SaveSummary[];
  hasAutosave: boolean;
  saveMessage: string;
  muted: boolean;
  capacity: number;
  usedSlots: number;
  tier: number;
  nearStation: string;
}
export type UIAction = {
  x?: number; z?: number; rotation?: number; label?: string; mode?: import("./adventure-types").GameMode; seed?: number;
  type: string;
  id?: string;
  item?: ItemId;
  amount?: number;
  slot?: number;
};
