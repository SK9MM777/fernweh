import { GameView } from "./view";
import { setupUI } from "./ui";
import {
  createInitialState,
  step,
  act,
  getPrompt,
  getObjective,
  recipeStatus,
  getTier,
} from "./simulation";
import { placementStatus } from "./simulation";
import { ISLETS } from "./adventure-content";
import { RECIPES, DAY_LENGTH } from "./catalog";
import { capacity, usedSlots } from "./inventory";
import { SaveStore } from "./save";
import { GameAudio } from "./audio";
import { REGION_NAMES, regionAt, START } from "./locations";
import type {
  GameState,
  GameAction,
  UIAction,
  Effect,
  ViewModel,
  BuildingState,
} from "./types";
import "./style.css";

const saves = new SaveStore(createInitialState);
const audio = new GameAudio();
let state = createInitialState();
let phase: ViewModel["phase"] = "title";
let placement: NonNullable<ViewModel["placement"]> | null = null;
let muted = false;
let frozen = false;
let reducedMotion = false;
const keys = new Set<string>();
let frame = 0,
  accumulator = 0,
  uiTime = 0,
  autosaveTime = 0,
  visualTime = 0,
  lastHealth = 100,
  diagnosticTime = 0;
let cachedSlots = saves.summaries();
let nextSlotRefresh = 0;
const view = new GameView(state);
view.repairResources(state);
const ui = setupUI(dispatch);
function syncScene(dt: number) {
  view.sync(state, dt, {
    time: visualTime,
    moving: [...keys].some((k) =>
      [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(k),
    ),
    interactive: phase === "play" && !ui.isOpen(),
    reducedMotion,
  });
}
function notify(message: string) {
  ui.toast(message);
}
function refreshSlots() {
  cachedSlots = saves.summaries();
  nextSlotRefresh = visualTime + 3;
}
function persist(slot = 0, show = false) {
  const result = saves.save(slot, state);
  refreshSlots();
  autosaveTime = 0;
  if (show || !result.ok) notify(result.message);
}
function stopInput() {
  keys.clear();
}
function changePhase(next: ViewModel["phase"]) {
  phase = next;
  stopInput();
  audio.setPaused(next !== "play");
  if (next !== "play") ui.close();
  updateUI();
}
function setState(next: GameState) {
  placement = null;
  view.setPlacement(null);
  state = next;
  view.repairResources(state);
  view.reset(state);
  lastHealth = state.player.health;
  accumulator = 0;
  autosaveTime = 0;
  frozen = false;
  syncScene(0);
}
function load(slot: number, recover = false) {
  const result = recover ? saves.recover(slot) : saves.load(slot);
  if (!result.ok || !result.state) {
    notify(result.message);
    return;
  }
  setState(result.state);
  ui.close();
  changePhase(
    state.endgame.won ? "win" : state.player.health <= 0 ? "dead" : "play",
  );
  notify(result.message);
  void audio.unlock();
}
function dispatch(action: UIAction) {
  if (action.type === "new") {
    setState(createInitialState(
      Number.isFinite(action.seed) ? Math.floor(action.seed!) >>> 0 : crypto.getRandomValues(new Uint32Array(1))[0],
      action.mode ?? "survival",
    ));
    changePhase("play");
    void audio.unlock();
    persist(0);
    notify(
      "Ein neues Kapitel. Sammle Treibholz mit E und suche die Smaragdquelle.",
    );
    return;
  }
  if (action.type === "continue") {
    load(0);
    return;
  }
  if (action.type === "load" || action.type === "recover") {
    load(action.slot ?? 0, action.type === "recover");
    return;
  }
  if (action.type === "save") {
    if (phase === "title") {
      notify("Beginne erst ein Abenteuer.");
      return;
    }
    persist(action.slot ?? 1, true);
    updateUI();
    return;
  }
  if (action.type === "delete") {
    const r = saves.delete(action.slot ?? 1);
    refreshSlots();
    notify(r.message);
    updateUI();
    return;
  }
  if (action.type === "resume") {
    ui.close();
    changePhase("play");
    return;
  }
  if (action.type === "pause") {
    pause();
    return;
  }
  if (action.type === "mute") {
    muted = !muted;
    audio.setMuted(muted);
    updateUI();
    return;
  }
  if (action.type === "panel") {
    openPanel(action.id as Parameters<typeof ui.open>[0]);
    return;
  }
  if (phase !== "play" && phase !== "pause") return;
  if (action.type === "place-cancel") { cancelPlacement(); return; }
  if (action.type === "place-rotate") {
    if (placement) { placement.rotation += Math.PI / 4; refreshPlacement(); updateUI(); }
    return;
  }
  if (action.type === "place-confirm") { confirmPlacement(); return; }
  if (action.type === "start-move") { beginPlacement(action.id ?? "", true); return; }
  if (action.type === "craft" && action.x === undefined && RECIPES.some(r => r.id === action.id && r.building)) {
    beginPlacement(action.id ?? ""); return;
  }
  const gameActions: GameAction["type"][] = [
    "craft",
    "interact",
    "eat",
    "use",
    "repair",
    "deposit",
    "withdraw",
    "plant",
    "harvest",
    "sleep",
    "fish",
    "perk",
    "raft",
    "depart",
    "drink",
    "equip", "investigate", "dig", "upgrade", "decorate", "move-building",
    "reinforce", "sit", "throw", "sneak", "board", "dock", "repair-raft",
    "marker", "remove-marker", "rescue",
  ];
  if (!gameActions.includes(action.type as GameAction["type"])) return;
  const effects = act(
    state,
    {
      type: action.type as GameAction["type"],
      id: action.id,
      item: action.item,
      amount: action.amount,
      x: action.x, z: action.z, rotation: action.rotation, label: action.label,
    },
    view.canBuild,
  );
  if (action.type === "interact" || action.type === "throw") view.attack();
  if ((action.type === "depart" || action.type === "board" || action.type === "dock") && effects.some(e=>e.type === "save")) { ui.close(); view.focus(state.player.x, state.player.z); }
  applyEffects(effects);
  if (action.type === "fish" && state.fishing.active) ui.close();
  syncScene(0);
  checkEnd();
  updateUI();
}
function cancelPlacement() {
  placement = null; view.setPlacement(null); updateUI();
}
function beginPlacement(id: string, moving = false) {
  const building = moving ? state.buildings.find(b => b.id === id) : undefined;
  const recipe = moving ? undefined : RECIPES.find(r => r.id === id);
  if (moving && (!building || Math.hypot(building.x-state.player.x,building.z-state.player.z)>8)) { notify("Gehe näher an dein Bauwerk heran."); return; }
  if (!moving && (!recipe?.building || !recipeStatus(state,recipe).available)) { notify(recipe ? recipeStatus(state,recipe).reason : "Unbekanntes Bauwerk."); return; }
  if (state.adventure.location !== 'home') { notify("Deine Basis entsteht auf der Heimatinsel."); return; }
  placement = {id, movingId:building?.id, x:building?.x ?? state.player.x+Math.sin(state.player.heading)*4.6, z:building?.z ?? state.player.z+Math.cos(state.player.heading)*4.6, rotation:building?.rotation ?? state.player.heading, valid:false};
  ui.close(); phase='play'; stopInput(); refreshPlacement();
  if (!moving && placement && !placement.valid) {
    for(let i=1;i<16 && placement && !placement.valid;i++){
      const angle=state.player.heading+i*Math.PI/8;
      placement.x=state.player.x+Math.sin(angle)*4.6;placement.z=state.player.z+Math.cos(angle)*4.6;refreshPlacement();
    }
  }
  updateUI();
}
function refreshPlacement() {
  if (!placement) return;
  const kind = placement.movingId ? state.buildings.find(b=>b.id===placement!.movingId)?.kind : RECIPES.find(r=>r.id===placement!.id)?.building;
  if (!kind) { placement=null; view.setPlacement(null); return; }
  placement.valid = Math.hypot(placement.x-state.player.x,placement.z-state.player.z) <= 12 && placementStatus(state,kind,placement.x,placement.z,placement.movingId).available && view.canBuild(placement.x,placement.z);
  view.setPlacement({kind,x:placement.x,z:placement.z,rotation:placement.rotation,valid:placement.valid});
}
function confirmPlacement() {
  if (!placement) return;
  refreshPlacement();
  if (!placement?.valid) { notify("Hier ist kein sicherer Bauplatz. Wähle eine freie Fläche in deiner Nähe."); return; }
  const chosen=placement;
  const effects=act(state,{type:chosen.movingId?'move-building':'craft',id:chosen.id,x:chosen.x,z:chosen.z,rotation:chosen.rotation},view.canBuild);
  applyEffects(effects);
  if(effects.some(e=>e.type==='save'))cancelPlacement();
  syncScene(0);updateUI();
}
window.addEventListener('pointermove',e=>{
  if(!placement || !(e.target instanceof HTMLCanvasElement))return;
  const p=view.pickGround(e.clientX,e.clientY);if(!p)return;
  placement.x=p.x;placement.z=p.z;refreshPlacement();updateUI();
});
window.addEventListener('pointerdown',e=>{
  if(!placement || e.button!==0 || !(e.target instanceof HTMLCanvasElement))return;
  const p=view.pickGround(e.clientX,e.clientY);if(p){placement.x=p.x;placement.z=p.z;}confirmPlacement();
});
function openPanel(panel: Parameters<typeof ui.open>[0], id?: string) {
  stopInput();
  ui.open(panel, id);
  updateUI();
}
function applyEffects(effects: Effect[]) {
  let needsSave = false;
  for (const e of effects) {
    if (e.type === "toast" && e.message) notify(e.message);
    if (e.type === "sound") audio.play(e.id ?? "craft");
    if (e.type === "save") needsSave = true;
    if (e.type === "burst")
      view.burst(e.x ?? state.player.x, e.z ?? state.player.z);
    if (e.type === "open") {
      const b = state.buildings.find((x) => x.id === e.id);
      if (b)
        openPanel(
          b.kind === "chest"
            ? "container"
            : b.kind === "raft"
              ? "raft"
              : b.kind === "workbench" ||
                  b.kind === "advancedBench" ||
                  b.kind === "cooker" ||
                  b.kind === "furnace" ||
                  b.kind === "dryer"
                ? "station"
                : "station",
          b.id,
        );
      else openPanel(e.id === "inventory" ? "inventory" : "crafting");
    }
  }
  if (needsSave) persist();
}
function pause() {
  if (ui.isOpen()) {
    ui.close();
    stopInput();
    updateUI();
    return;
  }
  if (phase === "play") {
    persist();
    changePhase("pause");
  } else if (phase === "pause") changePhase("play");
}
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "f5"].includes(key)
  )
    e.preventDefault();
  if (e.repeat) return;
  if (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  )
    return;
  if (key === "escape") {
    if (placement) { cancelPlacement(); return; }
    pause();
    return;
  }
  if (key === "f5" && phase !== "title") {
    openPanel("saves");
    return;
  }
  if (phase !== "play") return;
  if (placement && key === "r") { dispatch({type:"place-rotate"}); return; }
  if (placement && key === "enter") { confirmPlacement(); return; }
  if (!ui.isOpen() && key === " ") { dispatch({type:"throw"}); return; }
  if (!ui.isOpen() && key === "control") { dispatch({type:"sneak"}); return; }
  if (!ui.isOpen() && key === "f") { dispatch({type:"fish"}); return; }
  if (!ui.isOpen() && key === "v") { dispatch({type:"sit"}); return; }
  const panels: Record<string, Parameters<typeof ui.open>[0]> = {
    b: "building",
    c: "crafting",
    i: "inventory",
    m: "map",
    k: "skills",
    j: "story",
  };
  if (panels[key]) {
    if (ui.isOpen()) ui.close();
    else openPanel(panels[key]);
    return;
  }
  if (ui.isOpen()) return;
  keys.add(key);
  if (key === "e") dispatch({ type: "interact" });
  if (key === "q") dispatch({ type: "eat" });
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
function suspend() {
  stopInput();
  if (phase === "play") {
    persist();
    changePhase("pause");
  }
}
window.addEventListener("blur", suspend);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspend();
});
window.addEventListener("pagehide", () => {
  if (phase !== "title") persist();
});
function updateUI() {
  const prompt = getPrompt(state);
  ui.update({
    state,
    phase,
    placement,
    objective: getObjective(state),
    prompt: prompt.text,
    targetId: prompt.id,
    region: state.adventure.location === "sea" ? "Offenes Meer" : state.adventure.location !== "home" ? (ISLETS.find(i=>i.id===state.adventure.location)?.name ?? "Insel") : REGION_NAMES[regionAt(state.player.x, state.player.z)],
    recipes: RECIPES.map((r) => ({ ...r, ...recipeStatus(state, r) })),
    slots: cachedSlots,
    hasAutosave: !!cachedSlots.find((s) => s.slot === 0 && s.valid),
    saveMessage: saves.lastMessage,
    muted,
    capacity: capacity(state),
    usedSlots: usedSlots(state.inventory),
    tier: getTier(state),
    nearStation:
      state.buildings.find(
        (b) =>
          Math.hypot(b.x - state.player.x, b.z - state.player.z) < 8 &&
          ["workbench", "advancedBench", "cooker", "furnace"].includes(b.kind),
      )?.kind ?? "",
  });
}
function checkEnd() {
  if (state.endgame.won && (phase === "play" || phase === "pause")) {
    persist();
    audio.play("success");
    changePhase("win");
  } else if (
    state.player.health <= 0 &&
    (phase === "play" || phase === "pause")
  ) {
    persist();
    changePhase("dead");
  }
}
const qa =
  import.meta.env.DEV || new URLSearchParams(location.search).has("qa");
