-- ============================================================
-- TravelClaim MVP — full schema + RLS + RPCs
-- Run in Supabase SQL Editor or via: supabase db push
-- ============================================================

-- ENUMS
create type user_role as enum ('candidate', 'hr');
create type event_type as enum ('open_day', 'insight_scheme', 'assessment_centre', 'vacation_scheme', 'interview', 'other');
create type invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type claim_status as enum ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'rejected', 'payment_pending', 'paid');
create type ocr_status as enum ('pending', 'processing', 'succeeded', 'failed');
create type payment_method as enum ('manual_export', 'stripe');

-- ============================================================
-- TABLES
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role user_role not null,
  created_at timestamptz not null default now()
);

create table firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table firm_members (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  unique (firm_id, user_id)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  name text not null,
  event_type event_type not null default 'other',
  start_date date,
  end_date date,
  location text,
  reimbursement_cap numeric(10,2),
  currency text not null default 'GBP',
  is_open boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  status invitation_status not null default 'pending',
  invited_by uuid not null references profiles(id),
  expires_at timestamptz not null default now() + interval '60 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

create table event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  candidate_id uuid not null references profiles(id) on delete cascade,
  invitation_id uuid references invitations(id),
  created_at timestamptz not null default now(),
  unique (event_id, candidate_id)
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  event_id uuid not null references events(id),
  candidate_id uuid not null references profiles(id),
  status claim_status not null default 'draft',
  amount_claimed numeric(10,2),
  currency text not null default 'GBP',
  description text,
  travel_date date,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  review_note text,
  exported_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  payment_method payment_method,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes integer not null,
  ocr_status ocr_status not null default 'pending',
  extracted_merchant text,
  extracted_amount numeric(10,2),
  extracted_currency text,
  extracted_date date,
  extracted_provider text,
  extracted_journey text,
  extracted_reference text,
  extraction_confidence text,
  raw_extraction jsonb,
  extraction_error text,
  created_at timestamptz not null default now()
);

create table claim_status_history (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  from_status claim_status,
  to_status claim_status not null,
  changed_by uuid not null references profiles(id),
  note text,
  created_at timestamptz not null default now()
);

-- INDEXES
create index on claims (firm_id, status);
create index on claims (candidate_id);
create index on claims (event_id);
create index on invitations (token);
create index on receipts (claim_id);
create index on claim_status_history (claim_id);

-- updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger claims_updated_at before update on claims
for each row execute function set_updated_at();

-- Profile auto-creation trigger
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'candidate')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table firms enable row level security;
alter table firm_members enable row level security;
alter table events enable row level security;
alter table invitations enable row level security;
alter table event_participants enable row level security;
alter table claims enable row level security;
alter table receipts enable row level security;
alter table claim_status_history enable row level security;

-- Helper: firm IDs the current user belongs to
create or replace function user_firm_ids() returns setof uuid
language sql stable security definer as $$
  select firm_id from firm_members where user_id = auth.uid()
$$;

-- Helper: check if user is HR in any firm that owns a given claim
create or replace function is_hr_for_claim(p_claim_id uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from claims c
    join firm_members fm on fm.firm_id = c.firm_id
    where c.id = p_claim_id and fm.user_id = auth.uid()
  )
$$;

-- PROFILES policies
create policy "Users can view own profile" on profiles for select using (id = auth.uid());
create policy "Users can update own profile" on profiles for update using (id = auth.uid());
create policy "HR can view candidate profiles in their firm" on profiles for select using (
  exists (
    select 1 from claims c
    join firm_members fm on fm.firm_id = c.firm_id
    where c.candidate_id = profiles.id and fm.user_id = auth.uid()
  )
  or
  exists (
    select 1 from event_participants ep
    join events e on e.id = ep.event_id
    join firm_members fm on fm.firm_id = e.firm_id
    where ep.candidate_id = profiles.id and fm.user_id = auth.uid()
  )
);

-- FIRMS policies
create policy "Members can view their firm" on firms for select using (id in (select user_firm_ids()));
create policy "Authenticated HR users can insert firms" on firms for insert with check (auth.uid() is not null);

