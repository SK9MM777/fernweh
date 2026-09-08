# FERNWEH 3.0 · Hinter dem Horizont

Ein lokales Low-Poly-Survival-Spiel mit einer persistenten Heimatinsel, drei bereisbaren Nachbarinseln, neun Expeditionsgeschichten, 36 Rezepten, zwölf Fähigkeiten und zwei Rettungswegen. TypeScript, Vite und Three.js. Keine bezahlten Assets, keine Laufzeit-APIs, keine Konten oder externen Medien.

## Online spielen

**https://sk9mm777.github.io/fernweh/**

GitHub Pages baut und veröffentlicht Änderungen auf `main` automatisch. Spielstände bleiben im lokalen Browser-Speicher der jeweiligen Website-Adresse.

## Installation und Start

```sh
pnpm install
pnpm dev
```

Lokale Adresse: **http://localhost:5188/**. Voraussetzung: Node.js 24 und pnpm 11. Alternativ funktioniert npm mit einer passenden lokalen Node-Installation.

```sh
pnpm build       # strikte TypeScript-Prüfung + statische Produktionsdateien
pnpm preview     # Produktionsvorschau, Port 5188
```

`dist/` kann über einen statischen HTTP-Server bereitgestellt werden. Relative Asset-Pfade unterstützen Unterverzeichnisse. Nicht direkt per `file://` öffnen. Für Spielstände dieselbe Adresse verwenden: `localhost` und `127.0.0.1` haben getrennte Browser-Speicher.

## Steuerung

| Eingabe | Funktion |
|---|---|
| WASD / Pfeiltasten | Kamerabezogene Bewegung |
| Shift | Sprinten, verbraucht Ausdauer |
| E | Sammeln, jagen, trinken, angeln, Gebäude benutzen |
| Q | Schnell eine geeignete Nahrung essen |
| F | Angeln an Küste oder Anleger beginnen; E holt beim Biss ein |
| Strg / Leertaste | Schleichen umschalten / Speer werfen |
| V | Hinsetzen; Bewegung steht wieder auf |
| J | Expeditionsgeschichten und Hinweise |
| R / Enter / Esc beim Bauen | Vorschau drehen / platzieren / abbrechen |
| B | Bauen |
| C | Crafting |
| I | Inventar und Ausrüstung |
| M | Karte und entdeckte Orte |
| K | Fähigkeiten |
| F5 | Spielstände |
| Esc | Offenes Journal schließen; sonst Pause / Weiter |

Auf Touchgeräten sind Bewegung, Sprint, Interaktion und die Hauptmenüs über Bildschirmtasten erreichbar. Das Journal pausiert die Welt beim Lesen und Herstellen. Pausenmenüs erlauben Inventar-/Handwerksaktionen, ohne die Simulation fortzusetzen.

## Deine Progression

1. **Südstrand:** Treibholz, Steine, Fasern und Kokosnüsse sammeln. Die Smaragdquelle liegt nordwestlich vom Start. Feuer und Unterschlupf sichern dein erstes Lager.
2. **Werkbank:** Seil flechten; Axt, Spitzhacke und Hammer herstellen. Eine Axt erschließt Hartholz und erhöht den Holzertrag; die Spitzhacke erschließt Erz/Kohle und verbessert den Abbau.
3. **Versorgung:** Kisten nehmen überschüssige Stapel auf. Angel, Kleintierfallen, Kochstation, Regenfänger und später Pflanzbeete schaffen zuverlässige Nahrung und Wasser.
4. **Expeditionen:** Im Dschungel wachsen Hartholz und Fasern, im Nebelbruch Harz und Heilpflanzen. Windgrat und Basalthöhle liefern Feuerstein, Erz und Kohle. Das Nordwrack bietet Metall, Stoff und seltene Beschläge. Acht Entdeckungen ergänzen die Karte und geben Erfahrung.
5. **Fortgeschrittenes Lager:** Verbesserte Werkbank, Ofen, Metallwerkzeuge, größere Falle, Rucksack, Waldhütte und Trockengestell machen lange Ausflüge möglich.
6. **Flucht:** Entscheide dich für das große Signalfeuer auf dem Windgrat oder baue ein Floß in sechs sichtbaren Stufen. Das fertige Floß eröffnet die Seereise zu drei Nachbarinseln; ihre Geschichten führen zur Rettung am Leuchtturm. Beide Wege benötigen die fortgeschrittene Erkundungs- und Handwerkskette.

