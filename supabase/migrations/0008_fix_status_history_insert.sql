-- Fix: claim_status_history INSERT policy was "auth.uid() IS NOT NULL",
-- allowing any authenticated user to insert fabricated audit records directly
-- via the REST API, undermining the audit trail.
--
-- All legitimate inserts are made by SECURITY DEFINER RPCs (submit_claim,
-- review_claim, mark_paid, export_claims) which run as the postgres superuser
-- and bypass RLS entirely — so they do not need this policy.
-- Dropping it closes the direct-write loophole with no side effects.

drop policy if exists "Server can insert history" on claim_status_history;