-- FIRM_MEMBERS policies
create policy "Members can view their firm members" on firm_members for select using (firm_id in (select user_firm_ids()));
create policy "Firm admins can insert members" on firm_members for insert with check (
  exists (select 1 from firm_members fm where fm.firm_id = firm_members.firm_id and fm.user_id = auth.uid() and fm.is_admin = true)
  or user_id = auth.uid()  -- allow self-insert for new firm creation via RPC
);

-- EVENTS policies
create policy "Firm members can CRUD their firm events" on events for all using (firm_id in (select user_firm_ids()));
create policy "Candidates can view events they participate in" on events for select using (
  exists (select 1 from event_participants ep where ep.event_id = events.id and ep.candidate_id = auth.uid())
);
create policy "Candidates can view events they have pending invitations to" on events for select using (
  exists (select 1 from invitations i where i.event_id = events.id and lower(i.email) = (select lower(email) from profiles where id = auth.uid()) and i.status = 'pending')
);

-- INVITATIONS policies
create policy "Firm members can CRUD invitations for their events" on invitations for all using (
  exists (select 1 from events e where e.id = invitations.event_id and e.firm_id in (select user_firm_ids()))
);

-- EVENT_PARTICIPANTS policies
create policy "Candidates view own participations" on event_participants for select using (candidate_id = auth.uid());
create policy "Firm members view their event participations" on event_participants for select using (
  exists (select 1 from events e where e.id = event_participants.event_id and e.firm_id in (select user_firm_ids()))
);

-- CLAIMS policies
create policy "Candidates view own claims" on claims for select using (candidate_id = auth.uid());
create policy "Candidates insert own claims" on claims for insert with check (candidate_id = auth.uid());
create policy "Candidates update own claims in draft/changes_requested" on claims for update using (
  candidate_id = auth.uid() and status in ('draft', 'changes_requested')
) with check (
  candidate_id = auth.uid() and status in ('draft', 'changes_requested', 'submitted')
);
create policy "HR can view claims for their firm" on claims for select using (firm_id in (select user_firm_ids()));
create policy "HR can update claims for their firm" on claims for update using (firm_id in (select user_firm_ids()));

-- RECEIPTS policies
create policy "Candidates CRUD receipts on own draft/changes_requested claims" on receipts for all using (
  exists (select 1 from claims c where c.id = receipts.claim_id and c.candidate_id = auth.uid() and c.status in ('draft', 'changes_requested'))
);
create policy "Candidates can select receipts on own claims" on receipts for select using (
  exists (select 1 from claims c where c.id = receipts.claim_id and c.candidate_id = auth.uid())
);
create policy "HR can select receipts for their firm's claims" on receipts for select using (
  exists (select 1 from claims c join firm_members fm on fm.firm_id = c.firm_id where c.id = receipts.claim_id and fm.user_id = auth.uid())
);

-- CLAIM_STATUS_HISTORY policies
create policy "Candidates view history of own claims" on claim_status_history for select using (
  exists (select 1 from claims c where c.id = claim_status_history.claim_id and c.candidate_id = auth.uid())
);
create policy "HR view history for their firm's claims" on claim_status_history for select using (
  exists (select 1 from claims c join firm_members fm on fm.firm_id = c.firm_id where c.id = claim_status_history.claim_id and fm.user_id = auth.uid())
);
create policy "Server can insert history" on claim_status_history for insert with check (auth.uid() is not null);

-- ============================================================
-- SECURITY DEFINER RPCs
-- ============================================================

-- Register a firm + make the current user admin
create or replace function register_firm(p_name text) returns uuid
language plpgsql security definer as $$
declare
  v_firm_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into firms (name) values (p_name) returning id into v_firm_id;
  insert into firm_members (firm_id, user_id, is_admin) values (v_firm_id, auth.uid(), true);
  return v_firm_id;
end;
$$;

