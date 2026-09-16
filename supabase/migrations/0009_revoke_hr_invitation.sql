-- Add audit columns for revocation tracking
alter table hr_invitations
  add column revoked_at timestamptz,
  add column revoked_by uuid references profiles(id);

-- RPC: revoke a pending HR invitation (admin only)
-- Uses SECURITY DEFINER so it bypasses RLS but enforces admin check internally.
create or replace function revoke_hr_invitation(p_invitation_id uuid) returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_inv hr_invitations%rowtype;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_inv from hr_invitations where id = p_invitation_id for update;
  if not found then raise exception 'Invitation not found'; end if;

  if not exists (
    select 1 from firm_members
    where firm_id = v_inv.firm_id and user_id = auth.uid() and is_admin = true
  ) then
    raise exception 'Only firm admins can revoke invitations';
  end if;

  if v_inv.status != 'pending' then
    raise exception 'Only pending invitations can be revoked (current status: %)', v_inv.status;
  end if;

  update hr_invitations
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  where id = p_invitation_id;
end;
$$;

-- Patch accept_hr_invitation to reject revoked invitations
create or replace function accept_hr_invitation(p_token uuid) returns jsonb
language plpgsql security definer as $$
declare
  v_inv hr_invitations%rowtype;
  v_user_email text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_inv from hr_invitations where token = p_token for update;
  if not found then raise exception 'Invitation not found'; end if;
  if v_inv.status = 'accepted' then raise exception 'Invitation already accepted'; end if;
  if v_inv.status = 'revoked' then raise exception 'This invitation has been revoked by your firm admin'; end if;
  if v_inv.expires_at < now() then raise exception 'Invitation has expired'; end if;
  select email into v_user_email from profiles where id = auth.uid();
  if lower(v_user_email) != lower(v_inv.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;
  update profiles set role = 'hr' where id = auth.uid() and role = 'candidate';
  insert into firm_members (firm_id, user_id, is_admin) values (v_inv.firm_id, auth.uid(), false)
  on conflict (firm_id, user_id) do nothing;
  update hr_invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
  return jsonb_build_object('firm_id', v_inv.firm_id);
end;
$$;
