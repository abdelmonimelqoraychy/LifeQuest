export const LAB_KEY = "lifequest-hunter-lab-v1";
export type Idea = {id:string; title:string; content:string; tag:string; createdAt:string; archived:boolean};
export type MindNode = {id:string; title:string; parentId:string|null; x:number; y:number};
export type Resource = {id:string; title:string; notes:string; url:string; topic:string; mastered:boolean; createdAt:string};
export type JournalEntry = {id:string; date:string; wins:string; challenges:string; gratitude:string; tomorrow:string};
export type Session = {id:string; date:string; minutes:number; label:string};
export type Challenge = {id:string; prompt:string; response:string; date:string; completed:boolean};
export type LabData = {version:1; ideas:Idea[]; nodes:MindNode[]; resources:Resource[]; journal:JournalEntry[]; sessions:Session[]; challenges:Challenge[]};
export const EMPTY_LAB:LabData={version:1,ideas:[],nodes:[],resources:[],journal:[],sessions:[],challenges:[]};
export const uid=()=>`${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
export const localDay=(date=new Date())=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function readLab():LabData {try {const raw=localStorage.getItem(LAB_KEY);if(!raw)return {...EMPTY_LAB};const x:unknown=JSON.parse(raw);if(!x||typeof x!=="object")return {...EMPTY_LAB};const d=x as Partial<LabData>;return {version:1,ideas:Array.isArray(d.ideas)?d.ideas:[],nodes:Array.isArray(d.nodes)?d.nodes:[],resources:Array.isArray(d.resources)?d.resources:[],journal:Array.isArray(d.journal)?d.journal:[],sessions:Array.isArray(d.sessions)?d.sessions:[],challenges:Array.isArray(d.challenges)?d.challenges:[]}}catch{return {...EMPTY_LAB}}}
export function saveLab(data:LabData){localStorage.setItem(LAB_KEY,JSON.stringify(data));}
export const PROMPTS=["Imagine dix usages inattendus pour un objet courant.","Ecris une histoire en exactement six phrases.","Propose trois solutions originales a un probleme quotidien.","Dessine ou decris une invention pour economiser du temps.","Associe deux domaines sans rapport pour creer une idee.","Transforme une mauvaise habitude en mecanique de jeu.","Invente un nouveau defi pour ton futur toi.","Concois une application utile en cinq fonctionnalites.","Redige une scene ou un personnage surmonte sa peur.","Trouve cinq variantes pour ameliorer un projet existant."];
