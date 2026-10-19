-- Mind Map -> Boss: retain source identity and validate the exact branch in the
-- same transaction that creates the Boss. Existing Bosses remain unlinked.
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set true;

set local role lifequest_schema_owner;
alter table lifequest.boss_missions add column source_mind_node_id lifequest.business_id;
alter table lifequest.boss_missions add constraint boss_missions_source_mind_node_fk
 foreign key(user_id,source_mind_node_id) references lifequest.mind_nodes(user_id,id) on delete restrict;
create unique index boss_missions_one_per_source_node
 on lifequest.boss_missions(user_id,source_mind_node_id) where source_mind_node_id is not null;

create function lifequest.validate_mind_map_boss_source(expected_actor uuid,source jsonb,goal_count integer)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare parent_id text; parent_revision bigint; parent_row record; child jsonb; child_id text; child_revision bigint;
        seen_ids text[]:='{}'; expected_children jsonb:='[]'::jsonb; actual_children jsonb; child_count integer:=0;
begin
 if source is null then return null; end if;
 if jsonb_typeof(source) is distinct from 'object' then raise exception 'VALIDATION_FAILED' using errcode='PT400'; end if;
 perform lifequest.payload_shape(source,array['parentId','parentRevision','children']);
 parent_id:=lifequest.input_text(source,'parentId',512,true);
 parent_revision:=lifequest.target_revision(jsonb_build_object('expectedRevision',source->'parentRevision'));
 if jsonb_typeof(source->'children') is distinct from 'array'
   or jsonb_array_length(source->'children') not between 1 and 20
   or jsonb_array_length(source->'children')<>goal_count then
  raise exception 'VALIDATION_FAILED' using errcode='PT400';
 end if;

 if lifequest.current_actor() is distinct from expected_actor then raise exception 'ACTOR_MISMATCH' using errcode='PT403'; end if;
 if exists(select 1 from lifequest.boss_missions b where b.user_id=expected_actor and b.source_mind_node_id=parent_id) then
  raise exception 'SOURCE_ALREADY_CONVERTED' using errcode='PT409';
 end if;
 select * into parent_row from lifequest.mind_nodes n where n.user_id=expected_actor and n.id=parent_id for update;
 if not found or parent_row.revision<>parent_revision then raise exception 'REVISION_CONFLICT' using errcode='PT409'; end if;

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

 -- All application writes for an actor hold the Hunter lock; these row locks
 -- also protect the validated source rows until the command transaction commits.
 perform n.id from lifequest.mind_nodes n
  where n.user_id=expected_actor and n.parent_id=parent_id
  order by n.sort_position,n.id collate "C" for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'revision',n.revision::text)
   order by n.sort_position,n.id collate "C"),'[]'::jsonb)
  into actual_children from lifequest.mind_nodes n where n.user_id=expected_actor and n.parent_id=parent_id;
 if actual_children is distinct from expected_children then raise exception 'REVISION_CONFLICT' using errcode='PT409'; end if;
 return parent_id;
end; $$;
revoke all on function lifequest.validate_mind_map_boss_source(uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function lifequest.validate_mind_map_boss_source(uuid,jsonb,integer) to lifequest_command_owner;
reset role;

-- The command owner receives only column-level INSERT for the new source link.
grant insert(source_mind_node_id) on lifequest.boss_missions to lifequest_command_owner;
grant create on schema public to lifequest_command_owner;
set local role lifequest_command_owner;
do $$
declare definition text; old_fragment text; new_fragment text; occurrences integer;
begin
 select pg_get_functiondef('public.lifequest_operations_command(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 if definition is null then raise exception 'OPERATIONS_COMMAND_MISSING'; end if;

 old_fragment:=$old$when 'boss.create' then perform lifequest.payload_shape(payload,array['title','subObjectives']);$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'OPERATIONS_BOSS_SHAPE_DRIFT'; end if;
 new_fragment:=$new$when 'boss.create' then perform lifequest.payload_shape(payload,array['title','subObjectives'],array['mindMapSource']);$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$mode text; label text; title text; goals jsonb; goal jsonb; weight integer; total integer:=0; position integer:=0;$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'OPERATIONS_BOSS_VARIABLE_DRIFT'; end if;
 new_fragment:=$new$mode text; label text; title text; goals jsonb; goal jsonb; weight integer; total integer:=0; position integer:=0; source_node_id text;$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$if kind='boss.create' then
  ident:=gen_random_uuid()::text;$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'OPERATIONS_BOSS_INSERT_DRIFT'; end if;
 new_fragment:=$new$if kind='boss.create' then
  source_node_id:=lifequest.validate_mind_map_boss_source(actor,payload->'mindMapSource',jsonb_array_length(goals));
  ident:=gen_random_uuid()::text;$new$;
 definition:=replace(definition,old_fragment,new_fragment);

 old_fragment:=$old$insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,sort_position)
  values(actor,ident,title,lifequest.js_trim(goals->0->>'title'),'weighted',total,0,least(300,greatest(25,total*10)),instant,lifequest.next_position(actor,'boss_missions'));$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'OPERATIONS_BOSS_SOURCE_COLUMN_DRIFT'; end if;
 new_fragment:=$new$insert into lifequest.boss_missions(user_id,id,title,objective,mode,target,current,base_xp,created_at,source_mind_node_id,sort_position)
  values(actor,ident,title,lifequest.js_trim(goals->0->>'title'),'weighted',total,0,least(300,greatest(25,total*10)),instant,source_node_id,lifequest.next_position(actor,'boss_missions'));$new$;
 definition:=replace(definition,old_fragment,new_fragment);
 execute definition;
end $$;
reset role;
revoke create on schema public from lifequest_command_owner;

-- Keep the source association durable and give a clear response if its node is
-- later removed through the existing Lab command.
grant create on schema public to lifequest_command_owner;
set local role lifequest_command_owner;
do $$
declare definition text; old_fragment text; new_fragment text; occurrences integer;
begin
 select pg_get_functiondef('public.lifequest_lab_command(uuid,uuid,text,jsonb)'::regprocedure) into definition;
 if definition is null then raise exception 'LAB_COMMAND_MISSING'; end if;
 old_fragment:=$old$perform lifequest.assert_revision(row_data.revision,payload);
  for child in select id from lifequest.mind_nodes where user_id=actor and parent_id=ident order by id for update loop$old$;
 occurrences:=(length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment);
 if occurrences<>1 then raise exception 'LAB_NODE_DELETE_SHAPE_DRIFT'; end if;
 new_fragment:=$new$perform lifequest.assert_revision(row_data.revision,payload);
  if exists(select 1 from lifequest.boss_missions b where b.user_id=actor and b.source_mind_node_id=ident) then
   raise exception 'MIND_MAP_SOURCE_IN_USE' using errcode='PT409';
  end if;
  for child in select id from lifequest.mind_nodes where user_id=actor and parent_id=ident order by id for update loop$new$;
 definition:=replace(definition,old_fragment,new_fragment);
 execute definition;
end $$;
reset role;
revoke create on schema public from lifequest_command_owner;
grant lifequest_schema_owner,lifequest_command_owner to postgres with inherit false,set false;
