# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Journey log

After any significant change (security fix, credential rotation, config change, new feature, bug found and fixed), append a short plain-English entry to `journey-log.md` in the project root, explaining what changed and why, written for someone with no technical background.

## Commands

```bash
npm run dev        # start dev server (http://localhost:3000)
npm run build      # production build (also runs tsc)
npm run lint       # ESLint
npx tsc --noEmit   # type-check without building
```

**Database / setup scripts** (must load env vars explicitly):
```bash
node --env-file=.env.local scripts/migrate.mjs          # run all SQL migrations in order
node --env-file=.env.local scripts/setup-bucket.mjs     # create receipts storage bucket
node --env-file=.env.local scripts/e2e-test.mjs         # seed test data + verify full flow
node --env-file=.env.local scripts/test-rate-limit.mjs  # verify receipt upload rate limiter
```

**Security audit** (PowerShell, reads `.env.local` automatically):
```powershell
.\audit-security-fixes.ps1   # check all security fixes against live DB; exit code = regression count
```

There are no automated tests. Verification is done via `e2e-test.mjs` and manual browser testing.

## Environment

Copy `.env.local.example` to `.env.local` and fill in all six vars before running anything. The build succeeds without them (placeholder values are used), but the app won't function at runtime.

The app reads env vars automatically via Next.js. The `scripts/` directory does **not** — run them with `node --env-file=.env.local scripts/<name>.mjs` or export vars manually first.

Key vars:
- `SUPABASE_SECRET_KEY` — the `sb_secret_*` format key (server-only, used by `createServiceClient()` and scripts)
- `SUPABASE_DB_URL` — full postgres connection string (`postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres`), used only by migration scripts and `audit-security-fixes.ps1`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — JWT, safe to expose to browser
- `NEXT_PUBLIC_APP_URL` — used to construct absolute invite links; set to `http://localhost:3000` locally, Vercel URL in production

## Architecture

### Framework quirks — Next.js 16
This runs **Next.js 16** which has breaking changes from 15:
- `middleware.ts` is **deprecated** and renamed to **`proxy.ts`**. The exported function must be named `proxy`, not `middleware`.
- `useSearchParams()` **must** be wrapped in `<Suspense>` or the build fails.
- The `dynamic` route-segment config option is removed when `cacheComponents` is enabled.

Always read `node_modules/next/dist/docs/` before writing routing or middleware code.

### Two-sided app — two role contexts
Every authenticated user is either `candidate` or `hr` (set in `profiles.role`). The proxy (`proxy.ts`) redirects based on role on every request. There are two completely separate layout trees:
- `app/dashboard/` + `app/claims/` — candidate routes, layout checks role = candidate
- `app/hr/` — HR routes, layout checks role = hr

**Invite acceptance flows** live outside these trees:
- `app/invite/[token]/` — candidate accepts a reimbursement event invitation (public, then requires auth)
- `app/invite/hr/[token]/` — HR colleague accepts a firm membership invitation (requires auth)
- `app/firms/register/` — HR user registers a new firm (requires `profiles.role = 'hr'`)

### Supabase client usage
Three separate clients, used in different contexts:

| Client | File | Usage |
|--------|------|-------|
| Server (anon) | `lib/supabase/server.ts → createClient()` | Server components, route handlers — uses session cookies |
| Service role | `lib/supabase/server.ts → createServiceClient()` | Server-only mutations that bypass RLS (uploads, admin ops) |
| Browser (anon) | `lib/supabase/client.ts → createClient()` | `'use client'` components |

**Never** use `createServiceClient()` or expose `SUPABASE_SECRET_KEY` / `ANTHROPIC_API_KEY` in client components.

### RLS and circular reference pitfalls
Row Level Security is enforced on all 10 tables. Several policies reference other protected tables. **Circular references cause "infinite recursion detected in policy" at runtime.** The fix pattern is a `SECURITY DEFINER` helper function (owned by the `postgres` superuser, which has `bypassrls`) that queries tables without triggering their RLS:

```sql
create or replace function is_hr_for_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e join firm_members fm ...)
$$;
```

Existing helpers: `user_firm_ids()`, `is_hr_for_claim()`, `is_hr_for_event()`, `is_candidate_in_my_firm()`, `is_valid_claim_insert()`.

If you add a new RLS policy that references another table, check whether that table's policies reference back — any cycle will surface as a runtime 500.

### RLS helper functions
In addition to the cycle-breaking helpers, two more SECURITY DEFINER functions were added for policy enforcement:
- `is_valid_claim_insert(p_event_id, p_firm_id)` — used by the `claims` INSERT policy to verify the candidate is a participant in the event and the `firm_id` matches, without triggering RLS cycles through events/event_participants.

### Rate limiting on receipt upload
`POST /api/receipts/upload` is rate-limited to **20 uploads per user per hour**. The check happens immediately after auth, before parsing the file or calling Anthropic. It runs a single `COUNT` query on the `receipts` table filtered to the last hour; RLS automatically scopes the count to the current user, so no extra filtering is needed.

Limit is hardcoded at 20 in `app/api/receipts/upload/route.ts`. A 429 response includes `Retry-After: 3600`. No Redis or external cache is required — the existing `receipts` table is the store. If the limit needs adjustment for production load, change `UPLOAD_LIMIT` in that file.

