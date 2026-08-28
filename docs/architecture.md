# TrueStrike - Architecture

## Overview

```
operator
   │  truestrike scan <target-url>
   ▼
TrueStrike CLI (TypeScript, this repo)
   │  @truefoundry/trueforge-sdk (sessions / turn streams / approvals)
   ▼
TrueForge server (local: npx @truefoundry/trueforge)
   │  agent loop: model ↔ tools ↔ subagents ↔ approvals ↔ session store
   ├── MCP servers (web search, ...)
   ├── Skills (git-backed SKILL.md packs from this repo's skills/)
   └── Daytona sandbox  ←── all recon/validation/exploit execution
         (custom truestrike snapshot: nmap, nuclei, httpx, ffuf, sqlmap, python)
```

TrueForge is the harness: model calls, tool routing, subagent orchestration,
approval checkpoints, session persistence. TrueStrike never re-implements those -
it composes them through an AgentSpec and drives them through the SDK event stream.

## Layers in this repo

### `src/cli.ts` - operator entry point

`truestrike scan <url>`: creates (or resumes) a TrueStrike session on the local
TrueForge server, streams turn events to the console, and renders approval
prompts. Exit code 2 when validated findings exist (CI-friendly).

### `src/agent/` - agent definition & event handling

- `spec.ts` - the TrueStrike AgentSpec: model, orchestrator instructions
  (scope-locked, phase-driven, PoC-before-report doctrine), MCP servers, skills,
  sandbox config, `require_approval_for_tools` on all intrusive actions
  (`@write`/`@destructive` tags plus explicit exploit runners).
- `events.ts` - turn-stream consumer: merges `model.message` deltas, renders
  tool activity per thread (root + subagents), surfaces `tool.approval_required`
  as an interactive approve/deny prompt, and resumes with `user.tool_approval`.
  Handles reconnects via persisted sequence numbers (`subscribeToTurn`).

### `src/report/` - findings → report

Collects validated findings from the turn stream / session events and renders
`pentest_report.md`: summary, CVSS 3.1 vectors + scores, PoC evidence, remediation.

### `skills/` - SKILL.md packs

Git-backed instruction packs the agent loads on demand:

- `web-recon` - attack-surface mapping doctrine (ports → tech → endpoints → params)
- `vuln-validation` - PoC construction rules: prove it in the sandbox or don't report it
- `report-writing` - report structure, CVSS calibration, evidence requirements

### `sandbox/` - Daytona snapshot

Dockerfile defining the `truestrike-sandbox` image: slim Debian base + curated
toolchain (nmap, nuclei, httpx, ffuf, sqlmap, python3, curl, jq). Built once as a
Daytona snapshot; every scan provisions an isolated instance. Deliberately **not**
a full Kali image - fast cold start, minimal attack surface of our own.

## Key TrueForge mechanics we rely on

| Capability          | How TrueStrike uses it                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- |
| Dynamic subagents   | Root orchestrator spawns recon / validation / reporting subagents (≤5 parallel)         |
| Tool approval gates | Intrusive/exploit tools require human approval; CLI renders the pause interactively     |
| Sandbox-as-a-tool   | All command execution and PoC runs happen inside the Daytona sandbox, never on the host |
| Skills              | Pentest doctrine loaded from this repo, not hardcoded into one mega-prompt              |
| Persistent sessions | Scan resumable across restarts; sequence-number stream resume on disconnect             |
| MCP tools           | External reach (e.g. web search for payload/CVE research) without bespoke clients       |

## Safety model

1. **Scope allowlist** - the orchestrator instructions carry the authorized
   target(s); the CLI validates the target before session creation.
2. **Isolation** - execution happens in an ephemeral Daytona sandbox, not on the
   operator's machine or network.
3. **Approval before intrusive** - exploitation is gated; the operator sees the
   exact command/tool call and its arguments before allowing.
4. **No secrets in the sandbox** - model credentials live in TrueForge's provider
   store; the sandbox receives none.

## Test strategy

- Unit: spec construction, event merging/delta handling, approval resume logic,
  report rendering (vitest, SDK mocked).
- Integration: scripted turn against a recorded/mocked event stream.
- Manual/e2e: full scan vs local Juice Shop (not in CI - documented in docs/).
