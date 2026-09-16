-- Fix two firm_members security issues:
--
-- Bug 3: RLS insert policy had "or user_id = auth.uid()" which let ANY
-- authenticated user insert themselves into any firm they knew the UUID of.
-- The bootstrap case (first admin row) is handled by register_firm() which
-- is SECURITY DEFINER and bypasses RLS entirely — so the escape hatch is
-- not needed in the policy.
--
-- Bug 1: register_firm() only checked auth.uid() is not null, meaning
-- a candidate could call it and become an HR admin of a new firm. Added
-- a role check so only users with profiles.role = 'hr' can create firms.

-- Fix Bug 3: drop the old policy, replace without the self-insert escape hatch
drop policy if exists "Firm admins can insert members" on firm_members;

create policy "Firm admins can insert members" on firm_members
  for insert with check (
    exists (
      select 1 from firm_members fm
      where fm.firm_id = firm_members.firm_id
        and fm.user_id = auth.uid()
        and fm.is_admin = true
    )
  );

-- Fix Bug 1: add role check to register_firm()
create or replace function register_firm(p_name text) returns uuid
language plpgsql security definer
set search_path = public as $$
declare
  v_firm_id uuid;
  v_role    user_role;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'hr' then
    raise exception 'Only HR users can register a firm';
  end if;

  insert into firms (name) values (p_name) returning id into v_firm_id;
  -- SECURITY DEFINER bypasses the RLS policy above, so this insert
  -- succeeds even though there is no existing firm_members row yet.
  insert into firm_members (firm_id, user_id, is_admin)
  values (v_firm_id, auth.uid(), true);
  return v_firm_id;
end;
$$;
