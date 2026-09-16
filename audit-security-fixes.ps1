#Requires -Version 5.1
<#
.SYNOPSIS
    Audits all known security fixes against the live Supabase database and codebase.
.DESCRIPTION
    Reads SUPABASE_DB_URL from .env.local and runs checks via Node.js + pg (no psql required).
    Exits with the number of regressions so it can be used in CI.
.EXAMPLE
    .\audit-security-fixes.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# ── Helpers ───────────────────────────────────────────────────────────────────

$script:checks = [System.Collections.Generic.List[PSCustomObject]]::new()

function Add-Check {
    param(
        [string] $Name,
        [bool]   $Pass,
        [string] $Detail     = '',
        [bool]   $IsInfo     = $false,
        [bool]   $IsKnownGap = $false
    )
    $script:checks.Add([PSCustomObject]@{
        Name       = $Name
        Pass       = $Pass
        Detail     = $Detail
        IsInfo     = $IsInfo
        IsKnownGap = $IsKnownGap
    })
}

# ── 1. Read .env.local ────────────────────────────────────────────────────────

$envFile = Join-Path $PSScriptRoot '.env.local'
if (-not (Test-Path $envFile)) { Write-Error ".env.local not found at $envFile"; exit 1 }

$dbUrl = Get-Content $envFile |
    Where-Object  { $_ -match '^SUPABASE_DB_URL=(.+)$' } |
    Select-Object -First 1 |
    ForEach-Object { $Matches[1].Trim() }

if (-not $dbUrl) { Write-Error 'SUPABASE_DB_URL not found in .env.local'; exit 1 }

# ── 2. Verify Node is available ───────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'node not found in PATH'; exit 1
}

Write-Host ''
Write-Host '  TravelClaim Security Audit' -ForegroundColor Cyan
Write-Host "  Database: $($dbUrl -replace ':([^:@]+)@', ':***@')"
Write-Host ''

# ── 3. Run all DB checks in one Node invocation ───────────────────────────────
#
# Uses pg (devDependency) rather than psql, which is not installed.
# Each check queries pg_policies using LIKE patterns verified against the
# actual stored with_check text (inspected during initial scripting).

$dbScript = @'
const { Client } = require("pg");
const c = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
});

c.connect().then(async () => {
    async function n(sql) {
        const r = await c.query(sql);
        return parseInt(r.rows[0].n, 10);
    }

    const results = {
        // firms INSERT: with_check references profiles and 'hr'::user_role
        firms_hr: await n(
            "SELECT COUNT(*)::int AS n FROM pg_policies " +
            "WHERE tablename='firms' AND cmd='INSERT' " +
            "AND with_check LIKE '%profiles%' AND with_check LIKE '%hr%'"
        ),
        // claims INSERT: with_check calls is_valid_claim_insert()
        claims_fn: await n(
            "SELECT COUNT(*)::int AS n FROM pg_policies " +
            "WHERE tablename='claims' AND cmd='INSERT' " +
            "AND with_check LIKE '%is_valid_claim_insert%'"
        ),
        // claim_status_history: expect ZERO INSERT policies (all writes via SECDEF RPCs)
        history_insert_count: await n(
            "SELECT COUNT(*)::int AS n FROM pg_policies " +
            "WHERE tablename='claim_status_history' AND cmd='INSERT'"
        ),
        // hr_invitations: revoke_hr_invitation RPC must exist (migration 0009)
        hr_revoke_fn: await n(
            "SELECT COUNT(*)::int AS n FROM pg_proc " +
            "WHERE proname = 'revoke_hr_invitation'"
        ),
        // firm_members INSERT: self-referential by design (references firm_members in with_check)
        fm_self_ref: await n(
            "SELECT COUNT(*)::int AS n FROM pg_policies " +
            "WHERE tablename='firm_members' AND cmd='INSERT' " +
            "AND with_check LIKE '%firm_members%'"
        ),
    };

    console.log(JSON.stringify(results));
    await c.end();
}).catch(e => { process.stderr.write(e.message + "\n"); process.exit(1); });
'@

try {
    $jsonRaw = $dbScript | node --env-file=.env.local 2>&1
    if ($LASTEXITCODE -ne 0) { throw $jsonRaw }
    $db = $jsonRaw | ConvertFrom-Json
} catch {
    Write-Error "Database query failed: $_"
    exit 1
}

# ── 4. Register DB results ────────────────────────────────────────────────────

Add-Check `
    -Name   'firms INSERT: requires profiles.role = hr  [migration 0006]' `
    -Pass   ($db.firms_hr -gt 0)

