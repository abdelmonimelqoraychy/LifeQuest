import { assertBusinessStorageAccess } from '@/lib/storageAccess';
import {isRecord,text,id,timestamp,calendarDate,nonNegative,uniqueIds,safeResourceUrl} from "@/lib/validation";
import {withStorageLock,notifyStorage} from "@/lib/storage";
export const LAB_KEY = "lifequest-hunter-lab-v1";
export type Idea = {id:string; title:string; content:string; tag:string; createdAt:string; archived:boolean};
export type MindNode = {id:string; title:string; parentId:string|null; x:number; y:number};
export type Resource = {id:string; title:string; notes:string; url:string; topic:string; mastered:boolean; createdAt:string};
export type JournalEntry = {id:string; date:string; wins:string; challenges:string; gratitude:string; tomorrow:string};
export type Session = {id:string; date:string; minutes:number; label:string;rewardStatus?:"pending"|"credited"};
export type Challenge = {id:string; prompt:string; response:string; date:string; completed:boolean};
export type LabData = {version:1; ideas:Idea[]; nodes:MindNode[]; resources:Resource[]; journal:JournalEntry[]; sessions:Session[]; challenges:Challenge[]};
export const EMPTY_LAB:LabData={version:1,ideas:[],nodes:[],resources:[],journal:[],sessions:[],challenges:[]};
export const uid=()=>`${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
export const localDay=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function validLab(v:unknown):v is LabData {
 if(!isRecord(v)||v.version!==1)return false;
 const keys=['ideas','nodes','resources','journal','sessions','challenges'] as const;
 if(!keys.every(k=>Array.isArray(v[k]) && v[k].every(x=>isRecord(x)&&id(x.id)) && uniqueIds(v[k] as {id:string}[])))return false;
 const d=v as unknown as LabData;
 if(!d.ideas.every(x=>text(x.title)&&text(x.content)&&text(x.tag)&&timestamp(x.createdAt)&&typeof x.archived==='boolean'))return false;
 if(!d.nodes.every(x=>text(x.title)&&(x.parentId===null||id(x.parentId))&&Number.isFinite(x.x)&&Number.isFinite(x.y)))return false;
 const nodes=new Map(d.nodes.map(n=>[n.id,n]));
 for(const n of d.nodes){const seen=new Set([n.id]);let parent=n.parentId;while(parent){if(seen.has(parent)||!nodes.has(parent))return false;seen.add(parent);parent=nodes.get(parent)!.parentId;}}
 return d.resources.every(x=>text(x.title)&&text(x.notes)&&text(x.topic)&&safeResourceUrl(x.url)&&typeof x.mastered==='boolean'&&timestamp(x.createdAt)) &&
 d.journal.every(x=>calendarDate(x.date)&&text(x.wins)&&text(x.challenges)&&text(x.gratitude)&&text(x.tomorrow)) && new Set(d.journal.map(x=>x.date)).size===d.journal.length &&
 d.sessions.every(x=>timestamp(x.date)&&nonNegative(x.minutes)&&x.minutes<=1440&&text(x.label)&&(x.rewardStatus===undefined||['pending','credited'].includes(x.rewardStatus))) &&
 d.challenges.every(x=>text(x.prompt)&&text(x.response)&&timestamp(x.date)&&typeof x.completed==='boolean');
}
export function readLab():LabData {assertBusinessStorageAccess();
 const raw=localStorage.getItem(LAB_KEY);assertBusinessStorageAccess();if(raw===null)return {version:1,ideas:[],nodes:[],resources:[],journal:[],sessions:[],challenges:[]};
 try{const v:unknown=JSON.parse(raw);if(validLab(v)){assertBusinessStorageAccess();return v;}}catch{/* Preserve the raw save. */}
 throw Error('Sauvegarde Hunter Lab illisible. Aucune donnée ne sera écrasée. Exporte une copie depuis Hunter Core.');
}
export function saveLab(data:LabData){assertBusinessStorageAccess();if(!validLab(data))throw Error('Hunter Lab invalide');assertBusinessStorageAccess();localStorage.setItem(LAB_KEY,JSON.stringify(data));}
export async function mutateLab(update:(data:LabData)=>LabData){return withStorageLock(()=>{const next=update(readLab());saveLab(next);notifyStorage();return next;});}
export const PROMPTS=["Imagine dix usages inattendus pour un objet courant.","Ecris une histoire en exactement six phrases.","Propose trois solutions originales a un probleme quotidien.","Dessine ou decris une invention pour economiser du temps.","Associe deux domaines sans rapport pour creer une idee.","Transforme une mauvaise habitude en mecanique de jeu.","Invente un nouveau defi pour ton futur toi.","Concois une application utile en cinq fonctionnalites.","Redige une scene ou un personnage surmonte sa peur.","Trouve cinq variantes pour ameliorer un projet existant."];
