-- Additive correction after exercising migration 7; never rewrite an applied file.
-- Supabase's session extra_float_digits=0 truncates JSON float output. Pin the
-- precision inside the pure functions only; restore the caller's setting on return.
grant lifequest_schema_owner to postgres with inherit false,set true;
set local role lifequest_schema_owner;
alter function lifequest.rules_progress(double precision) set extra_float_digits = 3;
alter function lifequest.rules_attributes(jsonb) set extra_float_digits = 3;
reset role;
grant lifequest_schema_owner to postgres with inherit false,set false;
