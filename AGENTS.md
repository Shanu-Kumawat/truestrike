# AGENTS.md

Guidance for AI agents (and humans) working in this repository. Read this first.
If `.agents/memory/` exists locally, read it too - it holds per-machine working
context (hackathon brief, decision log, current state) that is intentionally not
committed.

## What this is

**TrueStrike** - an autonomous, human-approved web pentest agent that runs on
[TrueForge](https://github.com/truefoundry/trueforge) (TrueFoundry's open-source
agent harness) and executes all hands-on work inside an isolated Daytona sandbox.

Built for the WeMakeDevs Agent Harness Hackathon (Aug 24–30, 2026), targeting the
Double-O (Best Use of TrueForge) and Q Branch (Best Code Quality) tracks.

- Project definition & scope: [docs/project.md](docs/project.md)
- Architecture: [docs/architecture.md](docs/architecture.md)
- Review discipline: [docs/qodo-workflow.md](docs/qodo-workflow.md)

## Commands

```bash
pnpm install        # install deps (Node >= 22, pnpm via corepack)
pnpm typecheck      # tsc --noEmit (strict)
pnpm lint           # eslint
pnpm format:check   # prettier check (pnpm format to fix)
pnpm test           # vitest
pnpm check          # all of the above - must pass before opening a PR
```

## Workflow - PR-only, no exceptions

1. **Never commit directly to `main`.** Branch per task using the Linear issue ID:
   `TS-<issue>-short-slug` (e.g. `TS-14-approval-gate`), linked to a Linear issue.
2. `pnpm check` must pass locally before pushing.
3. Open a PR: title says what changed, description covers what + why, links the
   Linear issue. Keep PRs small enough to review in one sitting.
4. **Qodo reviews every substantive PR.** If it doesn't start, comment
   `/agentic_review`. Fix every valid High-severity finding; if a High finding is
   wrong/deferred/intentional, dismiss it in the Qodo thread **with a recorded
   reason**. Push fixes and re-run the review so the PR shows resolution.
5. The other teammate (not the author) gives final human review and merges.

## Code conventions

- TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- ESM only (`"type": "module"`), `verbatimModuleSyntax` - use `import type`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- No `any` escapes without a comment explaining why.
- Tests live in `tests/`, mirroring `src/` structure.

## Security rules (hard requirements)

- **Never commit secrets.** API keys go in `.env` (gitignored); `.env.example`
  documents names only. Check before every commit.
- **Scope allowlist.** The agent must only act against explicitly authorized
  targets. The demo target is a locally running OWASP Juice Shop instance -
  nothing else, ever, in committed code, tests, docs, or recordings.
- No personal data, keys, or internal URLs in code, docs, PRs, or demo material.

## Layout

```
src/        agent CLI, TrueForge SDK integration, report pipeline
skills/     SKILL.md packs loaded by the agent (web-recon, vuln-validation, ...)
sandbox/    Daytona snapshot definition (slim security toolchain image)
tests/      vitest suites
docs/       project definition, architecture, review discipline
```

`.agents/memory/` (gitignored, not listed above) is local per-machine working
context for AI agents; it is created during onboarding and never committed.
