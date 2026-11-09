-- Honey Packers: this database holds one business only (9 Nov 2026).
-- The admin at honeypackers.in/admin is staff-only: after the owner creates the business, anyone else who signs in
-- (website buyers sign in too) must be invited by the owner. So a second business can never be created here.
create or replace function public.create_organization(p_name text, p_display_name text default '')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  -- one business per database; serialise two first-time set-ups racing each other
  lock table organizations in share row exclusive mode;
  if exists (select 1 from organizations) then
    raise exception 'This database already has its business. Ask the owner to invite you.';
  end if;
  if exists (select 1 from user_profiles where id = v_uid) then
    raise exception 'this account already belongs to an organisation';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'organisation name is required'; end if;

  insert into organizations (name) values (trim(p_name)) returning id into v_org;
  insert into user_profiles (id, organization_id, display_name, email, phone, role, phone_verified)
    select v_uid, v_org, coalesce(nullif(trim(p_display_name), ''), u.email, u.phone, ''), u.email, u.phone,
           'Administrator', true
    from auth.users u where u.id = v_uid;
  insert into org_settings (org_id, business_name) values (v_org, trim(p_name));
  insert into price_rules (org_id) values (v_org);
  return v_org;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated, service_role;
