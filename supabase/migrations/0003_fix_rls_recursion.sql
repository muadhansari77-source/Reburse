-- Fix infinite recursion in RLS policies
--
-- Two cycles existed:
--   events -> event_participants -> events  (candidate event visibility + HR participant visibility)
--   events -> invitations -> events         (candidate invite visibility + HR invitation management)
--
-- Fix: replace policies that reference events with security-definer helper functions
-- that bypass events RLS, breaking both cycles.

-- Helper: does the current user belong to the firm that owns this event?
create or replace function is_hr_for_event(p_event_id uuid) returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from events e
    join firm_members fm on fm.firm_id = e.firm_id
    where e.id = p_event_id and fm.user_id = auth.uid()
  )
$$;

-- Fix event_participants: drop old HR policy and replace with helper
drop policy if exists "Firm members view their event participations" on event_participants;
create policy "Firm members view their event participations" on event_participants
  for select using (is_hr_for_event(event_id));

-- Fix invitations: drop old HR policy and replace with helper
drop policy if exists "Firm members CRUD for their firm's events' invitations" on invitations;

-- INSERT/UPDATE/DELETE still need firm check via events — but we use the helper
create policy "Firm members can view invitations for their events" on invitations
  for select using (is_hr_for_event(event_id));

create policy "Firm members can insert invitations for their events" on invitations
  for insert with check (is_hr_for_event(event_id));

create policy "Firm members can update invitations for their events" on invitations
  for update using (is_hr_for_event(event_id));

create policy "Firm members can delete invitations for their events" on invitations
  for delete using (is_hr_for_event(event_id));
