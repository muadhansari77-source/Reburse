# Reburse MVP

A two-sided travel reimbursement platform for professional services firms and their candidates.

## Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project, and note your:
- Project URL
- Anon (public) key
- Service role key (keep secret)

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-supabase-secret-key
SUPABASE_DB_URL=postgresql://postgres:your-db-password@db.yourproject.supabase.co:5432/postgres
ANTHROPIC_API_KEY=your-anthropic-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Run the database migration

In your Supabase project, go to **SQL Editor** and run the contents of:

```
supabase/migrations/0001_init.sql
```

This creates all tables, RLS policies, triggers, and RPCs.

### 4. Create the storage bucket

In Supabase dashboard → **Storage** → **New bucket**:
- Name: `receipts`
- Public: **No** (private)

Then set storage policies via SQL Editor:

```sql
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

-- HR can read receipts for their firm's claims
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
```

### 5. Configure Supabase Auth

In Supabase dashboard → **Authentication** → **Settings**:
- For local dev: set "Enable email confirmations" to **OFF**
- For production: leave email confirmations **ON**
- Add your app URL to "Site URL": `http://localhost:3000`
- Add redirect URLs: `http://localhost:3000/**`

### 6. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Push this repo to GitHub
2. Create a new Vercel project and import the repo
3. Add all environment variables in Vercel project settings
4. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL
5. Deploy

## Architecture notes

### User flows

- **Candidates**: Invited by email → click invitation link → sign up or log in → claim wizard (upload receipt → AI extracts data → confirm & submit) → track status
- **HR**: Register firm → create events → invite candidates → review claims (side-by-side receipt + data view) → approve/reject/request changes → export CSV for finance → mark paid

### AI extraction

Receipt images are processed server-side via the Anthropic Claude API (`claude-sonnet-4-6`). Files are resized to ≤1600px before sending (using `sharp`). PDFs are sent as base64 document blocks. The system prompt is verbatim from the spec (see `lib/extraction.ts`). If extraction fails, the candidate is shown empty editable fields and can enter details manually.

### State machine

```
draft → submitted → under_review → approved → payment_pending → paid
                                 ↘ rejected (terminal)
                                 ↘ changes_requested → submitted (loop)
```

All transitions are enforced server-side via Postgres RPCs (`submit_claim`, `review_claim`, `mark_paid`, `export_claims`).

### Multi-tenancy & security

All firm data is scoped by `firm_id`. Postgres Row Level Security (RLS) is the primary guard — application-level checks are secondary. HR users can only see their own firm's data. Service-role key and Anthropic API key are used only in server-side route handlers and are never exposed to the browser.

### Design decisions (unspecified details)

- **HR invitations** (team members): Uses a separate `hr_invitations` table rather than re-using the candidate invitations table, to avoid conflating the two concepts.
- **CSV export**: The BOM prefix ensures Excel opens the file correctly without encoding issues.
- **Receipt deletion**: Allowed in `draft` and `changes_requested` states. Removes both the storage object and the database row.
- **Claim re-creation**: If a candidate has a `changes_requested` claim, the "Edit & resubmit" link takes them to `/claims/new?event=...` which detects the existing claim and reuses it.
- **Next.js 16**: This project uses Next.js 16 which renames `middleware.ts` to `proxy.ts` and the export from `middleware` to `proxy`.
- **Auto-fill on first extraction**: When the first receipt extraction succeeds, `amount_claimed` is set to the sum of extracted amounts, `travel_date` to the earliest extracted date, and `description` to the extracted journey.

## Tech stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, Storage)
- Anthropic Claude API (`claude-sonnet-4-6`)
- `sharp` for image processing
- `zod` for validation
