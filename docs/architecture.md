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
   ├── exploit-gateway MCP server (this repo, `truestrike gateway`):
   │     approval-gated intrusive tools, one-time audited authorizationIds
   ├── Skills (git-backed SKILL.md packs from this repo's skills/)
   └── Daytona sandbox  ←── all recon/validation/exploit execution
         (truestrike toolchain snapshot, adopted by name: see sandbox/)
         │ egress limited to an allowlist of essential services
         ▼
   authorized target
   (demo: local Juice Shop via the Cloudflare workers.dev relay, see
    docs/demo-target.md - the relay exists because *.workers.dev is on the
    sandbox allowlist and the target only runs on the operator's machine)
```

TrueForge is the harness: model calls, tool routing, subagent orchestration,
approval checkpoints, session persistence. TrueStrike never re-implements those -
it composes them through an AgentSpec and drives them through the SDK event stream.

## Layers in this repo

### `src/cli.ts` - operator entry point

`truestrike scan <url>`: creates (or resumes) a TrueForge session on the local
TrueForge server, streams turn events to the console, and renders approval
prompts. `scan --resume` reconnects to a running turn (or rebuilds a finished
one from the event log) after a crash or disconnect. Exit codes: 0 clean,
1 error, 2 findings (2 lands with the report pipeline).

### `src/agent/` - agent definition & approval handling

- `spec.ts` - the TrueStrike AgentSpec: model, orchestrator instructions
  (scope-locked, phase-driven, PoC-before-report doctrine, report-artifact
  contract), MCP servers, mandatory sandbox, subagents,
  `require_approval_for_tools` gates (`@write`/`@destructive`).
- `approvals.ts` - resolves paused `tool.approval_required` events into
  displayable calls (tool name, server, args) and builds the
  `user.tool_approval` resume inputs.

### `src/session-store.ts` - crash-safe resume state

Persists {sessionId, turnId, sequence cursor, target} as events arrive; on
`--resume` the CLI reconnects via `subscribeToTurn` or rebuilds from
`listTurnEvents`.

### `src/gateway/` - exploit-gateway MCP server

`truestrike gateway` runs a streamable-HTTP MCP server exposing the only
sanctioned channel for intrusive actions: `request_intrusive_approval` (mints
a one-time authorizationId after the harness pauses for explicit human
approval) and `record_exploit_outcome` (consumes the id exactly once). Every
approval and outcome lands in a JSONL audit trail; the report renders it as an
approved-actions appendix.

### `src/terminal.ts` - output sanitization

Tool results and approval prompts can carry target-influenced content; ANSI
escape sequences and control characters are stripped before printing.

### `src/report/` - findings -> report (TS-15, in progress)

Downloads `/workspace/truestrike-report/{pentest_report.md, findings.json}`
from the sandbox, validates the findings schema, renders the CVSS-scored
report with the approved-actions appendix, and maps exit codes.

### `skills/` - SKILL.md packs (TS-12, in progress)

Git-backed instruction packs the agent loads on demand: `web-recon`,
`vuln-validation`, `report-writing`.

### `sandbox/` - toolchain snapshot

`overlay.Dockerfile` extends the official TrueForge sandbox image (pinned
release digest, checksum-verified tool downloads) with nmap, sqlmap, and
pinned nuclei/httpx/ffuf. `scripts/create-toolchain-snapshot.mjs` builds it
directly in Daytona under the exact snapshot name TrueForge's provider derives
(`trueforge-build-<digest>`), which the provider then adopts - no registry
push or patched server needed. Deliberately **not** a full Kali image: fast
cold start, minimal attack surface of our own.

### `worker/` - Cloudflare relay

A tiny Workers proxy (`*.workers.dev` is on the sandbox egress allowlist) that
forwards to the operator's quick tunnel so the sandbox can reach the demo
target. See docs/demo-target.md.

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
   target(s); the CLI validates the target before session creation. This gates
   the initial target only: HTTP redirects or content-referenced hosts are NOT
   covered by CLI validation. In practice the Daytona sandbox's egress
   allowlist (essential services only) structurally blocks most off-scope
   hosts, but that is incidental infrastructure policy, not a TrueStrike
   control - treat redirects as a known limitation.
2. **Isolation** - execution happens in an ephemeral Daytona cloud sandbox,
   not on the operator's machine or network.
3. **Approval before intrusive** - the gateway makes intrusive actions
   structurally gated (`require_approval_for_tools`); the operator sees the
   exact tool call and arguments before allowing, and every approval is
   audited with a one-time authorizationId. Known boundary: raw sandbox shell
   commands are not harness-gateable (TrueForge only gates MCP tools), so the
   doctrine forbids routing intrusive actions around the gateway; a fully
   structural binding would need sandbox-side enforcement.
4. **No secrets in the sandbox** - model credentials live in TrueForge's provider
   store; the sandbox receives none.

## Test strategy

- Unit: spec construction, event merging/delta handling, approval resume logic,
  report rendering (vitest, SDK mocked).
- Integration: scripted turn against a recorded/mocked event stream.
- Manual/e2e: full scan vs local Juice Shop (not in CI - documented in docs/).
