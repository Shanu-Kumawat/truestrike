# TrueStrike

Autonomous, human-approved web pentest agent running on
[TrueForge](https://github.com/truefoundry/trueforge). Point it at an authorized
target: it recons the attack surface, proves vulnerabilities with working PoCs
inside an isolated [Daytona](https://www.daytona.io/) sandbox, **pauses for your
approval before anything intrusive**, and writes a CVSS-scored pentest report.

Built for the WeMakeDevs Agent Harness Hackathon (Aug 2026).

> **Status:** end-to-end scans work against the local demo target. Docs:
> [docs/project.md](docs/project.md) · [docs/architecture.md](docs/architecture.md) ·
> [docs/demo-target.md](docs/demo-target.md) · [docs/qodo-workflow.md](docs/qodo-workflow.md)

## How it works

```
operator
   |  truestrike scan <url> (CLI: live event stream, approve/deny prompts,
   |                        crash-safe resume)
   v
TrueForge harness (agent loop, subagents, approval gates, persistent sessions)
   |-- exploit-gateway MCP server: intrusive actions need explicit human
   |   approval; each approval mints a one-time, audited authorizationId
   '-- Daytona sandbox (toolchain snapshot: nmap, nuclei, httpx, ffuf, sqlmap)
         |
         v
   authorized target (demo: local Juice Shop via the Cloudflare relay,
   see docs/demo-target.md)
```

Every finding in the report is backed by a PoC that actually executed in the
sandbox; unproven hypotheses never make it into the machine-readable findings.

## Quickstart

Prerequisites: Node >= 22, pnpm, Docker, a TrueForge server
(`npx @truefoundry/trueforge`) with a model provider and the Daytona sandbox
provider configured (Settings in the TrueForge UI), and a Daytona API key.

```bash
pnpm install
cp .env.example .env    # fill in your keys - never commit .env
pnpm check              # typecheck + lint + format + tests
```

One-time sandbox setup (builds the security-toolchain snapshot in Daytona and
the TrueForge provider adopts it):

```bash
# from a trueforge checkout's packages/trueforge-core (resolves @daytona/sdk):
DAYTONA_API_KEY=... node <this-repo>/scripts/create-toolchain-snapshot.mjs \
  <this-repo>/sandbox/overlay.Dockerfile trueforge-build-<digest>
# digest = tag of the image pinned in sandbox/overlay.Dockerfile
```

Run a scan against the demo target (full relay setup in
[docs/demo-target.md](docs/demo-target.md)):

```bash
scripts/demo-target.sh start        # local Juice Shop
pnpm truestrike gateway             # approval-gated MCP server (keep running)
pnpm truestrike scan <demo-url>     # scan; approvals prompt inline
pnpm truestrike scan --resume       # resume after a crash or disconnect
```

Scope is locked to loopback targets by default; the only extension mechanism is
`TRUESTRIKE_ALLOW_HOSTS` (used for the demo relay hostname). Exit codes: 0
clean, 1 error, 2 findings (2 lands with the report pipeline).

## Safety

TrueStrike only ever acts against explicitly authorized targets, executes all
tooling inside an ephemeral cloud sandbox (never on your machine), and requires
human approval before intrusive actions; every approval is logged with a
one-time authorizationId in an audit trail. Never point it at systems you don't
own or have written permission to test.

## Qodo Code Review Evidence

_Every substantive change in this repo goes through a Qodo-reviewed pull request.
A representative merged PR and review narrative will be linked here before
submission._

## License

Apache-2.0
