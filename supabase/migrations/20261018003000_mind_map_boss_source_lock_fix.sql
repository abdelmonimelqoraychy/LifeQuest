-- Fix PL/pgSQL name resolution in the source-branch validator from migration 029.
-- This is additive and changes no table, data, grants, or existing Boss rows.
grant lifequest_schema_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
create or replace function lifequest.validate_mind_map_boss_source(expected_actor uuid,source jsonb,goal_count integer)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare v_parent_id text; v_parent_revision bigint; parent_row record; child jsonb; child_id text; child_revision bigint;
        seen_ids text[]:='{}'; expected_children jsonb:='[]'::jsonb; actual_children jsonb; child_count integer:=0;
begin
 if source is null then return null; end if;
 if jsonb_typeof(source) is distinct from 'object' then raise exception 'VALIDATION_FAILED' using errcode='PT400'; end if;
 perform lifequest.payload_shape(source,array['parentId','parentRevision','children']);
 v_parent_id:=lifequest.input_text(source,'parentId',512,true);
 v_parent_revision:=lifequest.target_revision(jsonb_build_object('expectedRevision',source->'parentRevision'));
 if jsonb_typeof(source->'children') is distinct from 'array'
   or jsonb_array_length(source->'children') not between 1 and 20
   or jsonb_array_length(source->'children')<>goal_count then
  raise exception 'VALIDATION_FAILED' using errcode='PT400';
 end if;

 if lifequest.current_actor() is distinct from expected_actor then raise exception 'ACTOR_MISMATCH' using errcode='PT403'; end if;
 if exists(select 1 from lifequest.boss_missions b where b.user_id=expected_actor and b.source_mind_node_id=v_parent_id) then
  raise exception 'SOURCE_ALREADY_CONVERTED' using errcode='PT409';
 end if;
 select * into parent_row from lifequest.mind_nodes n where n.user_id=expected_actor and n.id=v_parent_id for update;
 if not found or parent_row.revision<>v_parent_revision then raise exception 'REVISION_CONFLICT' using errcode='PT409'; end if;

 for child in select value from jsonb_array_elements(source->'children') loop
  perform lifequest.payload_shape(child,array['id','revision']);
  child_id:=lifequest.input_text(child,'id',512,true);
  child_revision:=lifequest.target_revision(jsonb_build_object('expectedRevision',child->'revision'));
  if child_id=any(seen_ids) then raise exception 'VALIDATION_FAILED' using errcode='PT400'; end if;
  seen_ids:=array_append(seen_ids,child_id);
  expected_children:=expected_children||jsonb_build_array(jsonb_build_object('id',child_id,'revision',child_revision::text));
  child_count:=child_count+1;
 end loop;
 if child_count<1 or child_count>20 then raise exception 'VALIDATION_FAILED' using errcode='PT400'; end if;

 -- Every actor command holds the Hunter lock; these row locks keep the checked rows stable to commit.
 perform n.id from lifequest.mind_nodes n
  where n.user_id=expected_actor and n.parent_id=v_parent_id
  order by n.sort_position,n.id collate "C" for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'revision',n.revision::text)
   order by n.sort_position,n.id collate "C"),'[]'::jsonb)
  into actual_children from lifequest.mind_nodes n where n.user_id=expected_actor and n.parent_id=v_parent_id;
 if actual_children is distinct from expected_children then raise exception 'REVISION_CONFLICT' using errcode='PT409'; end if;
 return v_parent_id;
end; $$;
reset role;
grant lifequest_schema_owner to postgres with inherit false,set false;
