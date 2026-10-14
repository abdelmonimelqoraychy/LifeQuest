-- Additive correction: use the full known activity prefix, never a counted length.
grant lifequest_schema_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
create or replace function lifequest.rules_completion_days(items jsonb, zone text) returns date[]
language sql stable strict security invoker set search_path = '' as $$
 select coalesce(array_agg((item->>'completedAt')::timestamptz at time zone zone)::date[],array[]::date[])
 from jsonb_array_elements(items) item where not starts_with(item->>'questId','lifequest:activity:');
$$;
create or replace function lifequest.rules_achievements(items jsonb, lvl integer, zone text) returns text[]
language plpgsql stable strict security invoker set search_path = '' as $$
declare quests integer; discipline integer; day date; preceding date; run integer:=0; best integer:=0; result text[]:='{}';
begin
 select count(*),count(*) filter(where item->>'attribute'='discipline') into quests,discipline
 from jsonb_array_elements(items) item where not starts_with(item->>'questId','lifequest:activity:');
 for day in select distinct unnest(lifequest.rules_completion_days(items,zone)) order by 1 loop
  run:=case when day-1=preceding then run+1 else 1 end;best:=greatest(best,run);preceding:=day;
 end loop;
 if quests>=1 then result:=result||array['first-clear'];end if;
 if quests>=100 then result:=result||array['quest-veteran'];end if;
 if discipline>=30 then result:=result||array['discipline-master'];end if;
 if lvl>=10 then result:=result||array['rank-d-hunter'];end if;
 if lvl>=50 then result:=result||array['rank-s-hunter'];end if;
 if best>=7 then result:=result||array['seven-day-streak'];end if;
 return result;
end; $$;
revoke all on function lifequest.rules_completion_days(jsonb,text),lifequest.rules_achievements(jsonb,integer,text) from public,anon,authenticated;
grant execute on function lifequest.rules_completion_days(jsonb,text),lifequest.rules_achievements(jsonb,integer,text) to lifequest_command_owner;
reset role;
grant lifequest_schema_owner to postgres with inherit false,set false;
