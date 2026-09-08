import {writeFileSync} from 'node:fs';
import {EXPEDITIONS, SECRETS, ISLETS} from '../src/adventure-content';
let out='# Expeditionsführer · FERNWEH 3.0\n\nAchtung: Diese Anleitung enthält Fundorte und Lösungen. Im Spiel führen die Hinweise schrittweise durch die Geschichten. Koordinaten sind Weltkoordinaten; die Kamera dreht die Bewegungsachsen.\n\n';
for(const quest of [...new Set(EXPEDITIONS.map(n=>n.quest))]){out+=`## ${quest}\n\n`;for(const n of EXPEDITIONS.filter(n=>n.quest===quest))out+=`${n.step}. **${n.title}** (${n.island}, ${n.x}/${n.z}). ${n.clue} Voraussetzung: ${n.requires??'keine weitere'}.\n\n`;}
out+='## Nachbarinseln\n\n';for(const i of ISLETS)out+=`- **${i.name}:** ${i.description} Anleger: ${i.dock.x}/${i.dock.z}.\n`;
out+='\n## Geheimnisse\n\nDie Koordinaten variieren abhängig vom Inselcode um wenige Meter.\n\n';for(const s of SECRETS)out+=`- ${s.title}: ${s.condition}, ungefähr ${s.x}/${s.z}.\n`;
writeFileSync('artifacts/v3/expedition-guide.md',out);