Ein Tag dauert **20 aktive Spielminuten**, das erste Spiel beginnt um 07:12. Alle zwölf Fähigkeiten auszubauen und eine vollständige Basis zu versorgen bietet langfristige Progression; eine mehrstündige reale Durchlaufdauer wurde noch nicht durch menschliche Langzeit-Spieltests kalibriert. Es gibt keine künstliche Mindestwartezeit für den Sieg.

## Survival, Wetter und Produktion

Gesundheit, Sättigung, Wasser, Wärme und Ausdauer beeinflussen das Spiel. Gute Versorgung regeneriert langsam Gesundheit; Ruhe senkt Sprintkosten. Unterkühlung verlangsamt Bewegung. Rohes Fleisch und roher Fisch verursachen zeitweise Vergiftung; Heilkraut hilft. Gebratenes Fleisch und gegarter Fisch sättigen deutlich besser. Nahrung verdirbt in dieser Version nicht.

Die Quelle ist unbegrenzt trinkbar. Ein Wasserbehälter nimmt Vorräte mit; Kokosnüsse lindern ebenfalls Durst. Regenfänger sammeln bei Regen oder Sturm bis zu 20 Wassereinheiten. Auch mit vollem Rucksack kannst du an der Quelle trinken; nur das Mitnehmen zusätzlicher Vorräte kann scheitern.

Klares Wetter, Wolken, Regen und Sturm verändern Licht, Sicht und Wärme. Ungeschützte Feuer verbrauchen bei Niederschlag mehr Brennstoff. Unterschlupf oder Hütte in der Nähe schützen Feuer. Mit E zwei Holz nachlegen gibt drei Minuten Brennstoff. Feuer und Fackeln helfen bei Nacht.

Kleine/große Fallen produzieren nach etwa drei Minuten Beute. Beete benötigen einen Samen, wachsen normalerweise acht Minuten und liefern Kartoffeln, Samen und Kräuter; Regen beschleunigt das Wachstum. Beim Angeln an den drei markierten Küstenstellen E zum Auswerfen und erneut während des Bissfensters drücken. Bewegung bricht Angeln ab.

Schlafen im Unterschlupf, Bett oder in der Hütte überspringt die Nacht bis zum Morgen; tagsüber ist eine kürzere Rast möglich. Hunger und Durst werden weiter verbraucht; Wetter, Wachstum, Fallen und Brennstoff laufen während der übersprungenen Zeit weiter. Nahe Wildschweine, Vergiftung oder unzureichende Versorgung verhindern Schlaf.

## Inventar, Werkzeuge und Crafting

24 Stapelplätze, bis zu 20 Stück pro Stapel; der Rucksack erweitert auf 36 Plätze. Werkzeuge und Ausrüstung besitzen eine eigene Liste. Lagerkisten bieten 32 Stapelplätze und übertragen je 1 oder 5 Stück. Übertragungen, Ernten und Jagdbeute werden ohne Gegenstandsverlust abgelehnt, wenn der Zielcontainer voll ist.

Werkzeuge haben Haltbarkeit. Reparaturen kosten zwei Holz und zwei Stein, mit Reparaturwerkzeug oder Zimmermann-Fähigkeit je eins. Das beste verfügbare Werkzeug verbessert die passende Sammelaktion; der aktive Gegenstand bestimmt das sichtbare Werkzeug. Eine vorhandene Fackel erschließt die Höhle und spendet Licht, aktiv geführt auch Wärme.

Crafting zeigt Materialkosten, Kategorie, Tier und fehlende Voraussetzungen. Stationsrezepte benötigen eine passende Station innerhalb von acht Metern. In der Kochstation muss Feuer brennen. Herstellungs- und Materialverarbeitungsschritte sind unmittelbare Aktionen; Fallen, Beete und Angeln verwenden echte Zeitabläufe.

**Alle 36 Rezepte samt Kosten, Voraussetzungen, zwölf Fähigkeiten und sechs Floßstufen:** [Rezeptbuch](docs/recipe-book.md).

## Spielstände