Add-Check `
    -Name   'claims INSERT: uses is_valid_claim_insert()  [migration 0007]' `
    -Pass   ($db.claims_fn -gt 0)

Add-Check `
    -Name   'claim_status_history: no INSERT policy  [migration 0008]' `
    -Pass   ($db.history_insert_count -eq 0) `
    -Detail $(if ($db.history_insert_count -gt 0) { "$($db.history_insert_count) INSERT policy/policies still exist" } else { '' })

Add-Check `
    -Name   'hr_invitations: revoke_hr_invitation RPC exists  [migration 0009]' `
    -Pass   ($db.hr_revoke_fn -gt 0)

Add-Check `
    -Name   'firm_members INSERT: self-referential check  [by design]' `
    -Pass   ($db.fm_self_ref -gt 0) `
    -Detail 'Direct REST inserts intentionally fail; use register_firm() / accept_hr_invitation()' `
    -IsInfo $true

# ── 5. Code check: rate limiting in upload route ──────────────────────────────

$routeFile = Join-Path $PSScriptRoot 'app\api\receipts\upload\route.ts'
if (Test-Path $routeFile) {
    $src      = Get-Content $routeFile -Raw
    $hasConst = $src -match 'UPLOAD_LIMIT'
    $hasQuery = $src -match 'recentUploads'
    $has429   = $src -match '429'
    $ok       = $hasConst -and $hasQuery -and $has429
    $detail   = if     (-not $hasConst) { 'UPLOAD_LIMIT constant missing' }
                elseif (-not $hasQuery) { 'recentUploads count query missing' }
                elseif (-not $has429)   { '429 status response missing' }
                else                    { '' }
} else {
    $ok     = $false
    $detail = 'route.ts not found'
}

Add-Check `
    -Name   'upload route: per-user rate limiting present  [20/hour]' `
    -Pass   $ok `
    -Detail $detail

# ── 6. Print results table ────────────────────────────────────────────────────

$W = 64   # name column width (longest check name is ~61 chars)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$divider = '  ' + ('-' * ($W + 12))

Write-Host $divider
Write-Host ("  {0,-$W}  {1}" -f 'Check', 'Status')
Write-Host $divider

foreach ($chk in $script:checks) {
    $label  = if ($chk.Name.Length -gt $W) { $chk.Name.Substring(0, $W - 3) + '...' } else { $chk.Name }
    $status = if     ($chk.IsInfo)               { 'INFO' }
              elseif ($chk.Pass)                  { 'PASS' }
              elseif ($chk.IsKnownGap)            { 'GAP ' }
              else                                { 'FAIL' }
    $color  = if     ($chk.IsInfo)               { 'Cyan' }
              elseif ($chk.Pass)                  { 'Green' }
              elseif ($chk.IsKnownGap)            { 'Yellow' }
              else                                { 'Red' }

    Write-Host ("  {0,-$W}  " -f $label) -NoNewline
    Write-Host $status -ForegroundColor $color

    if ($chk.Detail) {
        Write-Host ("  {0,-$W}    {1}" -f '', $chk.Detail) -ForegroundColor DarkGray
    }
}

Write-Host $divider

# ── 7. Summary ────────────────────────────────────────────────────────────────

$passed      = @($script:checks | Where-Object {  $_.Pass -and -not $_.IsInfo })
$regressions = @($script:checks | Where-Object { -not $_.Pass -and -not $_.IsInfo -and -not $_.IsKnownGap })
$gaps        = @($script:checks | Where-Object { $_.IsKnownGap -and -not $_.Pass })
$info        = @($script:checks | Where-Object { $_.IsInfo })

Write-Host ''
$summaryColor = if ($regressions.Count -eq 0) { 'Green' } else { 'Red' }
Write-Host ("  {0} passed   {1} regression(s)   {2} known gap(s)   {3} informational" -f `
    $passed.Count, $regressions.Count, $gaps.Count, $info.Count) -ForegroundColor $summaryColor

if ($regressions.Count -gt 0) {
    Write-Host ''
    Write-Host '  !! REGRESSIONS — security fixes that are no longer applied:' -ForegroundColor Red
    foreach ($r in $regressions) {
        Write-Host "     - $($r.Name)" -ForegroundColor Red
    }
}

if ($gaps.Count -gt 0) {
    Write-Host ''
    Write-Host '  Known gaps (tracked, not yet fixed):' -ForegroundColor Yellow
    foreach ($g in $gaps) {
        Write-Host "     - $($g.Name)" -ForegroundColor Yellow
    }
}

Write-Host ''

# Exit code = number of regressions (0 = clean, usable in CI)
exit $regressions.Count
