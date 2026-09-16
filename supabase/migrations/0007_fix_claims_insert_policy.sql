-- Fix: claims INSERT policy only checked candidate_id = auth.uid().
-- A direct REST API caller could set any event_id / firm_id.
--
-- The route handler at app/api/claims/route.ts verifies participation
-- and derives firm_id from the event, but that doesn't protect the
-- raw REST API.
--
-- Fix: add a SECURITY DEFINER helper (to avoid RLS cycles through
-- events -> event_participants -> events) that confirms the candidate
-- is a participant in the event AND that firm_id matches the event.

create or replace function is_valid_claim_insert(p_event_id uuid, p_firm_id uuid)
  returns boolean
  language sql stable security definer
  set search_path = public as $$
    select exists (
      select 1 from event_participants ep
      join events e on e.id = ep.event_id
      where ep.event_id    = p_event_id
        and ep.candidate_id = auth.uid()
        and e.firm_id       = p_firm_id
    )
$$;

drop policy if exists "Candidates insert own claims" on claims;

create policy "Candidates insert own claims" on claims
  for insert with check (
    candidate_id = auth.uid()
    and is_valid_claim_insert(event_id, firm_id)
  );
