import type { AdventureState, IslandId } from './adventure-types';
const obj = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min,Math.min(max,v)) : fallback;
const strings = (v: unknown, max=100) => Array.isArray(v) ? [...new Set(v.filter((x):x is string => typeof x==='string' && x.length<200))].slice(0,max) : [];
const islands: IslandId[] = ['home','reef','ember','lighthouse'];
/** Bound every persisted extension. V2 saves inherit the fresh adventure defaults. */
export function restoreAdventure(value: unknown, base: AdventureState): AdventureState {
 const a=obj(value), storm=obj(a.storm), voyage=obj(a.voyage), dock=obj(voyage.homeDock), pose=obj(a.actionPose), quests=obj(a.quests);
 const next:AdventureState={
  mode: ['cozy','survival','expedition'].includes(String(a.mode)) ? a.mode as AdventureState['mode'] : base.mode,
  location: [...islands,'sea'].includes(String(a.location)) ? a.location as AdventureState['location'] : 'home',
  quests: {}, notes: strings(a.notes), secrets: strings(a.secrets), markers: [],
  storm: {phase:['calm','warning','active','aftermath'].includes(String(storm.phase)) ? storm.phase as AdventureState['storm']['phase'] : base.storm.phase, timer:number(storm.timer,base.storm.timer,0,86400), count:Math.floor(number(storm.count,0,0,100000)), salvaged:Math.floor(number(storm.salvaged,0,0,100000))},
  voyage: {unlocked:voyage.unlocked===true,hull:number(voyage.hull,100,0,100),speed:number(voyage.speed,0,0,30),heading:number(voyage.heading,0,-1e6,1e6),visited:strings(voyage.visited,4).filter((x):x is IslandId=>islands.includes(x as IslandId)),homeDock:{x:number(dock.x,base.voyage.homeDock.x,-100,100),z:number(dock.z,base.voyage.homeDock.z,-100,100)},distance:number(voyage.distance,0,0,1e9)},
  sneaking:a.sneaking===true,projectiles:[],
  actionPose:{kind:['idle','sit','cook','sleep','throw'].includes(String(pose.kind))?pose.kind as AdventureState['actionPose']['kind']:'idle',remaining:number(pose.remaining,0,0,3600)}
 };
 for(const [key,v] of Object.entries(quests).slice(0,100)) if(key.length>0 && key.length<=100 && !["__proto__","constructor","prototype"].includes(key)) next.quests[key]=Math.floor(number(v,0,0,20));
 for(const value of Array.isArray(a.markers)?a.markers.slice(0,30):[]){const m=obj(value);if(typeof m.id==='string'&&typeof m.label==='string'&&!next.markers.some(q=>q.id===m.id))next.markers.push({id:m.id.slice(0,80),label:m.label.trim().slice(0,40)||'Markierung',x:number(m.x,0,-500,500),z:number(m.z,0,-500,500)});}
 for(const value of Array.isArray(a.projectiles)?a.projectiles.slice(0,12):[]){const p=obj(value);next.projectiles.push({id:Math.floor(number(p.id,0,0,1e9)),x:number(p.x,0,-500,500),z:number(p.z,0,-500,500),y:number(p.y,0,0,30),vx:number(p.vx,0,-50,50),vz:number(p.vz,0,-50,50),life:number(p.life,0,0,5),damage:number(p.damage,0,0,150)});}
 if(!next.voyage.visited.includes('home')) next.voyage.visited.unshift('home');
 if(next.location!=='home'&&!next.voyage.unlocked)next.location='home';
 return next;
}
