import type { Place, RegionId } from "./types";
export const ISLAND_RADIUS = 96;
export const START = { x: 0, z: 69 };
export const SPRING = { x: -16, z: 44 };
export const FISHING_SPOTS = [
  { x: 38, z: 72 },
  { x: -75, z: 12 },
  { x: 26, z: -81 },
];
export const PLACES: Place[] = [
  {
    id: "beach",
    name: "Bucht der Ankunft",
    region: "beach",
    x: 0,
    z: 66,
    radius: 19,
    description: "Treibholz, Kokosnüsse und dein erster sicherer Ankerpunkt.",
  },
  {
    id: "spring",
    name: "Smaragdquelle",
    region: "beach",
    x: -16,
    z: 44,
    radius: 9,
    description: "Frisches Wasser unter dem Wasserfall.",
  },
  {
    id: "jungle",
    name: "Grünes Herz",
    region: "jungle",
    x: 25,
    z: 15,
    radius: 19,
    description: "Dichte Vegetation, Hartholz und Wildschweine.",
  },
  {
    id: "outlook",
    name: "Alter Wachturm",
    region: "jungle",
    x: -32,
    z: 17,
    radius: 10,
    description: "Ein Orientierungspunkt über den Baumkronen.",
  },
  {
    id: "swamp",
    name: "Nebelbruch",
    region: "swamp",
    x: -51,
    z: -17,
    radius: 18,
    description: "Heilpflanzen und Harz zwischen dunklen Wasserläufen.",
  },
  {
    id: "mountain",
    name: "Windgrat",
    region: "mountain",
    x: 0,
    z: -34,
    radius: 14,
    description: "Freie Sicht zum Horizont. Hier gehört das Signalfeuer hin.",
  },
  {
    id: "cave",
    name: "Basalthöhle",
    region: "cave",
    x: 43,
    z: -32,
    radius: 14,
    description: "Erz, Kohle und Schatten. Eine Fackel hilft.",
  },
  {
    id: "north",
    name: "Wrack der Morgenstern",
    region: "north",
    x: 3,
    z: -77,
    radius: 18,
    description:
      "Metall, Stoff und seltene Beschläge für ein seetüchtiges Floß.",
  },
];
export function regionAt(x: number, z: number): RegionId {
  if (z > 40) return "beach";
  if (z < -62) return "north";
  if (Math.hypot(x - 43, z + 32) < 20) return "cave";
  if (x < -30 && z < 5) return "swamp";
  if (z < -15 && Math.abs(x) < 32) return "mountain";
  return "jungle";
}
export const REGION_NAMES: Record<RegionId, string> = {
  beach: "Südstrand",
  jungle: "Dschungel",
  mountain: "Windgrat",
  swamp: "Nebelbruch",
  north: "Nordküste",
  cave: "Basalthöhle",
};
