'use strict';
// Hash only fictional Hunter fixtures across all twenty private tables.
// Never serializes Auth rows, passwords, sessions or tokens.
const {createHash}=require('node:crypto');
async function stateHash(admin,ids){
 const tables=(await admin.query("select tablename from pg_tables where schemaname='lifequest' order by tablename")).rows;
 const state={};
 for(const {tablename} of tables){
  if(!/^[a-z_]+$/.test(tablename))throw Error('INVALID_TABLE_IDENTIFIER');
  state[tablename]=(await admin.query('select to_jsonb(t) row from lifequest.'+tablename+' t where user_id=any($1::uuid[]) order by to_jsonb(t)::text',[ids])).rows.map(r=>r.row);
 }
 return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}
module.exports={stateHash};