- Ein **Autosave**, ungefähr alle **45 aktiven Sekunden** sowie nach wichtigen Bau-, Handwerks-, Container- und Fortschrittsaktionen.
- Zusätzlich Speicherversuch beim Pausieren, Verbergen und Verlassen der Seite. Ein abrupter Browser-/Systemabsturz kann nur den letzten erfolgreichen Save erhalten.
- **Drei manuelle Slots**, jeweils mit Tag, Spielzeit, Speicherzeitpunkt und Fortschrittsstufe; Laden, bestätigtes Überschreiben und bestätigtes Löschen.
- **Neues Spiel** ersetzt den Autosave nach Bestätigung und lässt manuelle Slots bestehen.
- Gespeichert werden Spielerposition/Blickrichtung, Zeit/Tag/Zyklus, Vitalwerte/Boni, Inventar, Ausrüstung/Haltbarkeit, Rezepte/XP/Fähigkeiten, Entdeckungen, Ressourcen-Respawns, Tiere, Gebäude/Fuel/Container, Fallen/Beete, Wasser, Wetter, Angelstatus und beide Endziele.
- Format **Version 3**, Prüfsumme und defensive Validierung. Adapter übernehmen Version 1 und 2; die bisherigen lokalen Slot-Schlüssel bleiben erhalten. Ein alter abgeschlossener Floß-Spielstand darf die neue Seereise fortsetzen. Zusätzlich gespeichert werden Modus, Expeditionen, Geheimnisse, Kartenmarkierungen, Sturmphase, Bergungsgut, Bootsposition und Rumpfzustand sowie Gebäudeausbau und Einrichtung. Beschädigte/fremde/zukünftige Formate stürzen das Spiel nicht ab und werden nicht stillschweigend geladen.
- Bei erfolgreichem Überschreiben wird die vorherige gültige Version nach Möglichkeit als Backup behalten. Für beschädigte Slots gibt es „Sicherung versuchen“. Speicherplatzfehler werden angezeigt; fehlgeschlagene Schreibvorgänge erhalten den vorherigen Save.

Speicherort ist `localStorage` dieses Browsers und dieser Website-Adresse. Browserdaten löschen entfernt die Saves. Keine Cloud-Synchronisierung; im geschlossenen oder pausierten Spiel läuft die Simulation nicht offline weiter.

## Die zwei Fluchtwege

**Signalfeuer:** Auf dem Windgrat errichten. Erfordert verbesserte Werkbank, Metallspitzhacke sowie die Entdeckung von Gipfel, Höhle und Nordküste. Sammle insgesamt **300 Sekunden klares Wetter** mit brennendem Signalfeuer. Wolken/Regen pausieren die Sichtung; fehlender Brennstoff muss nachgelegt werden.

**Floß:** Bauplatz an der Küste, danach Schwimmkörper → Deck → Mast/Verstrebungen → Segel → Abdichtung → Vorräte. Erfordert Holzverarbeitung, Metallwerkzeuge, Wrackbeschläge, Stoff, Harz, Reparaturwerkzeug, Trinkwasser und Reiseproviant. Nach sechs Stufen bei klarem/bewölktem Wetter und ausreichender Gesundheit/Versorgung abfahren. Der Fortschritt ist am Modell sichtbar und wird gespeichert.

## Tests und technische Struktur

```sh
pnpm test:domain       # Regeln, Inventar, Save-Versionen, Fehlerfälle, Langzeitsimulation
pnpm test:browser      # laufende Produktionsvorschau nötig, echte Browser-Eingaben
pnpm test             # beide Testsuiten
pnpm exec tsx tests/progression-bot.ts
node tests/release-v3.mjs
```

Vor dem ersten Browser-Test gegebenenfalls `pnpm exec playwright install chromium` ausführen. Die Browserprüfungen nutzen einen isolierten Speicher und überschreiben keine Spielstände im normalen Browser. Testhelfer sind nur im Entwicklungsmodus oder bei ausdrücklich gesetztem `?qa` verfügbar. Prüfungen später Spielphasen verwenden dokumentierte Fixtures und Zeitbeschleunigung; der 45-Sekunden-Autosave wird in echter Laufzeit geprüft.

`main.ts` koordiniert Eingaben, UI und Speichern. `view.ts` besitzt Renderer, Kamera und Modelle. `world.ts` erweitert die ursprünglichen Geometrie-Fabriken. `simulation.ts` hält reine Spielregeln; `catalog.ts`, `inventory.ts`, `save.ts`, `locations.ts` und `audio.ts` besitzen eigene Verantwortlichkeiten. TypeScript bleibt strikt. Geteilte Ressourcen-Geometrie, räumliche Weltbündel, Instancing, Distanzreduktion und begrenzte Partikel halten die Welt leichtgewichtig.

