# TravelClaim Journey Log

A plain-English record of significant changes, discoveries, and fixes — written for anyone reading this without a technical background.

---

## 2026-07-26 — Initial build and setup

We built the TravelClaim app from scratch. This is a web platform where professional services firms (like law firms or consultancies) can reimburse candidates for travel costs when they attend events like interviews or assessment centres.

Two types of users exist: **candidates** (who upload receipts and submit claims) and **HR staff** (who review and approve those claims). The app uses AI to automatically read receipt images and pull out the key details — amount, date, where the journey was — so candidates don't have to type everything in manually.

We set up the database (Supabase), connected the AI (Anthropic Claude), created all the pages, and got it running locally.

---

## 2026-07-26 — Credential rotation and security cleanup

After the initial build, we discovered that some secret keys had been hardcoded directly into scripts rather than stored safely in environment variables. We fixed this, then rotated (replaced) all the credentials that had been exposed:

- The database password was changed
- The Supabase service key was replaced with a new one in a newer, more secure format
- The Anthropic API key was replaced
- The old keys were revoked so they can no longer be used by anyone

No credentials were ever committed to git (the version control history), so there is no historical exposure risk.

---

## 2026-07-26 — Security audit: database access rules (RLS)

We did a full review of the database access rules — the system that decides who is allowed to read or write each piece of data. Think of these rules like locks on filing cabinets: even if someone breaks into the building, the cabinet only opens for the right person.

**Three weaknesses were found** (not yet fixed — fixes are next):

1. **Anyone can create a firm directly** — the rule that's supposed to stop candidates from creating firms only applies when they go through the normal app screen. If someone were to call the database directly (bypassing the app), they could create a blank firm. It wouldn't give them access to any real data, but it's a loophole that should be closed.

2. **A claim can be filed against the wrong firm** — similarly, the rule that links a claim to the correct firm is only enforced by the app screen, not by the database itself. A technically savvy candidate could, in theory, submit a claim that appears in a different firm's HR inbox. This needs to be enforced at the database level too.

3. **Anyone can write fake audit history** — the app keeps a log of every status change on a claim (e.g. "submitted → approved"). The database rule that's supposed to protect this log is too loose: any logged-in user could write false entries to it directly. This undermines the audit trail.

---

## 2026-07-27 — Three database access rule fixes applied

Following the security audit, we fixed all three database-level weaknesses that were found. Each fix was applied one at a time and tested before moving to the next.

**Fix 1 — Only HR staff can create a firm.** Previously, the rule that was supposed to stop non-HR users from creating firms only applied when going through the normal app screen. If someone called the database directly, any logged-in user could create a firm. We updated the database rule itself to enforce the restriction, so it applies everywhere — not just through the app.

**Fix 2 — A claim must belong to the right event and firm.** Previously, the rule linking a claim to a specific event and firm was only checked by the app screen. Someone technically savvy could bypass the app and file a claim against a firm they weren't supposed to be connected to, causing their claim to appear in the wrong firm's inbox. We added a database-level check that always verifies: (a) the candidate was actually invited to and accepted that event, and (b) the firm listed on the claim matches the firm that organised the event. This now holds regardless of how the database is accessed.

**Fix 3 — Audit history is now tamper-proof.** The app keeps a log of every status change on a claim — for example, "submitted on Monday, approved on Wednesday by Jane HR". There was a loose rule that allowed any logged-in user to write directly to this log, meaning someone could in theory insert false entries. We removed that permission entirely. The log is now only written to by the app's internal processes (which run with elevated permissions that bypass these rules anyway), so the audit trail is protected.

All three fixes were tested automatically after being applied — the test suite passed each time, confirming that the normal candidate and HR workflows were unaffected.

## 2026-07-27 — Receipt upload rate limiter added

Every time someone uploads a receipt, the app sends it to the AI (Anthropic Claude) for analysis — and that costs real money per request. Previously there was no limit on how often someone could do this.

We added a rule: each user can upload at most **20 receipts per hour**. If they go over that, the app turns away the request with a clear error message and tells them to try again later. The 20-per-hour limit is generous for any legitimate user (you'd need to create 4 separate claims and upload 5 receipts to each in a single hour), but it prevents a runaway script from racking up thousands of AI calls.

**How it works:** rather than adding a separate rate-limiting service (which would cost extra and need new accounts), we count the user's recent uploads directly in the existing database. The database already knows exactly when each receipt was created and who it belongs to, so a single quick query tells us whether the user is over the limit. This check runs before any file is processed, so a blocked request costs almost nothing.

**Tested:** we verified that after 20 uploads, the count query correctly reports the limit has been hit, which is what triggers the block.

## 2026-08-04 — HR invitation revocation added

Previously, once an HR admin sent an invitation link, there was no way to cancel it. If someone was invited by mistake — wrong email address, the person left before accepting, or the admin just changed their mind — the link would stay valid until it expired (7 days).

We added the ability to revoke a pending HR invitation. Here's what changed:

- **Database**: The HR invitations table now records when an invitation was revoked and who revoked it, alongside the existing accepted/pending status. This keeps a complete audit trail — nothing is deleted.
- **Access control**: Only firm admins can revoke invitations, and only while they're still pending. If someone has already accepted an invitation (and therefore already joined the firm), there's nothing to revoke — that fact has already happened and is recorded permanently.
- **The invite link**: Once revoked, the invitation link stops working. If someone tries to use it, they'll see a clear error message: "This invitation has been revoked by your firm admin."
- **The Team page**: Firm admins now see a "Revoke" button next to each pending invitation in the team management screen. Clicking it asks for confirmation, then marks it revoked. The row updates to show a grey "revoked" badge.
- **Audit script**: The `audit-security-fixes.ps1` script was updated to check for this new revocation capability instead of the old "known gap" entry for missing DELETE access. It now shows PASS for this check.

---

## 2026-07-26 — Security audit: rate limiting

We also reviewed all the API endpoints (the "doors" the app uses to do things like upload a file or submit a claim). One finding:

**The receipt upload endpoint has no speed limit.** Every time someone uploads a receipt, the app sends it to the AI for analysis — and that costs money. There's a limit of 5 receipts per claim, but there's no limit on how many claims someone can create, so in theory a malicious user could upload thousands of receipts in quick succession and run up a large bill. A rate limit (e.g. max 20 uploads per hour per person) needs to be added.

All other endpoints are low-risk because they don't call any paid external services.
