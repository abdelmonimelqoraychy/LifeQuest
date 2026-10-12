'use client';
import {useSyncExternalStore} from 'react';
import { assertBusinessStorageAccess, subscribeStorageAccess } from '@/lib/storageAccess';
import CinematicPlayer from './CinematicPlayer';
import {notifyStorage,withStorageLock} from '@/lib/storage';
const milestones=[{level:5,src:'/cinematics/level-05.optimized.mp4',fallbackSrc:'/cinematics/level-05.mp4',title:"I'VE GOTTA GET STRONGER",subtitle:'LEVEL 05 — Le chemin vers la puissance commence.'},{level:10,src:'/cinematics/level-10.mp4',title:"I HAVEN'T LOST YET",subtitle:"LEVEL 10 — Tu n’as pas abandonné."},{level:20,src:'/cinematics/level-20.mp4',title:'POWER UNLEASHED',subtitle:'LEVEL 20 — Une nouvelle évolution.'}];
const sessionSeen=new Set<string>();
function prefix(){assertBusinessStorageAccess();try{const p=JSON.parse(localStorage.getItem('lifequest-profile-v1')||'{}');return 'lifequest-cinematic-seen-v1:'+encodeURIComponent(p.createdAt||p.name||'local-player')+':';}catch{return 'lifequest-cinematic-seen-v1:local-player:';}}
const subscribe=subscribeStorageAccess;
export function usePendingCinematic(level:number,ready:boolean){return useSyncExternalStore(subscribe,()=>{if(!ready)return null;try{assertBusinessStorageAccess();return milestones.find(m=>level>=m.level&&!sessionSeen.has(prefix()+m.level)&&localStorage.getItem(prefix()+m.level)!=='1')?.level??null;}catch{return null;}},()=>null);}
export default function LevelCinematicGate({level,ready}:{level:number;ready:boolean}){
 const active=usePendingCinematic(level,ready),item=milestones.find(m=>m.level===active);if(!item)return null;
 return <CinematicPlayer key={item.level} fullscreen {...item} onComplete={()=>{void withStorageLock(()=>{const key=prefix()+item.level;localStorage.setItem(key,'1');sessionSeen.add(key);notifyStorage();}).catch(()=>{});}}/>;
}
