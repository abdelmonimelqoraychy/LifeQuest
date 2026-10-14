-- AUTH-4D additive fix: avoid the table alias shadowed by mind_nodes.x.
grant create on schema public to lifequest_read_owner;
grant lifequest_read_owner to postgres with inherit false,set true;
set local role lifequest_read_owner;
create or replace function public.lifequest_hunter_snapshot(expected_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare actor uuid; h record; s record; p record; settings_row record; modules jsonb; counts jsonb;
        actual_system jsonb; actual_operations jsonb; actual_lab jsonb; actual_settings jsonb;
        result jsonb; xp_sum numeric; safe_total double precision; attributes jsonb; active_runs integer;
        quest_rows jsonb; arc_rows jsonb; completion_rows jsonb; achievement_rows jsonb;
        boss_rows jsonb; event_rows jsonb; idea_rows jsonb; node_rows jsonb; resource_rows jsonb;
        journal_rows jsonb; session_rows jsonb; challenge_rows jsonb; timer_row jsonb; revision_rows jsonb;
begin
 actor:=lifequest.current_actor();
 if actor is null then raise exception 'SESSION_EXPIRED' using errcode='42501';end if;
 if expected_actor is null or actor<>expected_actor then raise exception 'ACTOR_MISMATCH' using errcode='42501';end if;
 select * into h from lifequest.hunters where user_id=actor;
 if not found then raise exception 'ACCOUNT_MISSING' using errcode='PT409';end if;
 select * into s from lifequest.hunter_setup where user_id=actor;
 if not found then raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
 select * into settings_row from lifequest.hunter_settings where user_id=actor;
 if not found then raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;

 select jsonb_object_agg(module_code,jsonb_build_object('initialized',initialized,'schemaVersion',schema_version,
   'revision',revision::text,'counts',collection_counts,'historical',historical))
 into modules from lifequest.hunter_modules where user_id=actor;
 if modules is null or (select count(*) from lifequest.hunter_modules where user_id=actor)<>4
   or exists(select 1 from lifequest.hunter_modules where user_id=actor and (not initialized or schema_version<>1)) then
  raise exception 'MODULE_INVALID' using errcode='PT409';end if;
 select jsonb_build_object('quests',(select count(*) from lifequest.quests where user_id=actor),
   'arcs',(select count(*) from lifequest.story_arcs where user_id=actor),
   'completions',(select count(*) from lifequest.xp_events where user_id=actor),
   'achievements',(select count(*) from lifequest.achievement_unlocks where user_id=actor)) into actual_system;
 select jsonb_build_object('bosses',(select count(*) from lifequest.boss_missions where user_id=actor),
   'events',(select count(*) from lifequest.system_events where user_id=actor)) into actual_operations;
 select jsonb_build_object('ideas',(select count(*) from lifequest.ideas where user_id=actor),
   'nodes',(select count(*) from lifequest.mind_nodes where user_id=actor),
   'resources',(select count(*) from lifequest.resources where user_id=actor),
   'journal',(select count(*) from lifequest.journal_entries where user_id=actor),
   'sessions',(select count(*) from lifequest.focus_sessions where user_id=actor),
   'challenges',(select count(*) from lifequest.creativity_challenges where user_id=actor)) into actual_lab;
 if (modules->'system'->'counts') is distinct from actual_system
   or (modules->'operations'->'counts') is distinct from actual_operations
   or (modules->'lab'->'counts') is distinct from actual_lab
   or (modules->'settings'->'counts') is distinct from '{}'::jsonb then
  raise exception 'MODULE_INVALID' using errcode='PT409';end if;

 if s.configuration_status<>'ready' then
  return jsonb_build_object('schemaVersion',1,'actor',actor,'revision',h.revision::text,
    'state',case s.configuration_status when 'pending' then 'setup_pending' else s.configuration_status end,'reason',case s.configuration_status when 'pending' then 'SETUP_PENDING'
      when 'migration_pending' then 'MIGRATION_PENDING' else 'RECOVERY_REQUIRED' end);
 end if;
 if s.origin_choice is null or s.chosen_at is null then
  return jsonb_build_object('schemaVersion',1,'actor',actor,'revision',h.revision::text,'state','setup_pending','reason','ORIGIN_UNCONFIRMED');end if;
 if s.migration_id is not null then
  return jsonb_build_object('schemaVersion',1,'actor',actor,'revision',h.revision::text,'state','migration_pending','reason','MIGRATION_PENDING');end if;
 if h.timezone is null or h.timezone_confirmed_at is null then
  return jsonb_build_object('schemaVersion',1,'actor',actor,'revision',h.revision::text,'state','setup_pending','reason','TIMEZONE_UNCONFIRMED');end if;
 select * into p from lifequest.hunter_profiles where user_id=actor;
 if not found then raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
 if not p.onboarding_completed then
  return jsonb_build_object('schemaVersion',1,'actor',actor,'revision',h.revision::text,'state','onboarding_pending','reason','ONBOARDING_PENDING');end if;

 select coalesce(sum(awarded_xp),0) into xp_sum from lifequest.xp_events where user_id=actor;
 if h.total_xp<>h.opening_xp+h.legacy_roundoff_delta+xp_sum then raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
 safe_total:=lifequest.assert_snapshot_number(h.total_xp);
 perform lifequest.assert_snapshot_number(h.opening_xp);
 perform lifequest.assert_snapshot_number(h.legacy_roundoff_delta);
 if exists(select 1 from lifequest.xp_events where user_id=actor and lifequest.assert_snapshot_number(awarded_xp) is null) then
  raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
 perform lifequest.assert_snapshot_number(settings_row.baseline_xp);
 perform lifequest.assert_snapshot_number(settings_row.historical_stability);
 if exists(select 1 from lifequest.quests where user_id=actor and lifequest.assert_snapshot_number(base_xp) is null)
  or exists(select 1 from lifequest.boss_missions where user_id=actor and lifequest.assert_snapshot_number(base_xp) is null)
  or exists(select 1 from lifequest.focus_sessions where user_id=actor and lifequest.assert_snapshot_number(minutes) is null) then
  raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
 select coalesce(jsonb_agg(jsonb_build_object('attribute',attribute,'xpAwarded',trim_scale(awarded_xp)::text)
   order by sort_position,id collate "C"),'[]'::jsonb) into result from lifequest.xp_events where user_id=actor;
 attributes:=lifequest.rules_attributes(result);
 if exists(select 1 from jsonb_each_text(attributes) a where a.value in ('Infinity','-Infinity','NaN')) then
  raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;

 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(q),'{"base_xp":"xp"}') order by q.sort_position,q.id collate "C"),'[]'::jsonb) into quest_rows from lifequest.quests q where q.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(a)) order by a.sort_position,a.id collate "C"),'[]'::jsonb) into arc_rows from lifequest.story_arcs a where a.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(e),'{"source_id":"questId","period_key":"period","occurred_at":"completedAt","awarded_xp":"xpAwarded","title_snapshot":"questTitle","arc_id_snapshot":"arcId"}') order by e.sort_position,e.id collate "C"),'[]'::jsonb) into completion_rows from lifequest.xp_events e where e.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(a),'{"achievement_id":"id","unlocked_at":"unlockedAt"}') order by a.sort_position,a.achievement_id collate "C"),'[]'::jsonb) into achievement_rows from lifequest.achievement_unlocks a where a.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(b),'{"base_xp":"xp"}')||jsonb_build_object('subObjectives',coalesce((select jsonb_agg(lifequest.snapshot_row(to_jsonb(o)) order by o.sort_position,o.id collate "C") from lifequest.boss_subobjectives o where o.user_id=b.user_id and o.boss_id=b.id),'[]'::jsonb)) order by b.sort_position,b.id collate "C"),'[]'::jsonb) into boss_rows from lifequest.boss_missions b where b.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(e),'{"occurred_at":"at"}') order by e.sort_position,e.id collate "C"),'[]'::jsonb) into event_rows from lifequest.system_events e where e.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(x)) order by x.sort_position,x.id collate "C"),'[]'::jsonb) into idea_rows from lifequest.ideas x where x.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(nrow)) order by nrow.sort_position,nrow.id collate "C"),'[]'::jsonb) into node_rows from lifequest.mind_nodes nrow where nrow.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(x)) order by x.sort_position,x.id collate "C"),'[]'::jsonb) into resource_rows from lifequest.resources x where x.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(x),'{"local_date":"date"}') order by x.local_date desc,x.id collate "C"),'[]'::jsonb) into journal_rows from lifequest.journal_entries x where x.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(x),'{"occurred_at":"date"}') order by x.sort_position,x.id collate "C"),'[]'::jsonb) into session_rows from lifequest.focus_sessions x where x.user_id=actor;
 select coalesce(jsonb_agg(lifequest.snapshot_row(to_jsonb(x),'{"occurred_at":"date"}') order by x.sort_position,x.id collate "C"),'[]'::jsonb) into challenge_rows from lifequest.creativity_challenges x where x.user_id=actor;
 select count(*) into active_runs from lifequest.focus_runs where user_id=actor and status in ('idle','running','paused');
 if active_runs>1 then raise exception 'SNAPSHOT_INCONSISTENT' using errcode='PT409';end if;
 select lifequest.snapshot_row(to_jsonb(r)) into timer_row from lifequest.focus_runs r where r.user_id=actor and r.status in ('idle','running','paused') order by r.sort_position desc,r.id collate "C" desc limit 1;
 select jsonb_build_object(
  'hunter',jsonb_build_object('revision',h.revision::text),
  'setup',jsonb_build_object('revision',s.revision::text),
  'profile',jsonb_build_object('revision',p.revision::text),
  'settings',jsonb_build_object('revision',settings_row.revision::text),
  'modules',(select coalesce(jsonb_object_agg(module_code,revision::text),'{}'::jsonb) from lifequest.hunter_modules where user_id=actor),
  'quests',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.quests where user_id=actor),
  'arcs',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.story_arcs where user_id=actor),
  'completions',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.xp_events where user_id=actor),
  'achievements',(select coalesce(jsonb_object_agg(achievement_id,revision::text),'{}'::jsonb) from lifequest.achievement_unlocks where user_id=actor),
  'bosses',(select coalesce(jsonb_object_agg(b.id,jsonb_build_object('revision',b.revision::text,'subObjectives',(select coalesce(jsonb_object_agg(o.id,o.revision::text),'{}'::jsonb) from lifequest.boss_subobjectives o where o.user_id=actor and o.boss_id=b.id))),'{}'::jsonb) from lifequest.boss_missions b where b.user_id=actor),
  'events',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.system_events where user_id=actor),
  'ideas',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.ideas where user_id=actor),
  'nodes',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.mind_nodes where user_id=actor),
  'resources',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.resources where user_id=actor),
  'journal',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.journal_entries where user_id=actor),
  'sessions',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.focus_sessions where user_id=actor),
  'challenges',(select coalesce(jsonb_object_agg(id,revision::text),'{}'::jsonb) from lifequest.creativity_challenges where user_id=actor)) into revision_rows;
 result:=jsonb_build_object('schemaVersion',1,'actor',actor,'revision',h.revision::text,'rulesVersion',h.rules_version,'state','ready',
  'serverTime',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'timezone',h.timezone,
  'data',jsonb_build_object(
   'profile',lifequest.snapshot_row(to_jsonb(p),'{"original_created_at":"createdAt"}'),
   'system',jsonb_build_object('totalXP',trim_scale(h.total_xp)::text,'quests',quest_rows,'arcs',arc_rows,'completions',completion_rows,'achievements',achievement_rows),
   'extra',jsonb_build_object('bosses',boss_rows,'events',event_rows),
   'lab',jsonb_build_object('ideas',idea_rows,'nodes',node_rows,'resources',resource_rows,'journal',journal_rows,'sessions',session_rows,'challenges',challenge_rows),
   'settings',jsonb_build_object('version',settings_row.version,'baselineXP',trim_scale(settings_row.baseline_xp)::text,'baselineLevel',settings_row.baseline_level,'stability',100,
    'historicalStability',trim_scale(settings_row.historical_stability)::text,'lastPenaltyDay',settings_row.last_penalty_day,'penaltyDays',settings_row.penalty_days,
    'initializedAt',settings_row.initialized_at,'revision',settings_row.revision::text,'historical',settings_row.historical),
   'timer',timer_row),
  'entityRevisions',revision_rows,
  'exactXP',jsonb_build_object('total',trim_scale(h.total_xp)::text,'opening',trim_scale(h.opening_xp)::text,'roundoff',trim_scale(h.legacy_roundoff_delta)::text),
  'derived',jsonb_build_object('progress',lifequest.rules_progress(safe_total),'rank',lifequest.rules_rank((lifequest.rules_progress(safe_total)->>'level')::integer),'attributeXP',attributes,
    'achievements',(select coalesce(jsonb_agg(achievement_id order by sort_position,achievement_id),'[]'::jsonb) from lifequest.achievement_unlocks where user_id=actor)),
  'presentation',jsonb_build_object('state','auth5_pending'));
 if octet_length(result::text)>5242880 then raise exception 'SNAPSHOT_TOO_LARGE' using errcode='PT409';end if;
 return result;
end; $$;
reset role;
grant lifequest_read_owner to postgres with inherit false,set false;
revoke create on schema public from lifequest_read_owner;
