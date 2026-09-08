import {writeFileSync} from 'node:fs';
import {RECIPES,ITEMS,PERKS,RAFT_STAGES} from '../src/catalog';
import {PLACES} from '../src/locations';
import type {Inventory,ItemId} from '../src/types';
const cost=(items:Inventory)=>Object.entries(items).map(([id,n])=>`${n} ${ITEMS[id as ItemId].name}`).join(', ');
const label=(id:string)=>RECIPES.find(r=>r.tool===id||r.building===id)?.name??PLACES.find(p=>p.id===id)?.name??id;
let out='# Rezept- und Fortschrittsbuch\n\nDirekt aus dem implementierten Katalog erzeugt.\n\n';
for(const tier of [0,1,2,3]){out+=`## Tier ${tier}\n\n| Rezept | Material | Voraussetzung / Ort |\n|---|---|---|\n`;for(const r of RECIPES.filter(r=>r.tier===tier)){const req=[r.station?`Bei ${label(r.station)}`:'',...(r.requires??[]).map(t=>{const [k,id]=t.split(':');return `${k==='discovered'?'Entdeckt':k==='built'?'Gebaut':'Werkzeug'}: ${label(id)}`;})].filter(Boolean);out+=`| ${r.name} | ${cost(r.cost)} | ${req.join('; ')||'Keine Station'} |\n`;}out+='\n';}
out+='## Floßbau\n\n| Stufe | Material |\n|---|---|\n';RAFT_STAGES.forEach((s,i)=>{out+=`| ${i+1}. ${s.name} | ${cost(s.cost)} |\n`;});out+='\nMetallaxt, Hammer, verbesserte Werkbank sowie entdeckte Nordküste und Höhle sind Voraussetzung. Abdichtung braucht das Reparaturwerkzeug; die letzte Stufe zusätzlich Wasserbehälter und Trockengestell.\n\n## Fähigkeiten\n\n| Fähigkeit | XP | Effekt |\n|---|---|---|\n';for(const p of PERKS)out+=`| ${p.name} | ${p.cost} ${p.skill} | ${p.description} |\n`;
writeFileSync('artifacts/v3/recipe-book.md',out);console.log(`${RECIPES.length} Rezepte, ${PERKS.length} Fähigkeiten, ${RAFT_STAGES.length} Floßstufen dokumentiert.`);
