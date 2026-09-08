import type { Inventory, ItemId, UIAction, ViewModel } from "./types";
import { ITEMS, PERKS, RAFT_STAGES, RECIPES } from "./catalog";
import { PLACES, FISHING_SPOTS } from "./locations";
import { EXPEDITIONS, ISLETS, SECRETS, MODE_LABELS } from "./adventure-content";
import type { GameMode } from "./adventure-types";

type Panel =
  | "story"
  | "inventory"
  | "crafting"
  | "building"
  | "skills"
  | "saves"
  | "map"
  | "container"
  | "station"
  | "raft";
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const names: Record<string, string> = {
  knife: "Steinklinge",
  spear: "Speer",
  axe: "Axt",
  pickaxe: "Spitzhacke",
  hammer: "Hammer",
  improvedSpear: "Verstärkter Speer",
  metalAxe: "Metallaxt",
  metalPickaxe: "Metallspitzhacke",
  fishingRod: "Angel",
  torch: "Fackel",
  canteen: "Wasserbehälter",
  backpack: "Rucksack",
  repairKit: "Reparaturset",
  survival: "Überleben",
  gathering: "Sammeln",
  hunting: "Jagen",
  crafting: "Handwerk",
};
for (const recipe of RECIPES)
  names[recipe.building ?? recipe.tool ?? recipe.id] = recipe.name;
const glyph: Record<string, string> = {
  wood: "╱",
  stone: "⬡",
  berry: "●",
  water: "◈",
  meat: "◇",
  health: "♥",
  hunger: "●",
  thirst: "◈",
  warmth: "☀",
  stamina: "ϟ",
};
const cost = (inventory: Inventory) =>
  Object.entries(inventory)
    .map(([id, n]) => `${n} ${esc(ITEMS[id as ItemId]?.name || id)}`)
    .join(" · ");
