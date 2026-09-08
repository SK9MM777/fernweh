import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync('artifacts/v3/evidence.json'));
for (const c of manifest.captures) { execFileSync(process.execPath,['scripts/inspect-threejs-canvas.mjs','--url','http://127.0.0.1:5188/?qa','--out','artifacts/v3/canvas','--state',c.state,'--seed','42','--run-id',manifest.runId,...(c.mode==='mobile'?['--mobile']:[])],{stdio:'pipe'}); console.log('Captured',c.mode,c.state); }
for(const name of ['audio','capture','performance','stability']) {execFileSync(process.execPath,[`tests/${name}-v3.mjs`],{stdio:'pipe'}); console.log('Passed',name);}
