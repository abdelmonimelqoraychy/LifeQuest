-- Resolve the PL/pgSQL name collision between the JSON argument `value` and
-- jsonb_each's output column, without changing the installed reader contract.
grant lifequest_schema_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
create or replace function lifequest.snapshot_row(value jsonb, aliases jsonb default '{}') returns jsonb
language plpgsql immutable strict set search_path='' as $$
declare item record; source_key text; target_key text; output jsonb:='{}'::jsonb; v jsonb; i integer; upper_next boolean; ch text;
begin
 for item in select e.key,e.value from jsonb_each($1) as e(key,value) loop
  source_key:=item.key;
  if source_key='user_id' then continue; end if;
  target_key:='';upper_next:=false;
  for i in 1..length(source_key) loop
   ch:=substr(source_key,i,1);
   if ch='_' then upper_next:=true;
   else target_key:=target_key||case when upper_next then upper(ch) else ch end;upper_next:=false;end if;
  end loop;
  target_key:=coalesce(aliases->>source_key,target_key);
  v:=item.value;
  if source_key in ('revision','sort_position','accumulated_active_ms') and jsonb_typeof(v)='number' then
   v:=to_jsonb(v::text::numeric::text);
  elsif source_key in ('base_xp','awarded_xp','minutes','baseline_xp','historical_stability') and jsonb_typeof(v)='number' then
   v:=to_jsonb(trim_scale(v::text::numeric)::text);
  end if;
  output:=output||jsonb_build_object(target_key,v);
 end loop;
 return output;
end; $$;
revoke all on function lifequest.snapshot_row(jsonb,jsonb) from public,anon,authenticated;
reset role;
grant lifequest_schema_owner to postgres with inherit false,set false;