const duration = (seconds: number) =>
  `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
export function setupUI(dispatch: (action: UIAction) => void) {
  const root = document.createElement("div");
  root.id = "game-ui";
  document.body.append(root);
  root.innerHTML = `<div id="hud" class="hud hidden"><div class="vitals"><div class="brand-mini">✧ FERNWEH <span>3.0 / HORIZONT</span></div><div class="meter-stack">${(["health", "hunger", "thirst", "warmth", "stamina"] as const).map((id, i) => `<div class="vital"><b>${glyph[id]}</b><span class="vital-label">${["Gesundheit", "Sättigung", "Wasser", "Wärme", "Ausdauer"][i]}</span><span class="meter"><i id="meter-${id}"></i></span><span class="meter-value" id="value-${id}">100</span></div>`).join("")}</div><div id="status-label" class="status-label"></div></div><div class="day-cluster"><div class="day-meta"><strong id="day-label"></strong><span id="time-label"></span></div><div id="weather-label"></div><div id="forecast" class="forecast hidden" role="status"></div><div class="top-buttons"><button id="sound-button" aria-label="Ton umschalten">♫</button><button id="pause-button" aria-label="Spiel pausieren">Ⅱ</button></div></div><aside class="fieldnotes"><span class="eyebrow" id="region-label">DEIN NÄCHSTER SCHRITT</span><p id="objective"></p></aside><div class="context-prompt hidden" id="context-prompt"><kbd>E</kbd><span id="prompt-text"></span></div><nav class="toolbelt" aria-label="Spielmenüs"><div class="quick-items">${["wood", "stone", "berry", "water"].map((id) => `<span title="${id}">${glyph[id]} <b id="count-${id}">0</b></span>`).join("")}</div><button data-panel="inventory" id="inventory-button">Inventar <kbd>I</kbd></button><button data-panel="crafting" id="craft-button">Crafting <kbd>C</kbd></button><button data-panel="building" id="build-button">Bauen <kbd>B</kbd></button><button data-panel="map" id="map-button">Karte <kbd>M</kbd></button><button data-panel="story" id="story-button">Journal <kbd>J</kbd></button><button id="eat-button">Essen <kbd>Q</kbd></button></nav><section id="voyage-hud" class="voyage-hud hidden"></section><section id="placement-hud" class="placement-hud hidden"></section><div class="desktop-hint">WASD / Pfeile · Erkunden &nbsp; SHIFT · Sprinten &nbsp; E · Aktion &nbsp; STRG · Schleichen &nbsp; LEER · Werfen &nbsp; V · Sitzen &nbsp; J · Journal</div><div class="touch-controls"><div class="dpad"><button data-key="w" aria-label="Vorwärts">↑</button><button data-key="a" aria-label="Links">←</button><button data-key="s" aria-label="Rückwärts">↓</button><button data-key="d" aria-label="Rechts">→</button></div><div class="touch-right"><div class="touch-extra"><button data-key="Control" aria-label="Schleichen">⌁</button><button data-action="throw" aria-label="Speer werfen">➶</button><button data-action="sit" aria-label="Hinsetzen">♧</button></div><button data-key="Shift" aria-label="Sprinten">ϟ</button><button data-key="e" class="touch-action">E<small>Aktion</small></button></div></div></div><section class="overlay" id="overlay"><div class="title-copy"><div class="edition">✧ FERNWEH / HINTER DEM HORIZONT</div><span class="eyebrow" id="overlay-kicker"></span><h1 id="overlay-title">Fernweh<span>.</span></h1><h2 id="overlay-subtitle"></h2><p id="overlay-description"></p><div class="overlay-actions" id="overlay-actions"></div><div class="title-controls"><span><kbd>WASD</kbd> Erkunden</span><span><kbd>E</kbd> Interagieren</span><span><kbd>C</kbd> Crafting</span><span><kbd>I</kbd> Inventar</span></div><div class="title-foot">NIMM DIR ZEIT. FINDE DEINEN RHYTHMUS.</div></div><div class="island-tag">FERNWEH ARCHIPEL<small>Vier Inseln. Unzählige Geschichten.</small></div></section><section id="game-panel" class="game-panel hidden" role="dialog" aria-modal="true" aria-labelledby="panel-title"><header class="panel-header"><div><span class="eyebrow">DEIN INSELJOURNAL</span><h2 id="panel-title"></h2></div><button id="close-panel" aria-label="Menü schließen">×</button></header><nav id="panel-nav" class="panel-nav"></nav><div id="panel-body" class="panel-body"></div><footer class="panel-foot">Die Insel macht Pause, solange dein Journal geöffnet ist.</footer></section><div id="confirm-panel" class="confirm-shade hidden"><section class="confirm-card" role="alertdialog" aria-modal="true"><h2>Ganz sicher?</h2><p id="confirm-copy"></p><div><button id="confirm-cancel">Abbrechen</button><button id="confirm-action" class="primary-button">Bestätigen</button></div></section></div><div id="toasts" class="toasts" role="status" aria-live="polite"></div>`;
  const get = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  let model: ViewModel | undefined,
    panel: Panel | null = null,
    context = "",
    category = "Alle",
    signature = "",
    overlaySignature = "",
    placementSignature = "",
    mapView: "home" | "archipelago" = "home",
    selectedMode: GameMode = "survival",
    selectedSeed = "",
    confirmation: (() => void) | null = null;
  const ask = (text: string, action: () => void) => {
    get("confirm-copy").textContent = text;
    confirmation = action;
    get("confirm-panel").classList.remove("hidden");
    get("confirm-action").focus();
  };
  const close = () => {
    panel = null;
    get("toasts").replaceChildren();
    get("game-panel").classList.add("hidden");
    get("confirm-panel").classList.add("hidden");
    confirmation = null;
  };
  const open = (next: Panel, id?: string) => {
    panel = next;
    get("toasts").replaceChildren();
    root.querySelector(".panel-foot")!.textContent = "Die Insel macht Pause, solange dein Journal geöffnet ist.";
    context = id || "";
    category = "Alle";
    signature = "";
    get("game-panel").classList.remove("hidden");
    renderPanel();
    get("close-panel").focus();
  };
  get("close-panel").onclick = close;
  get("confirm-cancel").onclick = () => {
    confirmation = null;
    get("confirm-panel").classList.add("hidden");
  };
  get("confirm-action").onclick = () => {
    const action = confirmation;
    confirmation = null;
    get("confirm-panel").classList.add("hidden");
    action?.();
  };
  get("pause-button").onclick = () => dispatch({ type: "pause" });
  get("sound-button").onclick = () => dispatch({ type: "mute" });
  get("eat-button").onclick = () => dispatch({ type: "eat" });
  const inventoryRows = (
    inv: Inventory,
    action: "deposit" | "withdraw" | null,
  ) =>
    Object.entries(inv)
      .filter(([, n]) => n && n > 0)
      .map(
        ([id, n]) =>
          `<div class="item-row"><span class="item-glyph">${glyph[id] || "◇"}</span><div class="item-copy"><strong>${esc(ITEMS[id as ItemId]?.name || id)}</strong><small>${esc(ITEMS[id as ItemId]?.category || "Ressource")} · ${n} Stück</small></div>${action ? `<button data-action="${action}" data-item="${id}" data-amount="1">1 ${action === "deposit" ? "→" : "←"}</button><button data-action="${action}" data-item="${id}" data-amount="5">5 ${action === "deposit" ? "→" : "←"}</button>` : ["berry", "coconut", "meat", "cookedMeat", "fish", "cookedFish", "potato", "ration", "water", "herb"].includes(id) ? `<button data-action="${id === "water" || id === "herb" ? "use" : "eat"}" data-item="${id}">${id === "water" ? "Trinken" : id === "herb" ? "Heilen" : "Essen"}</button>` : ""}</div>`,
      )
      .join("") ||
    '<p class="empty-state">Noch leer. Die Insel hält vieles für dich bereit.</p>';
  function renderPanel() {
    if (!panel || !model) return;
    const m = model,
      s = m.state;
    const building = s.buildings.find((b) => b.id === context);
    const labels: Record<Panel, string> = {
      story: "Hinter dem Horizont.",
      inventory: "Alles, was du trägst.",
      crafting: "Mit den eigenen Händen.",
      building: "Dein Inselcamp.",
      skills: "Wachsen mit der Wildnis.",
      saves: "Deine Reise bewahren.",
      map: "Die Insel kennenlernen.",
      container: "Platz für deine Vorräte.",
      station: "An der Werkstation.",
      raft: "Der Horizont ruft.",
    };
    get("panel-title").textContent = labels[panel];
    get("panel-nav").innerHTML = (
      [
        "inventory",
        "crafting",
        "building",
        "skills",
        "map",
        "story",
        "saves",
      ] as Panel[]
    )
      .map(
        (p, i) =>
          `<button data-panel="${p}" class="${p === panel ? "selected" : ""}">${["Inventar", "Crafting", "Bauen", "Fähigkeiten", "Karte", "Geschichten", "Spielstände"][i]}</button>`,
      )
      .join("");
    let html = "";
    if (panel === "story") {
      const quests = [...new Set(EXPEDITIONS.map((n) => n.quest))];
      html = `<div class="journal-lead"><span class="eyebrow">SPUREN IM SAND</span><p>Andere waren vor dir hier. Folge ihren Spuren, lies ihre Notizen und entdecke, was hinter dem Horizont liegt.</p><span>${s.adventure.notes.length} Fundstücke · ${s.adventure.secrets.length} Geheimnisse · ${s.adventure.voyage.visited.length} Inseln</span></div>${quests
        .map((q, qi) => {
          const nodes = EXPEDITIONS.filter((n) => n.quest === q);
          const next = nodes.find(
            (n) => (s.adventure.quests[n.quest] ?? 0) <= n.step,
          );
          return `<article class="quest-entry"><span class="quest-index">${String(qi + 1).padStart(2, "0")}</span><div><span class="eyebrow">${next ? "EXPEDITION" : "ABGESCHLOSSEN"}</span><h3>${esc(q)}</h3><p>${next ? esc(next.step === 0 ? `Suche nach: ${next.title}.` : nodes[next.step - 1]?.clue ?? next.clue) : "Alle Spuren dieser Expedition sind im Journal bewahrt."}</p><div class="quest-steps">${nodes.map((n) => `<span class="${(s.adventure.quests[n.quest] ?? 0) > n.step ? "found" : ""}" title="${(s.adventure.quests[n.quest] ?? 0) > n.step ? esc(n.title) : "Noch unentdeckt"}">${(s.adventure.quests[n.quest] ?? 0) > n.step ? "✓" : "○"}</span>`).join("")}</div>${next ? `<small>Nächste Spur: ${esc(ISLETS.find((i) => i.id === next.island)?.name ?? "Heimatinsel")} · ${esc(next.requires ? (names[next.requires.replace("tool:", "")] ?? ({ night: "Bei Nacht", "low-tide": "Bei Ebbe", "voyage-relics": "Linse und Batterie" } as Record<string, string>)[next.requires] ?? "Besondere Ausrüstung") : "Halte nach einer Markierung Ausschau")}</small>` : ""}</div></article>`;
        })
        .join("")}<h3>Gelesene Fundstücke</h3>${
        EXPEDITIONS.filter((n) => (s.adventure.quests[n.quest] ?? 0) > n.step)
          .map(
            (n) =>
              `<details class="note-entry"><summary>${esc(n.title)}</summary><p>${esc(n.description)}</p>${n.reward ? `<small>Fund: ${cost(n.reward)}</small>` : ""}</details>`,
          )
          .join("") ||
        '<p class="muted-copy">Die erste Spur wartet am Nordwrack. Untersuche markierte Fundstellen mit E.</p>'
      }<h3>Verborgene Schätze</h3>${
        SECRETS.filter((n) => s.adventure.secrets.includes(n.id))
          .map((n) => `<p class="secret-found">✧ ${esc(n.title)}</p>`)
          .join("") ||
        '<p class="muted-copy">Achte auf Wegmarken, Ebbe, Nacht und frisch angespültes Strandgut nach einem Sturm.</p>'
      }<div class="journal-lead"><span class="eyebrow">DEINE REISE</span><p>${esc(MODE_LABELS[s.adventure.mode])} · Inselcode ${s.seed}</p><p>STRG: leise bewegen · Leertaste: ausgerüsteten Speer werfen · E: Spuren untersuchen · am Feuer kurz sitzen und durchatmen.</p><button data-action="sit">Am Ort hinsetzen</button></div>`;
    } else if (panel === "inventory") {
      const cats = [
        ...new Set(
          Object.entries(s.inventory)
            .filter(([, n]) => n)
            .map(([id]) => ITEMS[id as ItemId].category),
        ),
      ];
      html = `<div class="panel-intro"><span>${m.usedSlots} / ${m.capacity} Plätze · Stapel bis 20</span><strong>Stufe ${m.tier}</strong></div>${cats.map((cat) => `<h3>${esc(cat)}</h3>${inventoryRows(Object.fromEntries(Object.entries(s.inventory).filter(([id]) => ITEMS[id as ItemId].category === cat)), null)}`).join("") || '<p class="empty-state">Dein Rucksack ist leer. Sammle Treibholz am Strand.</p>'}<h3>Werkzeuge & Ausrüstung</h3>${
        Object.entries(s.equipment.tools)
          .map(
            ([id, n]) =>
              `<div class="item-row"><span class="item-glyph">⚒</span><div class="item-copy"><strong>${esc(names[id] || id)} ${s.equipment.active === id ? "· ausgerüstet" : ""}</strong><small>Haltbarkeit ${Math.round(n || 0)} %</small><progress value="${n}" max="100"></progress></div><button data-action="equip" data-id="${id}" ${s.equipment.active === id ? "disabled" : ""}>Anlegen</button><button data-action="repair" data-id="${id}" ${(n || 0) >= 100 ? "disabled" : ""}>Reparieren</button></div>`,
          )
          .join("") ||
        '<p class="muted-copy">Stelle deine ersten Werkzeuge im Crafting-Menü her.</p>'
      }<p class="muted-copy">Reparaturen benötigen Holz und Stein. Ein Rucksack erweitert den Stauraum auf 36 Plätze.</p>`;
    } else if (
      panel === "crafting" ||
      panel === "building" ||
      panel === "station"
    ) {
      const cats = [
        "Alle",
        "Werkzeuge",
        "Waffen",
        "Nahrung",
        "Bauen",
        "Überleben",
        "Flucht",
      ];
      html = `<div class="panel-intro">Stufe ${m.tier} · ${esc(building ? names[building.kind] || m.nearStation || building.kind : m.nearStation || "Unter freiem Himmel")}</div><p class="nearby-materials">Material aus Lagerkisten in deiner Nähe wird beim Herstellen automatisch mitverwendet. Gebäude platzierst und drehst du zuerst in der Welt.</p><div class="category-tabs">${cats.map((c) => `<button data-category="${c}" class="${category === c ? "selected" : ""}">${c}</button>`).join("")}</div><div class="recipes">${m.recipes
        .filter(
          (r) =>
            (panel !== "building" || r.building) &&
            (category === "Alle" || r.category === category),
        )
        .map(
          (r) =>
            `<button class="recipe ${r.available ? "" : "unavailable"}" data-craft="${r.id}" ${r.available ? "" : "disabled"}><span class="recipe-tier">${r.tier.toString().padStart(2, "0")}<small>${esc(r.category)}</small></span><span class="recipe-copy"><strong>${esc(r.name)}</strong><small>${esc(r.description)}</small><em>${cost(r.cost)}</em><span class="recipe-reason">${esc(r.available ? (r.building ? "Bauplatz wählen ↗" : "Bereit zum Herstellen") : r.reason)}</span></span><span class="recipe-arrow">${r.available ? "↗" : "·"}</span></button>`,
        )
        .join("")}</div>`;
      if (building)
        html =
          `<div class="station-actions">${["bed", "shelter", "cabin"].includes(building.kind) ? '<button data-action="sleep">Schlafen</button>' : ""}${building.kind === "farm" ? `<button data-action="${building.ready ? "harvest" : "plant"}" ${building.planted && !building.ready ? "disabled" : ""}>${building.ready ? "Ernten" : building.planted ? `Wächst · ${Math.floor((building.progress / 480) * 100)} %` : "Samen pflanzen"}</button>` : ""}${building.kind === "raincatcher" ? `<button data-action="drink">Wasser entnehmen · ${Math.floor(building.water)}</button>` : ""}</div>` +
          html;
    } else if (panel === "container")
      html = `<p class="panel-intro">${building ? "Wähle 1 oder 5 Stück zum Umlagern." : "Diese Kiste ist nicht mehr verfügbar."}</p><div class="container-columns"><section><h3>Rucksack · ${m.usedSlots}/${m.capacity}</h3>${inventoryRows(s.inventory, "deposit")}</section><section><h3>Lagerkiste</h3>${inventoryRows(building?.inventory || {}, "withdraw")}</section></div>`;
    else if (panel === "skills")
      html = (["survival", "gathering", "hunting", "crafting"] as const)
        .map(
          (skill) =>
            `<h3>${names[skill]} <span class="xp-label">${Math.floor(s.progression.xp[skill])} XP verfügbar</span></h3>${PERKS.filter(
              (p) => p.skill === skill,
            )
              .map((p) => {
                const owned = s.progression.perks.includes(p.id);
                return `<div class="perk-row"><div><strong>${esc(p.name)}</strong><p>${esc(p.description)}</p></div><button data-action="perk" data-id="${p.id}" ${owned || s.progression.xp[skill] < p.cost ? "disabled" : ""}>${owned ? "✓ Erlernt" : `${p.cost} XP`}</button></div>`;
              })
              .join("")}`,
        )
        .join("");
    else if (panel === "saves")
      html = `<p class="panel-intro">Autosave & drei manuelle Plätze · lokal in diesem Browser</p><div id="save-message" role="status">${esc(m.saveMessage)}</div>${m.slots.map((slot) => `<article class="save-slot ${slot.exists && !slot.valid ? "invalid" : ""}"><div><span class="eyebrow">${slot.slot === 0 ? "AUTOSAVE" : `SPEICHERPLATZ ${slot.slot}`}</span><h3>${slot.exists ? esc(slot.label) : "Ein neuer Ankerplatz"}</h3><p>${slot.exists && slot.valid ? `Tag ${slot.day} · ${duration(slot.elapsed)} · Stufe ${slot.tier}<br>${esc(slot.date ? new Date(slot.date).toLocaleString("de-DE") : "Älterer Spielstand")}` : slot.exists ? esc(slot.error || "Dieser Spielstand kann nicht geladen werden.") : "Noch kein Spielstand gespeichert."}</p></div><div class="save-buttons">${slot.slot !== 0 ? `<button data-save-slot="${slot.slot}" ${m.phase === "title" ? "disabled" : ""}>${slot.exists ? "Überschreiben" : "Speichern"}</button>` : ""}<button data-load-slot="${slot.slot}" ${!slot.exists || !slot.valid ? "disabled" : ""}>Laden</button>${slot.exists ? `<button data-delete-slot="${slot.slot}" class="danger">Löschen</button>${!slot.valid ? `<button data-recover-slot="${slot.slot}">Sicherung versuchen</button>` : ""}` : ""}</div></article>`).join("")}<p class="muted-copy">Automatisch alle 45 Sekunden und bei wichtigen Aktionen. Browserdaten löschen entfernt auch Spielstände.</p>`;
    else if (panel === "map") {
      html = `<div class="map-layout"><svg class="island-map" viewBox="-108 -108 216 216" role="img" aria-label="Inselkarte mit Spieler und entdeckten Orten"><rect x="-108" y="-108" width="216" height="216" fill="#9bc9c8"/><path d="M-12-95 39-83 67-51 85-8 79 41 47 83 4 97-38 84-77 49-92 4-74-48-42-82Z" fill="#d8cca0"/><path d="M-9-76 42-53 65-9 53 49 0 65-52 43-65-5-42-53Z" fill="#789a6b"/><path d="m-25-27 24-36 27 43Z" fill="#8a9385"/><text x="0" y="-91">N</text>${PLACES.map((p) => (s.progression.discovered.includes(p.id) ? `<g><circle cx="${p.x}" cy="${p.z}" r="2.5" fill="#193d35"/><text x="${p.x}" y="${p.z - 5}">${esc(p.name)}</text></g>` : "")).join("")}${FISHING_SPOTS.map((p) => `<text x="${p.x}" y="${p.z}" fill="#265976">≈</text>`).join("")}<circle cx="${s.player.x}" cy="${s.player.z}" r="4" fill="#d7683e" stroke="#fff9e9" stroke-width="1.5"/></svg><div><div class="panel-intro">${s.progression.discovered.length} / ${PLACES.length} Orte entdeckt</div>${PLACES.map((p) => `<div class="place-row"><strong>${s.progression.discovered.includes(p.id) ? esc(p.name) : "Unentdeckter Ort"}</strong><p>${s.progression.discovered.includes(p.id) ? esc(p.description) : "Erkunde die Insel, um diesen Ort einzutragen."}</p></div>`).join("")}</div></div><p class="muted-copy">● Terrakotta: dein Standort · ≈ Angelstellen · Wasser findest du an der Smaragdquelle.</p>`;
      const markerRows = s.adventure.markers
        .map(
          (marker) =>
            `<div class="marker-row"><span>⚑ ${esc(marker.label)} <small>${Math.round(marker.x)}, ${Math.round(marker.z)}</small></span><button data-action="remove-marker" data-id="${esc(marker.id)}" aria-label="Markierung ${esc(marker.label)} entfernen">Entfernen</button></div>`,
        )
        .join("");
      if (mapView === "archipelago")
        html = `<div class="map-layout"><svg class="island-map archipelago-map" viewBox="-245 -265 490 425" role="img" aria-label="Seekarte mit Heimatinsel und drei Reisezielen"><rect x="-245" y="-265" width="490" height="425" fill="#97c3c2"/><path d="M0 75 Q160 100 180 35 T30-220 Q-170-220-180-100 T0 75" fill="none" stroke="#fff9e9" stroke-width="1" stroke-dasharray="4 5"/><circle cx="0" cy="0" r="91" fill="#94a17a"/><text x="0" y="0">HEIMATINSEL</text>${ISLETS.map((i) => `<circle cx="${i.x}" cy="${i.z}" r="${i.radius}" fill="${s.adventure.voyage.visited.includes(i.id) ? "#d9c48b" : "#a7b69a"}"/><text x="${i.x}" y="${i.z - i.radius - 9}">${esc(i.name)}</text><circle cx="${i.dock.x}" cy="${i.dock.z}" r="3" fill="#193d35"/>`).join("")}<circle cx="${s.player.x}" cy="${s.player.z}" r="5" fill="#d7683e" stroke="#fff9e9" stroke-width="2"/></svg><div><div class="panel-intro">${s.adventure.voyage.unlocked ? "Dein Floß öffnet den Horizont." : "Baue das Floß, um die See zu erkunden."}</div>${ISLETS.map((i) => `<article class="place-row"><strong>${s.adventure.voyage.visited.includes(i.id) ? "✓ " : "◇ "}${esc(i.name)}</strong><p>${esc(i.description)}</p><small>Anleger ${i.dock.x}, ${i.dock.z} · ${Math.round(Math.hypot(i.dock.x - s.player.x, i.dock.z - s.player.z))} m entfernt</small></article>`).join("")}<p class="muted-copy">Steuere dein Floß mit WASD. An Anlegestellen kannst du mit E oder „Anlegen“ an Land gehen.</p></div></div>`;
      const markerSvg = s.adventure.markers
        .filter(
          (marker) =>
            mapView === "archipelago" || Math.hypot(marker.x, marker.z) < 105,
        )
        .map(
          (marker) =>
            `<g><path d="M${marker.x} ${marker.z + 4}v-9l5 2-5 2" stroke="#9c5037" stroke-width="1" fill="#d7683e"/><title>${esc(marker.label)}</title></g>`,
        )
        .join("");
      html =
        `<div class="category-tabs"><button data-map-view="home" class="${mapView === "home" ? "selected" : ""}">Heimatinsel</button><button data-map-view="archipelago" class="${mapView === "archipelago" ? "selected" : ""}">Seekarte</button></div>` +
        html.replace("</svg>", markerSvg + "</svg>") +
        `<section class="map-notes"><h3>Eigene Wegmarken</h3><div class="marker-editor"><label for="marker-label">Diesen Ort merken</label><input id="marker-label" maxlength="40" placeholder="Zum Beispiel: Mein Lager"><button data-action="marker">⚑ Standort markieren</button></div>${markerRows || '<p class="muted-copy">Deine Markierungen werden mit der Reise gespeichert.</p>'}</section>`;
    } else if (panel === "raft")
      html = `<p class="panel-intro">${s.endgame.raftStage} / ${RAFT_STAGES.length} Baustufen abgeschlossen</p><p class="muted-copy">Für den Bau: Metallaxt, Hammer und verbesserte Werkbank. Erkunde Nordküste und Höhle. Für die letzten Stufen brauchst du Reparaturset, Wasserbehälter und Trockengestell.</p>${RAFT_STAGES.map((stage, i) => `<article class="raft-stage ${i < s.endgame.raftStage ? "complete" : ""}"><span class="stage-number">${i < s.endgame.raftStage ? "✓" : String(i + 1).padStart(2, "0")}</span><div><h3>${esc(stage.name)}</h3><p>${esc(stage.description)}</p><em>${cost(stage.cost)}</em></div>${i === s.endgame.raftStage ? '<button data-action="raft">Ausbauen ↗</button>' : ""}</article>`).join("")}<button class="primary-button depart-button" data-action="depart" ${s.endgame.raftStage < RAFT_STAGES.length ? "disabled" : ""}>Segel setzen · Auf zur See ↗</button><p class="muted-copy">Abfahrt bei klarem oder bewölktem Wetter. Stärke dich vorher: mindestens 35 Gesundheit, 25 Sättigung und 25 Wasser.</p>`;
    if (panel === "raft" && s.adventure.voyage.unlocked)
      html =
        `<div class="journal-lead"><span class="eyebrow">DEIN FLOSS · RUMPF ${Math.round(s.adventure.voyage.hull)} %</span><p>Der erste Aufbruch ist erst der Anfang. Drei Inseln und das Letzte Licht warten auf dich.</p><div class="station-actions"><button data-action="board">An Bord gehen</button><button data-action="repair-raft">Rumpf reparieren</button><button data-panel="map">Seekarte öffnen</button></div></div>` +
        html;
    if (panel === "inventory" && (s.equipment.tools.fishingRod ?? 0) > 0) html = `<div class="station-actions"><button data-action="fish">Angeln <kbd>F</kbd></button><span class="muted-copy">Am Angelplatz oder Inselanleger auswerfen; beim Biss E drücken.</span></div>` + html;
    if (panel === "building" && s.buildings.length) html = `<section class="camp-register"><h3>Deine Gebäude</h3>${s.buildings.map(b => `<div class="marker-row"><span>${esc(names[b.kind] ?? b.kind)}<small>${Math.round(Math.hypot(b.x-s.player.x,b.z-s.player.z))} m · ${Math.round(b.health)} Zustand</small></span><button data-manage="${esc(b.id)}" ${Math.hypot(b.x-s.player.x,b.z-s.player.z)>10 ? "disabled" : ""}>Verwalten</button></div>`).join("")}<p class="muted-copy">Gehe zum Gebäude, um es zu versetzen, einzurichten oder vor Sturm zu schützen.</p></section>` + html;
    if (building && ["station", "container", "raft"].includes(panel)) {
      const level = building.level ?? 0;
      html =
        `<div class="building-management"><div><span class="eyebrow">${esc(names[building.kind] ?? building.kind)} · AUSBAU ${level}/2</span><p>Zustand ${Math.round(building.health)} · ${building.decorations?.length ?? 0} Einrichtungsstücke</p></div><div class="station-actions">${["shelter", "cabin"].includes(building.kind) ? `<button data-action="upgrade" ${level >= 2 ? "disabled" : ""}>${building.kind === "shelter" ? "Zur Hütte · 8 Bretter, 4 Seile" : "Veranda · 6 Bretter, 4 Hartholz"}</button>` : ""}<button data-action="reinforce" ${building.reinforced ? "disabled" : ""}>Sturmfest · 4 Bretter, 2 Seile</button><button data-action="repair" ${building.health >= (building.reinforced ? 150 : building.kind === "cabin" ? 130 : 100) ? "disabled" : ""}>Reparieren · 2 Holz, 1 Stein</button>${!["raft", "signal"].includes(building.kind) ? `<button data-action="start-move">Versetzen ↗</button>` : ""}</div><div class="decoration-actions">${[
          ["lantern", "Laterne · 2 Metall, 2 Harz"],
          ["shelf", "Regal · 3 Bretter"],
          ["trophy", "Trophäe · 2 Fell, 3 Knochen"],
        ]
          .map(
            ([id, label]) =>
              `<button data-action="decorate" data-label="${id}" ${building.decorations?.includes(id) ? "disabled" : ""}>${building.decorations?.includes(id) ? "✓ " : "+ "}${label}</button>`,
          )
          .join(
            "",
          )}</div><small>Vorräte aus Kisten innerhalb von 10 Metern werden mitverwendet.</small></div>` +
        html;
    }
    get("panel-body").innerHTML = html;
  }
  root.addEventListener("click", (event) => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button",
    );
    if (!b || b.disabled) return;
    if (b.dataset.manage) {
      const building = model?.state.buildings.find(item => item.id === b.dataset.manage);
      if (building) open(building.kind === "chest" ? "container" : building.kind === "raft" ? "raft" : "station", building.id);
      return;
    }
    if (b.dataset.mapView) {
      mapView = b.dataset.mapView as typeof mapView;
      signature = "";
      renderPanel();
      return;
    }
    if (b.dataset.mode) {
      selectedMode = b.dataset.mode as GameMode;
      root.querySelectorAll<HTMLElement>("[data-mode]").forEach((el) => {
        el.classList.toggle("selected", el.dataset.mode === selectedMode);
        el.setAttribute(
          "aria-pressed",
          String(el.dataset.mode === selectedMode),
        );
      });
      return;
    }
    if (b.dataset.action === "marker") {
      const input = root.querySelector<HTMLInputElement>("#marker-label");
      dispatch({
        type: "marker",
        label: input?.value.trim() || "Mein Ort",
        x: model?.state.player.x,
        z: model?.state.player.z,
      });
      return;
    }
    if (b.dataset.panel) {
      open(b.dataset.panel as Panel);
      return;
    }
    if (b.dataset.category) {
      category = b.dataset.category;
      signature = "";
      renderPanel();
      return;
    }
    if (b.dataset.craft) {
      dispatch({ type: "craft", id: b.dataset.craft });
      return;
    }
    if (b.dataset.action) {
      dispatch({
        type: b.dataset.action,
        id: b.dataset.id || context || undefined,
        item: b.dataset.item as ItemId | undefined,
        amount: b.dataset.amount ? Number(b.dataset.amount) : undefined,
        label: b.dataset.label,
      });
      return;
    }
    for (const kind of ["save", "load", "delete", "recover"] as const) {
      const slotText = b.dataset[`${kind}Slot`];
      if (slotText !== undefined) {
        const slot = Number(slotText);
        const act = () => dispatch({ type: kind, slot });
        if (kind === "delete")
          ask(
            `Spielstand ${slot === 0 ? "Autosave" : slot} endgültig löschen?`,
            act,
          );
        else if (
          kind === "save" &&
          model?.slots.find((s) => s.slot === slot)?.exists
        )
          ask(
            `Speicherplatz ${slot} mit deinem aktuellen Fortschritt überschreiben?`,
            act,
          );
        else if (
          (kind === "load" || kind === "recover") &&
          model?.phase !== "title"
        )
          ask(
            "Diesen Spielstand laden? Nicht gespeicherter Fortschritt wird verworfen.",
            act,
          );
        else act();
        return;
      }
    }
    if (b.id === "start-button") {
      close();
      dispatch({
        type:
          model?.phase === "pause"
            ? "resume"
            : model?.hasAutosave && model.phase === "title"
              ? "continue"
              : "new",
        mode: selectedMode,
        seed: selectedSeed.trim() ? Number(selectedSeed) : undefined,
      });
    }
    if (b.id === "new-button")
      ask(
        "Eine neue Reise beginnen? Dein aktueller Autosave wird ersetzt. Manuelle Spielstände bleiben erhalten.",
        () => {
          close();
          dispatch({
            type: "new",
            mode: selectedMode,
            seed: selectedSeed.trim() ? Number(selectedSeed) : undefined,
          });
        },
      );
  });
  root.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement && event.key !== "Escape")
      event.stopPropagation();
    if (event.key !== "Tab") return;
    const activeDialog = !get("confirm-panel").classList.contains("hidden")
      ? get("confirm-panel")
      : panel
        ? get("game-panel")
        : null;
    if (!activeDialog) return;
    const targets = Array.from(
      activeDialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input, summary",
      ),
    ).filter((el) => el.getClientRects().length);
    const first = targets[0],
      last = targets.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  root.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id === "island-seed") selectedSeed = el.value;
  });
  root.querySelectorAll<HTMLButtonElement>("[data-key]").forEach((b) => {
    let down = false;
    const key = b.dataset.key!;
    const emit = (type: string) =>
      window.dispatchEvent(
        new KeyboardEvent(type, {
          key,
          code:
            key === "Shift"
              ? "ShiftLeft"
              : key === "Control"
                ? "ControlLeft"
                : `Key${key.toUpperCase()}`,
          bubbles: true,
        }),
      );
    const release = () => {
      if (down) {
        down = false;
        emit("keyup");
        b.classList.remove("pressed");
      }
    };
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      down = true;
      emit("keydown");
      b.classList.add("pressed");
    };
    b.onpointerup = release;
    b.onpointercancel = release;
    b.onlostpointercapture = release;
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) release();
    });
  });
  function update(m: ViewModel) {
    const oldPhase = model?.phase;
    model = m;
    if (oldPhase !== m.phase && m.phase !== "play") close();
    get("hud").classList.toggle("hidden", m.phase !== "play");
    get("hud").classList.toggle("placing", Boolean(m.placement));
    get("overlay").classList.toggle("hidden", m.phase === "play");
    for (const id of [
      "health",
      "hunger",
      "thirst",
      "warmth",
      "stamina",
    ] as const) {
      const n = Math.round(Math.max(0, Math.min(100, m.state.player[id])));
      get(`meter-${id}`).style.width = `${n}%`;
      get(`meter-${id}`).classList.toggle("critical", n < 25);
      get(`value-${id}`).textContent = String(n);
    }
    get("day-label").textContent =
      `TAG ${String(m.state.day).padStart(2, "0")}`;
    const hours = (m.state.cycle * 24) % 24;
    get("time-label").textContent =
      `${String(Math.floor(hours)).padStart(2, "0")}:${String(Math.floor((hours % 1) * 60)).padStart(2, "0")}`;
    get("weather-label").textContent = {
      clear: "☀ Klar",
      cloudy: "☁ Bewölkt",
      rain: "☂ Regen",
      storm: "ϟ Sturm",
    }[m.state.weather.kind];
    const adventure = m.state.adventure;
    const storm = adventure.storm;
    const warning = storm.phase === "warning" || storm.phase === "active";
    get("forecast").classList.toggle("hidden", !warning);
    get("forecast").textContent =
      storm.phase === "warning"
        ? `ϟ Sturm in ${Math.ceil(storm.timer)} s · Vorräte & Schutz sichern`
        : `ϟ Unwetter · ${Math.ceil(storm.timer)} s · Suche Schutz`;
    const atSea = adventure.location === "sea";
    const canRescue =
      adventure.location === "lighthouse" &&
      (adventure.quests["Letztes Licht"] ?? 0) >= 3;
    get("voyage-hud").classList.toggle("hidden", !atSea && !canRescue);
    const seaHtml = `<span class="eyebrow">${canRescue ? "LETZTES LICHT" : "UNTER SEGELN"}</span><div><strong><span id="sea-hull"></span> % <small>Rumpf</small></strong><strong><span id="sea-speed"></span> <small>m/s</small></strong><strong><span id="sea-wind"></span> % <small>Wind</small></strong></div><div class="sea-actions">${canRescue ? `<button data-action="rescue">Rettung rufen</button>` : `<button data-action="dock">Anlegen</button><button data-action="repair-raft" title="2 Holz und 2 Fasern">Reparieren</button>`}<button data-panel="map">Seekarte</button></div>`;
    if (get("voyage-hud").dataset.layout !== String(canRescue)) {
      get("voyage-hud").innerHTML = seaHtml;
      get("voyage-hud").dataset.layout = String(canRescue);
    }
    get("sea-hull").textContent = String(Math.round(adventure.voyage.hull));
    get("sea-speed").textContent = adventure.voyage.speed.toFixed(1);
    get("sea-wind").textContent = String(
      Math.round(m.state.weather.wind * 100),
    );
    get("placement-hud").classList.toggle("hidden", !m.placement);
    if (m.placement) {
      const placementHtml = `<div><strong>${m.placement.movingId ? "Gebäude versetzen" : (names[m.placement.id] ?? RECIPES.find((r) => r.id === m.placement?.id)?.name ?? "Bauplatz wählen")}</strong><small>${m.placement.valid ? "Freier Bauplatz" : "Hier ist kein sicherer Bauplatz"} · ${Math.round((m.placement.rotation * 180) / Math.PI)}°</small></div><div><button data-action="place-rotate">Drehen <kbd>R</kbd></button><button class="primary-button" data-action="place-confirm" ${m.placement.valid ? "" : "disabled"}>Platzieren <kbd>↵</kbd></button><button data-action="place-cancel">Abbrechen</button></div><small>Maus: Bauplatz wählen · R: drehen · Enter / Klick: setzen · Esc: abbrechen</small>`;
      if (placementSignature !== placementHtml) {
        placementSignature = placementHtml;
        get("placement-hud").innerHTML = placementHtml;
      }
    }
    get("region-label").textContent = m.region.toUpperCase();
    get("objective").textContent = m.objective;
    get("prompt-text").textContent = m.prompt.replace(/^E[ \u00b7]+/, "");
    get("context-prompt").classList.toggle("hidden", !m.prompt);
    get("sound-button").textContent = m.muted ? "♪ ×" : "♫";
    for (const id of ["wood", "stone", "berry", "water"] as ItemId[])
      get(`count-${id}`).textContent = String(m.state.inventory[id] || 0);
    get("status-label").textContent = [
      m.state.adventure.sneaking ? "Leise Schritte" : "",
      m.state.adventure.actionPose.kind === "sit" ? "Durchatmen" : "",
      m.state.player.rested > 0 ? "Ausgeruht" : "",
      m.state.player.poison > 0 ? "Vergiftet" : "",
      m.state.player.warmth < 20 ? "Unterkühlt" : "",
      m.state.player.hunger > 75 && m.state.player.thirst > 60
        ? "Gut versorgt"
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const overlayKey = `${m.phase}-${m.hasAutosave}-${m.state.endgame.won}`;
    if (overlayKey !== overlaySignature) {
      overlaySignature = overlayKey;
      const copy =
        m.phase === "pause"
          ? [
              "EIN MOMENT FÜR DICH.",
              "Durchatmen",
              "Die Insel wartet auf dich.",
              "Deine Reise macht Pause. Bewahre deinen Fortschritt oder plane den nächsten Aufbruch.",
            ]
          : m.phase === "dead"
            ? [
                "DIE WILDNIS HAT IHRE TÜCKEN.",
                "Gestrandet",
                "Jeder Versuch erzählt eine Geschichte.",
                "Lade einen Spielstand oder beginne mit deinem neuen Wissen eine weitere Reise.",
              ]
            : m.phase === "win"
              ? [
                  "EIN NEUER HORIZONT.",
                  "Heimwärts",
                  m.state.endgame.won === "raft"
                    ? "Du hast die Segel gesetzt."
                    : "Dein Signal wurde gesehen.",
                  "Du hast die Insel kennengelernt, dein Lager aufgebaut und deinen eigenen Weg nach Hause gefunden.",
                ]
              : [
                  "VERLOREN. ABER NOCH LANGE NICHT VERLOREN.",
                  "Fernweh",
                  "Hinter dem Horizont.",
                  "Salz auf deiner Haut. Sand unter deinen Füßen. Eine Insel voller Spuren. Baue ein Zuhause, überstehe die Stürme und segle zu neuen Ufern.",
                ];
      get("overlay-kicker").textContent = copy[0];
      get("overlay-title").innerHTML = `${copy[1]}<span>.</span>`;
      get("overlay-subtitle").textContent = copy[2];
      get("overlay-description").textContent = copy[3];
      get("overlay-actions").innerHTML =
        `${m.phase === "title" || m.phase === "dead" || m.phase === "win" || m.phase === "pause" ? `<fieldset class="mode-picker"><legend>Deine nächste Reise</legend><div>${(["cozy", "survival", "expedition"] as GameMode[]).map((mode) => `<button data-mode="${mode}" class="${selectedMode === mode ? "selected" : ""}" aria-pressed="${selectedMode === mode}">${esc(MODE_LABELS[mode])}<small>${{ cozy: "Bauen & entdecken", survival: "Dein Rhythmus zählt", expedition: "Weniger Vorräte. Mehr Risiko." }[mode]}</small></button>`).join("")}</div><label for="island-seed">Inselcode <input id="island-seed" type="number" min="1" max="2147483647" placeholder="Zufällige neue Insel" value="${esc(selectedSeed)}"></label></fieldset>` : ""}${m.phase === "title" || m.phase === "pause" ? `<button id="start-button" class="primary-button">${m.phase === "pause" ? "Weiter erkunden" : m.hasAutosave ? "Reise fortsetzen" : "Das Abenteuer beginnt"} <span>↗</span></button>` : ""}<div class="secondary-actions"><button data-panel="saves">Spielstände</button>${m.phase !== "title" || m.hasAutosave ? '<button id="new-button">Neues Spiel</button>' : ""}${m.phase === "pause" ? '<button data-panel="skills">Fähigkeiten</button><button data-panel="map">Karte</button><button data-panel="story">Geschichten</button>' : ""}</div>`;
    }
    if (panel) {
      const key = JSON.stringify([
        panel,
        context,
        category,
        m.phase,
        m.state.inventory,
        m.state.equipment,
        m.state.progression,
        m.state.buildings.map((b) => ({
          ...b,
          progress: Math.floor(b.progress),
          fuel: Math.floor(b.fuel),
          water: Math.floor(b.water),
        })),
        m.state.endgame,
        m.state.adventure.quests,
        m.state.adventure.notes,
        m.state.adventure.secrets,
        m.state.adventure.markers,
        m.state.adventure.location,
        m.state.adventure.voyage.visited,
        mapView,
        m.recipes.map((r) => [r.available, r.reason]),
        m.slots,
        m.saveMessage,
        m.capacity,
        m.usedSlots,
        m.nearStation,
        panel === "map"
          ? [Math.round(m.state.player.x), Math.round(m.state.player.z)]
          : null,
      ]);
      if (key !== signature) {
        signature = key;
        renderPanel();
      }
    }
  }
  return {
    update,
    open,
    close,
    isOpen: () => panel !== null || confirmation !== null,
    toast(message: string) {
      if (panel) { root.querySelector(".panel-foot")!.textContent = message; return; }
      const el = document.createElement("div");
      el.className = "toast";
      el.textContent = message;
      get("toasts").append(el);
      while (get("toasts").children.length > 3)
        get("toasts").firstElementChild?.remove();
      setTimeout(() => el.remove(), 4400);
    },
  };
}