### Profile trigger
A Postgres trigger `on_auth_user_created` → `handle_new_user()` auto-creates a `profiles` row on every `auth.users` INSERT. The function **must** have `SET search_path = public` and an `EXCEPTION WHEN OTHERS` handler, otherwise Supabase GoTrue returns "Database error creating new user" because it runs with a restricted search path. See `supabase/migrations/0001_init.sql`.

### Claim state machine
All status transitions are enforced server-side via Postgres RPCs — never trust the client to set `status`:

```
draft → submitted → under_review → approved → payment_pending → paid
                 ↘ rejected (terminal)
                 ↘ changes_requested → submitted (loop)
approved → paid  (allowed directly, bypassing export)
```

RPCs: `submit_claim`, `review_claim(action)`, `mark_paid`, `export_claims`.

### Receipt upload + AI extraction
`POST /api/receipts/upload` is the only upload endpoint. Sequence:
1. Validate file type/size server-side
2. Use `createServiceClient()` to upload to `receipts/{claim_id}/{receipt_id}.ext`
3. Call `lib/extraction.ts` — images are resized to ≤1600px via `sharp` then sent to `claude-sonnet-4-6`; PDFs sent as base64 document blocks
4. Parse response with Zod; retry once on failure; store `ocr_status = 'failed'` and allow manual entry on second failure

Signed URLs for viewing receipts are generated server-side (60 min expiry) via `GET /api/receipts/[id]/signed-url`.

### Non-obvious behaviors

- **Auto-fill on first receipt**: When the first receipt extraction succeeds, the claim wizard sets `amount_claimed` to the sum of all extracted amounts, `travel_date` to the earliest extracted date, and `description` to the extracted journey. This only fires on the first receipt; subsequent extractions just append the receipt row.
- **Claim re-creation for changes_requested**: `/claims/new?event=<id>` detects whether the candidate already has a `changes_requested` claim for that event and reuses it rather than creating a new one. This is how "Edit & resubmit" works from the claim detail page.
- **CSV export BOM**: The export route prefixes the CSV with a UTF-8 BOM (`﻿`) so Excel opens it without an encoding dialog.
- **Receipt deletion**: Allowed when claim is `draft` or `changes_requested`. Deletes both the Supabase Storage object and the `receipts` row atomically.

### Multi-tenancy
All firm data is scoped by `firm_id`. The `firm_id` column is **denormalised onto `claims`** for efficient RLS without joining through events. HR users can only see their own firm's data — enforced by RLS, not just application code.

### HR team invitations
`hr_invitations` is a separate table (not the same as candidate `invitations`). HR admins invite colleagues via `invite_hr_colleague()` RPC, which stores a token. The invitee hits `app/invite/hr/[token]/`, accepts, and `accept_hr_invitation()` RPC sets their `profiles.role = 'hr'` and inserts a `firm_members` row.

Revocation is handled via the `revoke_hr_invitation(p_invitation_id)` SECURITY DEFINER RPC (migration 0009). Only firm admins can revoke; only `pending` invitations can be revoked. Revocation sets `status = 'revoked'` and records `revoked_at` / `revoked_by` for audit. `accept_hr_invitation` rejects revoked tokens with a clear error. The Team page (`/hr/team`) shows a "Revoke" button for each pending invite.

### Database migrations
Migrations live in `supabase/migrations/` and are numbered sequentially. Run them in order against the Supabase SQL editor or via `node scripts/migrate.mjs`. There is no Supabase CLI configured — the `pg` npm package is used for direct connection.

The migrations applied so far:
1. `0001_init.sql` — full schema, RLS, triggers, RPCs
2. `0002_storage_policies.sql` — storage bucket RLS
3. `0003_fix_rls_recursion.sql` — fix event_participants / invitations cycles
4. `0004_fix_rls_all_cycles.sql` — fix profiles HR policy cycle; drop invite-based events visibility policy
5. `0005_fix_firm_members_security.sql` — remove self-insert escape hatch from firm_members INSERT policy; add `role = 'hr'` guard to `register_firm()`
6. `0006_fix_firms_insert_policy.sql` — firms INSERT policy now requires `profiles.role = 'hr'`; was `auth.uid() IS NOT NULL`
7. `0007_fix_claims_insert_policy.sql` — claims INSERT policy now verifies event participation and firm_id via `is_valid_claim_insert()` SECURITY DEFINER helper; was `candidate_id = auth.uid()` only
8. `0008_fix_status_history_insert.sql` — removed permissive `claim_status_history` INSERT policy (`auth.uid() IS NOT NULL`); all writes go through SECURITY DEFINER RPCs which bypass RLS
9. `0009_revoke_hr_invitation.sql` — adds `revoked_at` / `revoked_by` columns to `hr_invitations`; adds `revoke_hr_invitation()` SECURITY DEFINER RPC (admin-only, pending-only); patches `accept_hr_invitation()` to reject revoked tokens

Note: the `firm_members` INSERT policy is self-referential (checks firm_members to verify admin status). Direct REST API inserts fail with a recursion error rather than a clean 403. This is fine — all legitimate inserts go through `SECURITY DEFINER` RPCs (`register_firm`, `accept_hr_invitation`) which bypass RLS.
