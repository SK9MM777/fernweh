import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const results=[];
for(const uncapped of [false,true]){
 const b=await chromium.launch({channel:'chromium',args:uncapped?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]});
 const p=await b.newPage({viewport:{width:1440,height:960}});
 async function sample(){return p.evaluate(()=>new Promise(resolve=>{const start=performance.now();let n=0;const deltas=[];let previous=start;function f(now){n++;deltas.push(now-previous);previous=now;if(now-start<5000)requestAnimationFrame(f);else{deltas.sort((a,b)=>a-b);resolve({fps:n*1000/(now-start),medianMs:deltas[Math.floor(deltas.length*.5)],p95Ms:deltas[Math.floor(deltas.length*.95)],frames:n})}}requestAnimationFrame(f)}));}
 const blank=await sample();await p.goto('http://127.0.0.1:5188/?qa');await p.locator('#start-button').click();await p.waitForTimeout(1000);
 const game=await sample();const renderer=await p.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.renderer);
 results.push({mode:uncapped?'uncapped synthetic throughput (not display FPS)':'default browser',viewport:{width:1440,height:960},blank,game,renderer});
 if(!uncapped){await p.evaluate(()=>window.__THREE_GAME_TEST_HOOKS__.setState('base'));await p.waitForTimeout(1000);results.push({mode:'default browser base',game:await sample(),renderer:await p.evaluate(()=>window.__THREE_GAME_DIAGNOSTICS__.renderer)});}
 await b.close();
}
await fs.writeFile('artifacts/v3/frame-timing.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
