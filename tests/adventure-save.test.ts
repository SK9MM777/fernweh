import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState} from '../src/simulation';
import {SaveStore,SAVE_PREFIX,type StorageLike} from '../src/save';
import {restoreAdventure} from '../src/adventure-save';
class Memory implements StorageLike {data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null}setItem(k:string,v:string){this.data.set(k,v)}removeItem(k:string){this.data.delete(k)}}
function hash(text:string){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16)}
test('V2 checksum save migrates in existing slot without losing inventory or chest',()=>{
 const s=createInitialState();s.inventory={wood:22,metal:4};s.buildings=[{id:'b-8',kind:'chest',x:0,z:69,rotation:1,health:100,fuel:0,inventory:{cloth:7},progress:0,water:0,planted:false,ready:false}];
 const old:Record<string,unknown>={...s,version:2};delete old.adventure;
 const mem=new Memory();mem.setItem(SAVE_PREFIX+1,JSON.stringify({format:'fernweh',version:2,savedAt:new Date().toISOString(),state:old,checksum:hash(JSON.stringify(old))}));const store=new SaveStore(createInitialState,mem);const out=store.load(1);
 assert(out.ok&&out.state);assert(out.migrated);assert.equal(out.state.version,3);assert.equal(out.state.adventure.location,'home');assert.deepEqual(out.state.inventory,s.inventory);assert.equal(out.state.buildings[0].inventory.cloth,7);assert(store.save(1,out.state).ok);assert.equal(JSON.parse(mem.getItem(SAVE_PREFIX+1)!).version,3);assert(mem.getItem(SAVE_PREFIX+1+'.backup'));
});
test('V3 saves retain sea coordinates, quests, markers, storm phase, hull and upgrades',()=>{
 const s=createInitialState(731);s.player.x=172;s.player.z=-119;s.adventure.location='sea';s.adventure.mode='expedition';s.adventure.quests={wreck:2};s.adventure.notes=['Ein Signal im Norden'];s.adventure.secrets=['tidal-cache'];s.adventure.markers=[{id:'m1',label:'Meine Bucht',x:180,z:35}];s.adventure.storm={phase:'warning',timer:41,count:2,salvaged:1};s.adventure.voyage={unlocked:true,hull:73,speed:4,heading:.4,visited:['home','reef'],homeDock:{x:0,z:92},distance:385};s.adventure.sneaking=true;
 s.buildings=[{id:'b-1',kind:'shelter',x:0,z:65,rotation:2,health:185,level:2,decorations:['lantern','shelf'],fuel:0,inventory:{},progress:0,water:0,planted:false,ready:false}];const mem=new Memory(),store=new SaveStore(createInitialState,mem);assert(store.save(2,s).ok);const out=store.load(2);assert(out.ok&&out.state);assert.deepEqual(out.state.adventure,s.adventure);assert.equal(out.state.player.x,172);assert.equal(out.state.player.z,-119);assert.equal(out.state.buildings[0].level,2);assert.deepEqual(out.state.buildings[0].decorations,['lantern','shelf']);assert.equal(out.state.buildings[0].health,185);
});
test('Malformed adventure data is bounded and cannot create inaccessible islands',()=>{
 const base=createInitialState().adventure;
 const s=restoreAdventure({mode:'bad',location:'unknown',quests:{bad:Infinity},markers:[{id:'x',label:'x'.repeat(200),x:Infinity,z:1e50}],voyage:{hull:NaN,visited:['home','bogus'],unlocked:false},storm:{timer:-100,phase:'bad'},projectiles:[{x:Infinity,damage:999}]},base);
 assert.equal(s.location,'home');assert.equal(s.voyage.hull,100);assert.deepEqual(s.voyage.visited,['home']);assert.equal(s.markers[0].label.length,40);assert.equal(s.markers[0].z,500);assert.equal(s.storm.timer,0);assert.equal(s.projectiles[0].damage,150);
});
test('Completed V2 raft run unlocks playable voyage on migration',()=>{
 const s=createInitialState();s.endgame.won='raft';s.endgame.raftStage=6;const old:Record<string,unknown>={...s,version:2};delete old.adventure;const mem=new Memory();mem.setItem(SAVE_PREFIX,JSON.stringify(old));const store=new SaveStore(createInitialState,mem);mem.setItem(SAVE_PREFIX+0,JSON.stringify(old));const out=store.load(0);assert(out.ok&&out.state);assert.equal(out.state.endgame.won,null);assert(out.state.adventure.voyage.unlocked);assert.equal(out.state.endgame.raftStage,6);
});
test('Adventure save checksum and previous version backup still protect corruption',()=>{
 const mem=new Memory(),store=new SaveStore(createInitialState,mem),s=createInitialState();store.save(3,s);s.adventure.quests.wreck=1;store.save(3,s);const data=JSON.parse(mem.getItem(SAVE_PREFIX+3)!);data.state.adventure.voyage.hull=999;mem.setItem(SAVE_PREFIX+3,JSON.stringify(data));assert(!store.load(3).ok);assert(store.recover(3).ok);assert.equal(store.recover(3).state?.adventure.quests.wreck,undefined);
});
