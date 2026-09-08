export type GameMode = 'cozy' | 'survival' | 'expedition';
export type IslandId = 'home' | 'reef' | 'ember' | 'lighthouse';
export interface AdventureState {
  mode: GameMode;
  location: IslandId | 'sea';
  quests: Record<string, number>;
  notes: string[];
  secrets: string[];
  markers: {id: string; label: string; x: number; z: number}[];
  storm: {phase: 'calm' | 'warning' | 'active' | 'aftermath'; timer: number; count: number; salvaged: number};
  voyage: {unlocked: boolean; hull: number; speed: number; heading: number; visited: IslandId[]; homeDock: {x: number; z: number}; distance: number};
  sneaking: boolean;
  projectiles: {id: number; x: number; z: number; y: number; vx: number; vz: number; life: number; damage: number}[];
  actionPose: {kind: 'idle' | 'sit' | 'cook' | 'sleep' | 'throw'; remaining: number};
}
export interface ExpeditionNode {id: string; quest: string; step: number; title: string; description: string; clue: string; x: number; z: number; island: IslandId; requires?: string; cost?: import('./types').Inventory; reward?: import('./types').Inventory;}
export interface SecretSpot {id: string; title: string; x: number; z: number; island: IslandId; condition: 'always' | 'low-tide' | 'night' | 'after-storm'; reward: import('./types').Inventory;}
export interface Islet {id: IslandId; name: string; x: number; z: number; radius: number; dock: {x: number; z: number}; description: string;}
