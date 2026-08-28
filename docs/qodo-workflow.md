# Qodo Review Discipline

Required for every submission of the hackathon - and the basis of our Q Branch
(Best Code Quality) entry. Direct pushes to `main` do not count as reviewed work.

## Setup (once, repo admin)

1. Sign in at https://app.qodo.ai/signin
2. Integrations → SaaS → GitHub → Add installation → authorize
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

## README evidence (before submission)

The README must contain a `## Qodo Code Review Evidence` section with:

- A link to at least one representative **merged** PR with meaningful code
- 1–2 sentences on what Qodo surfaced and what we changed or intentionally dismissed
- The PR history showing review → decisions → follow-up review on final code

Judges may inspect other merges to confirm Qodo was part of the build, not a
one-time step. Keep the trail real from day one.
