-- Comprehensive RLS fix: eliminate all circular references
--
-- Cycles that existed after 0003:
--   events -> profiles (invite policy) -> events (HR profile policy)
--   events -> profiles -> event_participants -> events
--
-- Strategy:
--  1. Drop the "invite-based events visibility" policy — candidates see events
--     via event_participants (after acceptance) or via get_invitation_public() RPC
--     (security definer) before acceptance. The policy is not needed.
--  2. Fix the profiles HR policy to use a security-definer function instead of
--     directly referencing events.

-- Step 1: Drop the problematic events invite-visibility policy
drop policy if exists "Candidates can view events they have pending invitations to" on events;

-- Step 2: Security-definer helper to check if a candidate is visible to HR
-- (queries event_participants and events directly without triggering their RLS)
create or replace function is_candidate_in_my_firm(p_candidate_id uuid) returns boolean
language sql stable security definer
set search_path = public as $$
  select
    -- Via event participation
    exists (
      select 1 from event_participants ep
      join events e on e.id = ep.event_id
      join firm_members fm on fm.firm_id = e.firm_id
      where ep.candidate_id = p_candidate_id
        and fm.user_id = auth.uid()
    )
    or
    -- Via submitted claims
    exists (
      select 1 from claims c
      join firm_members fm on fm.firm_id = c.firm_id
      where c.candidate_id = p_candidate_id
        and fm.user_id = auth.uid()
    )
$$;

-- Step 3: Replace profiles HR policy with one that uses the helper
drop policy if exists "HR can view candidate profiles in their firm" on profiles;
create policy "HR can view candidate profiles in their firm" on profiles
  for select using (is_candidate_in_my_firm(id));
