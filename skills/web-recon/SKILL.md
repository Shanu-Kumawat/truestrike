# Web reconnaissance

Use this skill during the RECON phase, before any validation work. Its goal is
a complete, evidence-backed map of the authorized target's attack surface.

## Prime directive

Recon is passive or near-passive information gathering. You map what exists;
you do not attack it. Every command you run during recon must be safe to fire
at the target repeatedly. If a step could modify data, exhaust resources, or
be mistaken for an attack, it belongs in the VALIDATE phase behind the
approval gateway instead.

## Method (in order)

### 1. Baseline and fingerprint

- Fetch the root page and record: HTTP status, server and framework headers,
  cookie flags, security headers (CSP, HSTS, X-Frame-Options), and any
  framework fingerprints in the HTML (generator tags, asset paths, script
  bundles).
- Probe common metadata endpoints (robots.txt, sitemap.xml, .well-known
  paths). Note everything that returns something unexpected for a stock
  deployment.

### 2. Route and API discovery

- Enumerate routes from three sources: links extracted from served pages,
  client-side route tables visible in JavaScript bundles, and a small
  wordlist pass on API-looking prefixes (/api, /rest, /graphql, /v1, /v2).
- For each discovered API path, record: method, path, auth requirement
  (anonymous vs session), status code, and response shape. A 500 on a
  well-formed request is itself a finding candidate (note it; do not dig
  during recon).
- Distinguish SPA fallbacks from real endpoints: an HTML shell returned with
  200 for an API path is a fallback, not an endpoint. Note the difference or
  you will chase ghosts.

### 3. Input inventory

For every real endpoint, inventory where input enters:

- Query parameters and their apparent types.
- POST/PUT body fields (probe with benign dummy values, never real-looking
  credentials).
- Path segments that look like IDs or filenames.
- Headers the app appears to act on (X-Forwarded-For, custom API versions).
- File upload surfaces, if any.
- Client-side reflected values (search responses for parameters echoed back).

### 4. Auth and session surface

- Identify the login flow, registration flow, password-reset flow, and any
  token/refresh mechanism.
- Record cookie names and flags, token formats (JWT? opaque? which claims are
  visible), and what an unauthenticated request to a protected endpoint
  returns (401 vs 403 vs redirect).
- Note anything that smells like weak session handling for later review, but
  do not attempt forgery or bypasses during recon.

### 5. Technology and dependency hints

- Record versions exposed in headers, error pages, or asset filenames.
- Client bundles often leak library versions and internal route names; save
  interesting excerpts as evidence rather than trusting memory.

## Tool recipes (safe flags)

- HTTP probing: `httpx -u <url> -tech-detect -status-code -no-color` for
  quick liveness and tech detection.
- Route brute forcing (only if link/bundle extraction was insufficient):
  `ffuf -u <url>/FUZZ -w <small wordlist> -mc 200,301,302,401,403,500 -rate 50`
  with a small focused wordlist. Keep the rate polite; this is recon.
- Host-level scanning, ONLY when the engagement explicitly covers the host
  (not just the web app): `nmap -Pn --top-ports 100 -sV -T3 <host>`. Read it
  as: open ports, service versions, and nothing more. No OS detection, no
  script scanning (`-sC`), no aggressive timing; those are validation-phase
  techniques at the earliest, and behind the approval gateway if intrusive.
- nuclei detection templates are NOT a recon tool here: severity filtering
  does not make templates non-intrusive, and active templates would violate
  the recon doctrine. If you want a nuclei pass, treat it as a VALIDATE-phase
  hypothesis generator: each hit needs a manual, minimal PoC before it can
  count, and any intrusive template requires gateway approval first.
- Never run: sqlmap, exploit frameworks, credential brute force, fuzzers at
  high rates, or anything that writes to the target during recon.

## Evidence

Save evidence as you go, not at the end:

- `/workspace/truestrike-report/evidence/recon/<topic>.txt` for command
  outputs (one file per topic: routes, headers, tech, auth surface).
- Include the exact command used at the top of each evidence file.

## Output of this phase

Before moving to VALIDATE you should be able to state, with evidence files to
back each claim:

1. What the application is (stack, framework, major features).
2. Every endpoint discovered, with method and auth requirement.
3. Every input vector worth probing, with an example benign request.
4. The auth model and its visible mechanics.
   Anything less complete: keep reconning or say so explicitly.
