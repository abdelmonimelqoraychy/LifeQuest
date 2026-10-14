'use strict';
// Extract the actual pure TS declarations via AST, without rewriting their bodies.
// No browser, storage, network or application action is made available to the VM.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const ts=require('../../frontend/node_modules/typescript');
const root=path.resolve(__dirname,'../..');
const files={
 validation:['isRecord','text','nonNegative','timestamp','calendarDate'],
 questSystem:['pad','localDate','periodId','isDue'],
 hunterCore:['CORE_ACTIVITY_PREFIX','QUEST_REWARDS','todayLocal','levelCost','validCoreSettings','getHunterProgress',
  'streakDays','completionDays','bonusForStreak','stabilityMultiplier','rewardMultiplier','attributeXP'],
 hunterMissions:['rankForLevel','bossProgress'],
 achievements:['ACHIEVEMENTS','dayKey','achievementProgress','unlockAchievements'],
};
const hashes={};let source='';
for(const [file,names] of Object.entries(files)){
 const text=fs.readFileSync(path.join(root,'frontend/src/lib',file+'.ts'),'utf8');
 hashes[file]=createHash('sha256').update(text).digest('hex');
 const ast=ts.createSourceFile(file+'.ts',text,ts.ScriptTarget.Latest,true);
 const found=new Set();
 for(const statement of ast.statements){
  const declared=ts.isFunctionDeclaration(statement)?[statement.name?.text]:ts.isVariableStatement(statement)
   ?statement.declarationList.declarations.map(d=>d.name.getText(ast)):[];
  if(declared.some(n=>names.includes(n))){
   if(declared.some(n=>!names.includes(n)))throw Error('MIXED_ORACLE_DECLARATION');
   source+=statement.getText(ast)+'\n';for(const n of declared)found.add(n);
  }
 }
 for(const name of names)if(!found.has(name))throw Error('MISSING_PURE_DECLARATION_'+name);
}
// This exact Math.round expression also occurs in the current quest action.
// Extract it rather than encode another implementation in the test oracle.
const actions=fs.readFileSync(path.join(root,'frontend/src/lib/questActions.ts'),'utf8');
hashes.questActions=createHash('sha256').update(actions).digest('hex');
const ast=ts.createSourceFile('questActions.ts',actions,ts.ScriptTarget.Latest,true);
const action=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='completeQuestAction');
let expression;
function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='xp')expression=node.initializer?.getText(ast);
 ts.forEachChild(node,visit);}
visit(action);
if(expression!=='Math.round(q.xp * rewardMultiplier(streakDays(completionDays(prev.completions)), getCoreSettings(prev.totalXP).stability))')
 throw Error('REVIEW_CHANGED_REWARD_FORMULA');
// The storage-dependent settings accessor is replaced with its *effective* stability,
// whose value is always 100 in getCoreSettings. Everything inside reward math is original.
source+='\nexport function oracleReward(base:number, completions:any[], nowDay:string){'+
 'const q={xp:base},prev={completions,totalXP:0};'+
 'const getCoreSettings=()=>({stability:100});'+
 'const streakDays=(dates:string[])=>__streakDays(dates,nowDay);return '+expression+';}\n'+
 'const __streakDays=streakDays;';
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleObject={exports:{}};
vm.runInNewContext('(function(module,exports){'+output+'})',
 {Date,Math,Set,Map,JSON,Number,String,Array,Object,Error,URL},{timeout:1000})(moduleObject,moduleObject.exports);
module.exports={...moduleObject.exports,hashes,extractedSource:source};
