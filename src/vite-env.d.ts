/// <reference types="vite/client" />
import type {GameState,GameAction} from './types';
declare global {interface Window {__THREE_GAME_DIAGNOSTICS__?:unknown;__THREE_GAME_TEST_HOOKS__?:{seed:(n:number)=>void;setReducedMotion:(v:boolean)=>void;setPausedForScreenshot:(v:boolean)=>void;state:()=>GameState;teleport:(x:number,z:number)=>void;action:(a:GameAction)=>void;advance:(seconds:number)=>void;setState:(name:string)=>{state:string};scenario:(name:string)=>void;replace:(state:GameState)=>void;save:(slot?:number)=>void;load:(slot?:number)=>void;};}}
