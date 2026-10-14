'use strict';
// Produce an additive migration from the installed reader function body. This
// avoids editing any already-applied migration and changes only one SQL alias.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'supabase/migrations/20261013001100_auth4_snapshot_readers.sql'),'utf8');
const start=source.indexOf('create function public.lifequest_hunter_snapshot(expected_actor uuid) returns jsonb');
if(start<0)throw Error('READER_FUNCTION_NOT_FOUND');
const marker='end; $$;';const end=source.indexOf(marker,start)+marker.length;
if(end<marker.length)throw Error('READER_FUNCTION_END_NOT_FOUND');
let body=source.slice(start,end).replace('create function public.lifequest_hunter_snapshot','create or replace function public.lifequest_hunter_snapshot');
const broken='jsonb_agg(lifequest.snapshot_row(to_jsonb(x)) order by x.sort_position,x.id collate "C"),\'[]\'::jsonb) into node_rows from lifequest.mind_nodes x where x.user_id=actor';
const fixed='jsonb_agg(lifequest.snapshot_row(to_jsonb(nrow)) order by nrow.sort_position,nrow.id collate "C"),\'[]\'::jsonb) into node_rows from lifequest.mind_nodes nrow where nrow.user_id=actor';
if(!body.includes(broken))throw Error('MIND_NODE_ALIAS_NOT_FOUND');body=body.replace(broken,fixed);
const migration=`-- AUTH-4D additive fix: avoid the table alias shadowed by mind_nodes.x.\ngrant create on schema public to lifequest_read_owner;\ngrant lifequest_read_owner to postgres with inherit false,set true;\nset local role lifequest_read_owner;\n${body}\nreset role;\ngrant lifequest_read_owner to postgres with inherit false,set false;\nrevoke create on schema public from lifequest_read_owner;\n`;
const target=path.join(root,'supabase/migrations/20261013001300_auth4_snapshot_mind_node_alias.sql');
if(fs.existsSync(target))throw Error('FIX_MIGRATION_ALREADY_EXISTS');fs.writeFileSync(target,migration);
console.log('PASS generated additive reader correction; applied migrations unchanged');