-- Get public invitation details (unauthenticated-safe)
create or replace function get_invitation_public(p_token uuid)
returns table (
  invitation_id uuid,
  invitation_status invitation_status,
  invited_email text,
  expires_at timestamptz,
  event_id uuid,
  event_name text,
  event_type event_type,
  start_date date,
  end_date date,
  location text,
  firm_id uuid,
  firm_name text
)
language sql security definer as $$
  select
    i.id,
    i.status,
    -- mask: show first char + domain only e.g. j***@gmail.com
    substring(i.email, 1, 1) || '***@' || split_part(i.email, '@', 2) as invited_email,
    i.expires_at,
    e.id,
    e.name,
    e.event_type,
    e.start_date,
    e.end_date,
    e.location,
    f.id,
    f.name
  from invitations i
  join events e on e.id = i.event_id
  join firms f on f.id = e.firm_id
  where i.token = p_token
$$;

-- Accept an invitation
create or replace function accept_invitation(p_token uuid) returns jsonb
language plpgsql security definer as $$
declare
  v_inv invitations%rowtype;
  v_user_email text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  select * into v_inv from invitations where token = p_token for update;
  if not found then raise exception 'Invitation not found'; end if;
  if v_inv.status = 'accepted' then raise exception 'Invitation already accepted'; end if;
  if v_inv.status = 'revoked' then raise exception 'Invitation has been revoked'; end if;
  if v_inv.status = 'expired' or v_inv.expires_at < now() then raise exception 'Invitation has expired'; end if;

  select email into v_user_email from profiles where id = auth.uid();
  if lower(v_user_email) != lower(v_inv.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  update invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;

  insert into event_participants (event_id, candidate_id, invitation_id)
  values (v_inv.event_id, auth.uid(), v_inv.id)
  on conflict (event_id, candidate_id) do nothing;

  return jsonb_build_object('event_id', v_inv.event_id);
end;
$$;

-- Submit a claim
create or replace function submit_claim(p_claim_id uuid) returns void
language plpgsql security definer as $$
declare
  v_claim claims%rowtype;
  v_receipt_count int;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_claim from claims where id = p_claim_id and candidate_id = auth.uid() for update;
  if not found then raise exception 'Claim not found'; end if;
  if v_claim.status not in ('draft', 'changes_requested') then raise exception 'Claim cannot be submitted from status %', v_claim.status; end if;
  if v_claim.amount_claimed is null then raise exception 'Amount is required'; end if;
  if v_claim.travel_date is null then raise exception 'Travel date is required'; end if;
  select count(*) into v_receipt_count from receipts where claim_id = p_claim_id;
  if v_receipt_count = 0 then raise exception 'At least one receipt is required'; end if;

  update claims set status = 'submitted', submitted_at = now() where id = p_claim_id;
  insert into claim_status_history (claim_id, from_status, to_status, changed_by)
  values (p_claim_id, v_claim.status, 'submitted', auth.uid());
end;
$$;

-- HR review action
create or replace function review_claim(
  p_claim_id uuid,
  p_action text,  -- 'start_review' | 'approve' | 'reject' | 'request_changes'
  p_note text default null
) returns void
language plpgsql security definer as $$
declare
  v_claim claims%rowtype;
  v_new_status claim_status;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  -- verify HR belongs to the claim's firm
  if not is_hr_for_claim(p_claim_id) then raise exception 'Unauthorized'; end if;

  select * into v_claim from claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found'; end if;

  if p_action = 'start_review' then
    if v_claim.status != 'submitted' then raise exception 'Can only start review on submitted claims'; end if;
    v_new_status := 'under_review';
  elsif p_action = 'approve' then
    if v_claim.status not in ('submitted', 'under_review') then raise exception 'Can only approve submitted/under_review claims'; end if;
    v_new_status := 'approved';
  elsif p_action = 'reject' then
    if v_claim.status not in ('submitted', 'under_review') then raise exception 'Can only reject submitted/under_review claims'; end if;
    if p_note is null or trim(p_note) = '' then raise exception 'Rejection reason is required'; end if;
    v_new_status := 'rejected';
  elsif p_action = 'request_changes' then
    if v_claim.status not in ('submitted', 'under_review') then raise exception 'Can only request changes on submitted/under_review claims'; end if;
    if p_note is null or trim(p_note) = '' then raise exception 'Change request note is required'; end if;
    v_new_status := 'changes_requested';
  else
    raise exception 'Unknown action: %', p_action;
  end if;

  update claims set
    status = v_new_status,
    reviewed_at = case when p_action in ('approve','reject','request_changes') then now() else reviewed_at end,
    reviewed_by = case when p_action in ('approve','reject','request_changes') then auth.uid() else reviewed_by end,
    review_note = case when p_action in ('reject','request_changes') then p_note else review_note end
  where id = p_claim_id;

  insert into claim_status_history (claim_id, from_status, to_status, changed_by, note)
  values (p_claim_id, v_claim.status, v_new_status, auth.uid(), p_note);
end;
$$;

-- Mark claims as paid
create or replace function mark_paid(
  p_claim_ids uuid[],
  p_payment_reference text default null
) returns void
language plpgsql security definer as $$
declare
  v_claim_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  foreach v_claim_id in array p_claim_ids loop
    if not is_hr_for_claim(v_claim_id) then raise exception 'Unauthorized for claim %', v_claim_id; end if;
    declare
      v_claim claims%rowtype;
    begin
      select * into v_claim from claims where id = v_claim_id for update;
      if v_claim.status not in ('approved', 'payment_pending') then
        raise exception 'Claim % cannot be marked paid from status %', v_claim_id, v_claim.status;
      end if;
      update claims set
        status = 'paid',
        paid_at = now(),
        payment_reference = coalesce(p_payment_reference, claims.payment_reference),
        payment_method = 'manual_export'
      where id = v_claim_id;
      insert into claim_status_history (claim_id, from_status, to_status, changed_by, note)
      values (v_claim_id, v_claim.status, 'paid', auth.uid(), p_payment_reference);
    end;
  end loop;
end;
$$;

-- Export claims (set to payment_pending)
create or replace function export_claims(p_claim_ids uuid[]) returns void
language plpgsql security definer as $$
declare
  v_claim_id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  foreach v_claim_id in array p_claim_ids loop
    if not is_hr_for_claim(v_claim_id) then raise exception 'Unauthorized'; end if;
    declare v_claim claims%rowtype; begin
      select * into v_claim from claims where id = v_claim_id for update;
      if v_claim.status = 'approved' then
        update claims set status = 'payment_pending', exported_at = now() where id = v_claim_id;
        insert into claim_status_history (claim_id, from_status, to_status, changed_by)
        values (v_claim_id, 'approved', 'payment_pending', auth.uid());
      elsif v_claim.status = 'payment_pending' then
        update claims set exported_at = now() where id = v_claim_id;
      else
        raise exception 'Claim % is in status % and cannot be exported', v_claim_id, v_claim.status;
      end if;
    end;
  end loop;
end;
$$;

-- Invite an HR colleague to the firm
create or replace function invite_hr_colleague(p_firm_id uuid, p_email text) returns uuid
language plpgsql security definer as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from firm_members where firm_id = p_firm_id and user_id = auth.uid() and is_admin = true)
  then raise exception 'Only firm admins can invite colleagues'; end if;

  -- Store in a simple way: we'll reuse invitations with a special sentinel event_id
  -- Instead, use hr_invitations table (created below)
  insert into hr_invitations (firm_id, email, token, invited_by)
  values (p_firm_id, lower(p_email), v_token, auth.uid());
  return v_token;
end;
$$;

-- HR invitations table (separate from candidate invitations)
create table hr_invitations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id) on delete cascade,
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null references profiles(id),
  status text not null default 'pending',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (firm_id, email)
);
alter table hr_invitations enable row level security;
create policy "Firm members can view HR invitations" on hr_invitations for select using (firm_id in (select user_firm_ids()));
create index on hr_invitations (token);

-- Accept HR invitation
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

-- ============================================================
-- STORAGE BUCKET (run separately in Supabase dashboard or via API)
-- The SQL below is reference; bucket creation is done via the Supabase UI or CLI:
-- supabase storage create receipts --public=false
-- ============================================================
-- Storage policies are set via Supabase dashboard or CLI after bucket creation.
-- Path convention: {claim_id}/{receipt_id}.{ext}
-- Candidates: can upload/read under their own claim IDs
-- HR: can read under their firm's claim IDs