let qaSeed = 42;
let last = performance.now();
function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.06, (now - last) / 1000);
  last = now;
  frame++;
  const active = phase === "play" && !ui.isOpen() && !frozen;
  if (active) {
    visualTime += dt;
    const ix =
        Number(keys.has("d") || keys.has("arrowright")) -
        Number(keys.has("a") || keys.has("arrowleft")),
      iz =
        Number(keys.has("s") || keys.has("arrowdown")) -
        Number(keys.has("w") || keys.has("arrowup"));
    let x = ix * 0.824 + iz * 0.566,
      z = -ix * 0.566 + iz * 0.824;
    const n = Math.hypot(x, z);
    if (n > 0) {
      x /= n;
      z /= n;
    }
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      applyEffects(step(state, 1 / 60, { x, z, sprint: keys.has("shift") }));
      view.collide(state);
      accumulator -= 1 / 60;
      if (state.player.health <= 0 || state.endgame.won) break;
    }
    autosaveTime += dt;
    if (autosaveTime >= 45) persist();
    checkEnd();
    if (state.player.health < lastHealth - 1) {
      view.hit();
      audio.play("hit");
      view.burst(state.player.x, state.player.z);
    }
    lastHealth = state.player.health;
  }
  if (phase === "title") visualTime += dt;
  if (placement) refreshPlacement();
  syncScene(active ? dt : 0);
  view.render(state, dt, {
    time: visualTime,
    active,
    title: phase === "title",
    frozen,
    reducedMotion,
  });
  audio.setPaused(!active);
  audio.update(
    state.weather.kind,
    state.buildings.some(
      (b) =>
        b.kind === "fire" &&
        b.fuel > 0 &&
        Math.hypot(b.x - state.player.x, b.z - state.player.z) < 7,
    ),
    visualTime,
    state.adventure.location === "sea" ? "sea" : regionAt(state.player.x,state.player.z),
  );
  uiTime += dt;
  if (uiTime > 0.15) {
    updateUI();
    uiTime = 0;
  }
  if (visualTime > nextSlotRefresh) {
    refreshSlots();
  }
  diagnosticTime += dt;
  if (qa && diagnosticTime >= 0.1) {
    diagnosticTime = 0;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame,
      phase,
      elapsed: state.elapsed,
      score: state.progression.gathered,
      player: { ...state.player },
      inventory: { ...state.inventory },
      equipment: structuredClone(state.equipment),
      progression: structuredClone(state.progression),
      buildings: structuredClone(state.buildings),
      resources: state.resources.map((r) => ({ ...r })),
      animals: state.animals.map((a) => ({ ...a })),
      weather: { ...state.weather },
      endgame: { ...state.endgame },
      fishing: { ...state.fishing },
      adventure: structuredClone(state.adventure),
      placement: placement ? {...placement} : null,
      renderer: view.metrics(),
    };
  }
}
// Debug helpers are opt-in in production; all player-facing actions still use the same rules.
if (qa) {
  window.__THREE_GAME_TEST_HOOKS__ = {
    seed: (seed: number) => {
      qaSeed = seed >>> 0;
    },
    setReducedMotion: (v: boolean) => {
      reducedMotion = v;
    },
    setPausedForScreenshot: (v: boolean) => {
      frozen = v;
    },
    state: () => structuredClone(state),
    teleport: (x: number, z: number) => {
      state.player.x = x;
      state.player.z = z;
      view.focus(x, z);
      syncScene(0);
      updateUI();
    },
    action: (action: GameAction) => {
      dispatch(action);
    },
    advance: (seconds: number) => {
      for (let t = 0; t < seconds; t += 1)
        applyEffects(
          step(state, Math.min(1, seconds - t), { x: 0, z: 0, sprint: false }),
        );
      checkEnd();
      syncScene(0);
      updateUI();
    },
    setState: (name: string) => {
      setState(createInitialState(qaSeed));
      changePhase("play");
      if (name === "night") {
        state.elapsed = DAY_LENGTH * 0.52;
        state.cycle = 0.82;
      } else if (name === "rain")
        state.weather = { kind: "rain", remaining: 300, wind: 0.6 };
      else if (name === "storm")
        state.weather = { kind: "storm", remaining: 300, wind: 1 };
      else if (name === "dead") {
        state.player.health = 0;
        changePhase("dead");
      } else if (name === "base" || name === "raft") {
        prepareBase();
        if (name === "raft") state.endgame.raftStage = 4;
      } else if (name === "upgraded-base") {
        prepareBase();
        const home=state.buildings.find(b=>b.kind==='shelter')!;
        home.kind='cabin';home.level=2;home.decorations=['lantern','shelf','trophy'];
        state.buildings.forEach(b=>{b.health=150;});
      } else if (name === "camp") {
        state.player.x=25;state.player.z=23;view.focus(25,23);
      } else if (name === "storm-warning") {
        prepareBase();state.adventure.storm.phase='warning';state.adventure.storm.timer=60;state.weather.kind='cloudy';
      } else if (name === "storm-aftermath") {
        state.adventure.storm.phase='active';state.adventure.storm.timer=0.1;step(state,1,{x:0,z:0,sprint:false});
      } else if (name === "sailing" || ISLETS.some(i=>i.id===name)) {
        state.endgame.raftStage=6;state.adventure.voyage.unlocked=true;
        state.equipment.tools={spear:100,metalPickaxe:100,repairKit:100,fishingRod:100};
        state.inventory={water:8,ration:8,wood:8,fiber:8};
        state.adventure.location=name==='sailing'?'sea':ISLETS.find(i=>i.id===name)!.id;
        const isle=ISLETS.find(i=>i.id===name);
        state.player.x=isle?.x??125;state.player.z=isle?.z??55;
        state.adventure.voyage.heading=1.2;state.player.heading=1.2;
        view.focus(state.player.x,state.player.z);
        if(name==='lighthouse'){state.adventure.quests['Die versunkene Linse']=3;state.adventure.quests['Herz aus Glut']=3;}
      } else if (name !== "active-play")
        throw Error("Unknown screenshot state " + name);
      syncScene(0);
      updateUI();
      return { state: name };
    },
    scenario: (name: string) => {
      if (name === "supplies") {
        for (const item of [
          "wood",
          "stone",
          "fiber",
          "hardwood",
          "flint",
          "ore",
          "coal",
          "metal",
          "rope",
          "plank",
          "hide",
          "cloth",
          "resin",
          "water",
          "ration",
          "boatPart",
        ] as const)
          state.inventory[item] = 30;
        state.equipment.tools.backpack = 100;
      }
      if (name === "advanced") {
        state.equipment.tools = {
          ...state.equipment.tools,
          axe: 100,
          pickaxe: 100,
          hammer: 100,
          improvedSpear: 100,
          metalAxe: 100,
          metalPickaxe: 100,
          canteen: 100,
          backpack: 100,
          fishingRod: 100,
          torch: 100,
          knife: 100,
          repairKit: 100,
        };
        state.progression.discovered = [
          "beach",
          "spring",
          "jungle",
          "outlook",
          "swamp",
          "mountain",
          "cave",
          "north",
        ];
      }
      if (name === "near-death") {
        state.player.health = 0.1;
        state.player.thirst = 0;
      }
      syncScene(0);
      updateUI();
    },
    replace: (next: GameState) => {
      setState(next);
      changePhase("play");
    },
    save: (slot = 0) => {
      persist(slot);
    },
    load: (slot = 0) => {
      load(slot);
    },
  };
}
function prepareBase() {
  const kinds: BuildingState["kind"][] = [
    "fire",
    "shelter",
    "workbench",
    "chest",
    "bed",
    "cooker",
    "raincatcher",
    "dryer",
    "farm",
    "trap",
    "advancedBench",
    "furnace",
    "raft",
  ];
  state.buildings = kinds.map((kind, i) => ({
    id: "qa-" + kind,
    kind,
    x: START.x + ((i % 4) - 1) * 5,
    z: START.z - 6 - Math.floor(i / 4) * 5,
    rotation: 0,
    health: 100,
    fuel: 600,
    inventory: { wood: 12 },
    progress: kind === "farm" ? 360 : 0,
    water: 12,
    planted: kind === "farm",
    ready: false,
  }));
}
syncScene(0);
updateUI();
requestAnimationFrame(loop);
