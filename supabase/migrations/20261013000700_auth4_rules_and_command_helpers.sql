-- AUTH-4C, priority 1 only: pure private calculations, no mutation RPC published.
-- Fractional balance addition requires an explicit decision before reward commands.
grant lifequest_schema_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;

create function lifequest.rules_reward(base numeric, days integer) returns integer
language plpgsql immutable strict security invoker set search_path = '' as $$
declare value double precision; whole double precision; multiplier double precision;
begin
 if not(base>=0 and base<=1000) or days<0 then raise exception 'REWARD_INPUT_INVALID' using errcode='22003'; end if;
 multiplier:=case when days>=30 then 1.25::double precision when days>=7 then 1.1::double precision else 1::double precision end;
 -- JS number multiplication, then nonnegative Math.round (not numeric round,
 -- float8 round-to-even, or floor(x+0.5), which rounds the addition itself).
 value:=base::double precision*multiplier;whole:=floor(value);
 return (whole+case when value-whole>=0.5::double precision then 1 else 0 end)::integer;
end; $$;

create function lifequest.rules_progress(total double precision) returns jsonb
language plpgsql immutable strict security invoker set search_path = '' as $$
declare lvl integer:=1; earned double precision:=total; cost integer;
begin
 if not(total>=0 and total<'Infinity'::double precision) then raise exception 'PROGRESS_INPUT_INVALID' using errcode='22003'; end if;
 while lvl<100 loop
  cost:=200+25*(lvl-1);exit when earned<cost;earned:=earned-cost;lvl:=lvl+1;
 end loop;
 if lvl=100 then return jsonb_build_object('level',100,'current',0,'required',0,'percent',100); end if;
 cost:=200+25*(lvl-1);
 return jsonb_build_object('level',lvl,'current',earned,'required',cost,'percent',least(99,floor(earned/cost*100)::integer));
end; $$;

create function lifequest.rules_rank(lvl integer) returns text
language sql immutable strict security invoker set search_path = '' as $$
 select case when lvl>=50 then 'S' when lvl>=40 then 'A' when lvl>=30 then 'B' when lvl>=20 then 'C' when lvl>=10 then 'D' else 'E' end;
$$;

create function lifequest.rules_period(frequency text, instant timestamptz, zone text) returns text
language plpgsql stable strict security invoker set search_path = '' as $$
declare day date;
begin
 day:=(instant at time zone zone)::date;
 case frequency
 when 'once' then return 'once';
 when 'daily' then return to_char(day,'YYYY-MM-DD');
 when 'monthly' then return to_char(day,'YYYY-MM');
 when 'weekly' then return 'week:'||to_char(day-(extract(isodow from day)::integer-1),'YYYY-MM-DD');
 else raise exception 'FREQUENCY_INVALID' using errcode='22023';end case;
end; $$;

create function lifequest.rules_streak(days date[], today date) returns integer
language plpgsql immutable strict security invoker set search_path = '' as $$
declare last_day date:=today; n integer:=0;
begin
 if not coalesce(today=any(days),false) then last_day:=last_day-1; end if;
 while coalesce(last_day=any(days),false) and n<10000 loop n:=n+1;last_day:=last_day-1;end loop;
 return n;
end; $$;

create function lifequest.rules_completion_days(items jsonb, zone text) returns date[]
language sql stable strict security invoker set search_path = '' as $$
 select coalesce(array_agg((item->>'completedAt')::timestamptz at time zone zone)::date[],array[]::date[])
 from jsonb_array_elements(items) item where left(item->>'questId',18)<>'lifequest:activity:';
$$;

create function lifequest.rules_attributes(items jsonb) returns jsonb
language plpgsql immutable strict security invoker set search_path = '' as $$
declare item jsonb; attr text; value double precision; result jsonb:='{"focus":0,"discipline":0,"knowledge":0,"energy":0,"consistency":0}';
begin
 -- Preserve input order and sequential number additions for comparison only.
 -- Does not convert, write or reconcile the stored numeric ledger.
 for item in select * from jsonb_array_elements(items) loop
  attr:=item->>'attribute';value:=(item->>'xpAwarded')::double precision;
  if result?attr and value>'-Infinity'::double precision and value<'Infinity'::double precision then
   result:=jsonb_set(result,array[attr],to_jsonb((result->>attr)::double precision+greatest(0,value)));
  end if;
 end loop;return result;
end; $$;

create function lifequest.rules_achievements(items jsonb, lvl integer, zone text) returns text[]
language plpgsql stable strict security invoker set search_path = '' as $$
declare quests integer; discipline integer; day date; preceding date; run integer:=0; best integer:=0; result text[]:='{}';
begin
 select count(*),count(*) filter(where item->>'attribute'='discipline') into quests,discipline
 from jsonb_array_elements(items) item where left(item->>'questId',18)<>'lifequest:activity:';
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

revoke all on function lifequest.rules_reward(numeric,integer),lifequest.rules_progress(double precision),
 lifequest.rules_rank(integer),lifequest.rules_period(text,timestamptz,text),lifequest.rules_streak(date[],date),
 lifequest.rules_completion_days(jsonb,text),lifequest.rules_attributes(jsonb),lifequest.rules_achievements(jsonb,integer,text)
 from public,anon,authenticated;
grant execute on function lifequest.rules_reward(numeric,integer),lifequest.rules_progress(double precision),
 lifequest.rules_rank(integer),lifequest.rules_period(text,timestamptz,text),lifequest.rules_streak(date[],date),
 lifequest.rules_completion_days(jsonb,text),lifequest.rules_attributes(jsonb),lifequest.rules_achievements(jsonb,integer,text)
 to lifequest_command_owner;
reset role;
grant lifequest_schema_owner to postgres with inherit false,set false;
