-- Fix: firms INSERT policy was "auth.uid() IS NOT NULL", allowing any
-- authenticated user (including candidates) to create a firm row directly
-- via the REST API, bypassing the role = 'hr' check in register_firm().
--
-- The register_firm() RPC is SECURITY DEFINER and bypasses RLS entirely,
-- so this policy only guards direct REST API calls. The RPC path is unaffected.

drop policy if exists "Authenticated HR users can insert firms" on firms;

create policy "HR users can insert firms" on firms
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'hr')
  );