Die Veröffentlichung wurde mit 45 Regel-/Speichertests und 41 Browserprüfungen geprüft. Lokale Testartefakte werden nicht im Repository gespeichert.

## Neu: Hinter dem Horizont

- **Neun Geschichten mit 27 Fundstellen:** Flaschenpost, Forschungslager, Moorlichter, Wetterstation, Höhle, Wrack und drei Inselgeschichten. Hinweise im Journal führen zur nächsten Station; Werkzeuge, Materialien, Nacht und Ebbe öffnen bestimmte Schritte. [Expeditionsführer mit Spoilern](docs/expedition-guide.md).
- **Ein Zuhause gestalten:** Unterschlupf zur Hütte und weiter zur Veranda ausbauen; Laterne, Regal und Jagdtrophäe ergänzen. Sturmverstärkung ist ein unabhängiger Ausbau. Bauvorschau drehen, gültigen Standort wählen, bestätigen oder kostenlos abbrechen. Gebäude lassen sich versetzen. Kisten innerhalb von zehn Metern liefern beim Handwerk Materialien.
- **Stürme vorbereiten:** Eine 90-sekündige Vorwarnung kündigt den Sturm an. Gebäude verstärken, das Boot reparieren und Vorräte vorbereiten. Danach liegt begrenztes Bergungsgut am Strand. Ein neuer Sturm ersetzt altes Bergungsgut. Die Wetterstation ergänzt die Geschichte.
- **Jagd:** Schleichen verringert die Aufmerksamkeit der Tiere. Spuren helfen bei der Suche. Wildschweine kündigen ihren Angriff an; Abstand und Bewegung vermeiden Treffer. Geworfene Speere benötigen Ausdauer und Haltbarkeit.
- **Sechs Geheimnisse:** Der Inselcode variiert ihre Positionen. Manche erscheinen nur nachts, bei Ebbe oder nach einem Sturm. Eigene benannte Kartenmarkierungen helfen bei der Rückkehr.
- **Segeln:** Das fertige Floß ist steuerbar. Wind beeinflusst die Geschwindigkeit, Sturm und Küstenkontakt beschädigen den Rumpf. An markierten Anlegern mit E landen oder wieder an Bord gehen. Korallenwacht, Glutinsel und Letztes Licht besitzen eigene Orte, Rohstoffe und Aufgaben. Nach der Reparatur des Leuchtturms wird die Rettung bewusst ausgelöst.
- **Lebendige Insel:** Krabben, Vögel, Glühwürmchen, regionale Brandung, Vogelrufe, Tierfährten, Sammelreaktionen, Sitz-/Koch-/Schlafposen und die Kielspur ergänzen die Low-Poly-Welt.
- **Drei Modi und Inselcode:** Inselruhe reduziert Hunger/Durst auf 45 % des normalen Verbrauchs. Überleben ist der Standard; Expedition erhöht den Verbrauch auf 130 % und lässt den ersten Sturm früher kommen. Gleicher Inselcode reproduziert die Variation. Die Inselgeometrie und Geschichten bleiben handgestaltet.

Die Heimatinsel bleibt der Bauort für das Lager. Die See verwendet leichtgewichtige Bewegung mit Trägheit statt einer vollständigen Segelphysik. Das Signalfeuer bleibt der alternative Rettungsweg; die Floßabfahrt beendet das Spiel jetzt noch nicht.

## Bekannte Grenzen

Einzelspieler; kein Multiplayer oder Cloud-Save. Kein modularer Wand-/Dach-Editor, stattdessen 16 fertige Gebäudetypen. Kein dritter Funk-Fluchtweg. Tier-KI ist einfach, Gebäude haben noch keine komplexe Zerstörung. Metallverarbeitung und Trocknen sind direkte Crafting-Aktionen. Mobile wurde mit Touch-Emulation auf dem Mac getestet; reale Mobilgeräte, Safari und Gamepads sind nicht separat abgenommen. Reale mehrstündige Balance-/Spaßtests stehen aus; technische Langzeitsimulation ersetzt sie nicht.
