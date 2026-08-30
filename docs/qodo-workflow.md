# Qodo Review Discipline

Required for every submission of the hackathon - and the basis of our Q Branch
(Best Code Quality) entry. Direct pushes to `main` do not count as reviewed work.

## Setup (done once, before PR #1)

1. Sign in at https://app.qodo.ai/signin
2. Integrations -> SaaS -> GitHub -> Add installation -> authorize
   `Shanu-Kumawat/truestrike`
3. Open a PR - Qodo reviews automatically. Fallback trigger: comment
   `/agentic_review` on the PR.

## Per-PR rules

1. Every substantive change goes through a PR. No direct commits to `main`.
2. **High-severity findings:** fix them, or dismiss in the Qodo thread with a
   recorded reason (wrong / intentionally deferred / expected behavior).
3. **Medium/Low:** engineering judgment, but decide consciously.
4. After pushing fixes, re-run the review (`/agentic_review`) so the PR history
   shows what was resolved or dismissed.
5. The non-author teammate gives the final human review and merges.
6. PR hygiene: title states the change, description covers what + why, scope
   small enough to review in one sitting, Linear issue linked.

## How it actually went (the numbers)

12 substantive PRs, every one Qodo-reviewed before merge, roughly 47 findings
raised across the trail. All fixed or dismissed on the record. Highlights:

- **PR #1** (CLI skeleton): High-severity cancelled-turn exit-code bug, plus
  credential-in-URL disclosure we fixed by rejecting such targets outright.
- **PR #7** (toolchain snapshot): the review pushed us from trusting
  name-adoption to **definitive verification** - the script now boots a
  throwaway sandbox from the snapshot and executes `nuclei -version` to prove
  the toolchain actually landed.
- **PR #8** (report pipeline): round 1 caught audit-trail cross-contamination
  between engagements (a security fix: engagement-scoped audit appendix), a
  CVSS spec-typo, and report-write failures masking the findings exit code.
- **PR #11** (skills library): 14 findings, the biggest being a **systemic
  security-boundary rewrite** across all 15 skill packs (a uniform
  detect/exploit rule: detection probes flow free; extraction, authentication
  attempts, state writes, and command execution all go through the gateway).

## What Qodo caught that we did not expect

Round 2 of PR #11 flagged a finding we had marked FIXED in round 1 - and Qodo
was right: our edit script had aborted before reaching the file, so the fix
never landed while our PR comment claimed it had. The correction is on the
record in the thread. A reviewer that verifies claims against the code, not
just the diff, earned its trust that day.

## False positives, handled honestly

Not every finding was real. Stale-index findings (citing pre-fix code at
post-fix line numbers) and re-assertions of dismissed design decisions
recurred across rounds. Each dismissal carries line-level evidence in the PR
thread - grep output, cited files, tests - because a dismissal without a
reason reads as ignoring the reviewer.

## README evidence (required before submission)

The README's `## Qodo Code Review Evidence` section links PR #1 as the
representative merged PR, states what Qodo surfaced and what we changed or
intentionally dismissed, and points to the full trail across all 12 PRs. The
public PR links are the proof; judges may inspect any merge.
