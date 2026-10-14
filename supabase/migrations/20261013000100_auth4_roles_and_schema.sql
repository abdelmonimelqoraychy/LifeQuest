-- AUTH-4B only: no RPC gameplay, reward calculation or reader.
create role lifequest_schema_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role lifequest_command_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role lifequest_read_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
create role lifequest_provision_owner nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
-- Temporary, explicitly removed in migration 6. No runtime role inherits another role.
grant lifequest_schema_owner, lifequest_command_owner, lifequest_read_owner, lifequest_provision_owner
  to postgres with inherit false, set true;
create schema lifequest authorization lifequest_schema_owner;
set local role lifequest_schema_owner;
revoke all on schema lifequest from public, anon, authenticated;
grant usage on schema lifequest to lifequest_command_owner, lifequest_read_owner, lifequest_provision_owner;
grant usage, create on schema lifequest to postgres;
alter default privileges in schema lifequest revoke all on tables from public, anon, authenticated;
-- A per-schema REVOKE cannot remove PostgreSQL's global PUBLIC default.
alter default privileges revoke execute on functions from public;
alter default privileges in schema lifequest revoke all on sequences from public, anon, authenticated;
create domain lifequest.finite_numeric as numeric
  check (value > '-Infinity'::numeric and value < 'Infinity'::numeric);
create domain lifequest.business_id as text check (length(value) > 0);
create domain lifequest.attribute_code as text
  check (value in ('focus','discipline','knowledge','energy','consistency'));
create domain lifequest.historical_metadata as jsonb check (jsonb_typeof(value) = 'object');
create function lifequest.module_counts_allowed(module text, counts jsonb) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare expected text[]; actual text[]; item jsonb;
begin
 expected:=case module when 'system' then array['achievements','arcs','completions','quests']
 when 'operations' then array['bosses','events']
 when 'lab' then array['challenges','ideas','journal','nodes','resources','sessions']
 when 'settings' then array[]::text[] else null end;
 if expected is null or jsonb_typeof(counts)<>'object' then return false; end if;
 select coalesce(array_agg(k order by k),array[]::text[]) into actual from jsonb_object_keys(counts) k;
 if actual<>expected then return false; end if;
 for item in select value from jsonb_each(counts) loop
  if jsonb_typeof(item)<>'number' or item::text::numeric<0 or item::text::numeric<>trunc(item::text::numeric)
   or item::text::numeric>9223372036854775807 then return false; end if;
 end loop;
 return true;
end; $$;
create function lifequest.days_allowed(days date[]) returns boolean
language sql immutable strict set search_path = '' as $$
 select not exists(select 1 from unnest(days) d where d is null or not isfinite(d));
$$;
create function lifequest.resource_url_allowed(value text) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare authority text; host text; port_text text;
begin
  if value = '' then return true; end if;
  if value !~* '^https?://' or value ~ '[[:space:][:cntrl:]\\]' then return false; end if;
  authority := substring(value from '(?i)^https?://([^/?#]+)');
  if authority is null or authority like '%@%' then return false; end if;
  if authority like '[%' then
    host := substring(authority from '^\[([^]]+)\]');
    if host is null or family(host::inet) <> 6 then return false; end if;
    if authority !~ '^\[[^]]+\](:[0-9]+)?$' then return false; end if;
    port_text := substring(authority from '\]:([0-9]+)$');
  else
    if authority !~ '^[^:%\[\]]+(:[0-9]+)?$' then return false; end if;
    host := split_part(authority, ':', 1);
    if host ~ '[<>"{}|^`]' then return false; end if;
    port_text := substring(authority from ':([0-9]+)$');
  end if;
  return port_text is null or port_text::numeric between 0 and 65535;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;
revoke execute on function lifequest.module_counts_allowed(text,jsonb),lifequest.days_allowed(date[]),lifequest.resource_url_allowed(text) from public,anon,authenticated;
reset role;
