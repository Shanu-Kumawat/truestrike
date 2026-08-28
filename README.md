# TrueStrike

Autonomous, human-approved web pentest agent running on
[TrueForge](https://github.com/truefoundry/trueforge). Point it at an authorized
target: it recons the attack surface, proves vulnerabilities with working PoCs
inside an isolated [Daytona](https://www.daytona.io/) sandbox, **pauses for your
approval before anything intrusive**, and writes a CVSS-scored pentest report.

Built for the WeMakeDevs Agent Harness Hackathon (Aug 2026).

> **Status:** early development. Docs: [docs/project.md](docs/project.md) ·
> [docs/architecture.md](docs/architecture.md) · [docs/qodo-workflow.md](docs/qodo-workflow.md)

## Quickstart

```bash
# prerequisites: Node >= 22, pnpm, a running TrueForge server with a model
# provider and a Daytona sandbox provider configured (see docs/)
pnpm install
cp .env.example .env   # fill in your keys - never commit .env
pnpm check             # typecheck + lint + format + tests
```

```bash
# with TrueForge running (npx @truefoundry/trueforge) and a model provider
# configured in its Settings > Models:
pnpm truestrike scan http://localhost:3000
```

Scope is locked to loopback targets by default (the local Juice Shop demo);
extend it only via `TRUESTRIKE_ALLOW_HOSTS`.

## Safety

TrueStrike only ever acts against explicitly authorized targets, executes all
tooling inside an ephemeral sandbox, and requires human approval before intrusive
actions. Never point it at systems you don't own or have written permission to
test.

## Qodo Code Review Evidence

_Every substantive change in this repo goes through a Qodo-reviewed pull request.
A representative merged PR and review narrative will be linked here before
submission._

## License

Apache-2.0
