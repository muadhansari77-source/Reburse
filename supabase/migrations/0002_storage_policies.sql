-- Storage RLS policies for the receipts bucket
-- Run this AFTER creating the bucket in the Supabase dashboard or via setup-bucket.mjs

-- Candidates can upload receipts for their own draft/changes_requested claims
create policy "Candidates upload receipts"
on storage.objects for insert
with check (
  bucket_id = 'receipts'
  and auth.uid() is not null
  and (storage.foldername(name))[1] in (
    select id::text from claims
    where candidate_id = auth.uid()
    and status in ('draft', 'changes_requested')
  )
);

-- Candidates can read their own receipts
create policy "Candidates read own receipts"
on storage.objects for select
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in (
    select id::text from claims where candidate_id = auth.uid()
  )
);

-- Candidates can delete receipts on their own draft/changes_requested claims
create policy "Candidates delete own receipts"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in (
    select id::text from claims
    where candidate_id = auth.uid()
    and status in ('draft', 'changes_requested')
  )
);

-- HR can read receipts for their firm's claims (needed for signed URL endpoint)
create policy "HR read firm receipts"
on storage.objects for select
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] in (
    select c.id::text from claims c
    join firm_members fm on fm.firm_id = c.firm_id
    where fm.user_id = auth.uid()
  )
);
