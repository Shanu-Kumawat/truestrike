# TrueStrike - Project Definition

## Problem

Security testing is either manual and slow, or automated and noisy. Scanners dump
unverified findings; autonomous pentest agents prove real exploits but demand a
multi-GB local container, deep Docker setup, and trust in a black-box swarm
running on your own machine with host-level network caps. There is no middle
ground: an agent that _proves_ vulnerabilities with working PoCs, runs everything
in a throwaway isolated sandbox, and **stops to ask a human before doing anything
intrusive**.

## What TrueStrike does

Point it at an authorized web target and it runs a full pentest loop:

1. **Recon** - subagent maps the attack surface (ports, tech, endpoints, routes)
   using nmap/httpx/ffuf/nuclei executed inside a Daytona sandbox.
2. **Validation** - for each candidate finding, a subagent builds and executes a
   proof-of-concept _inside the sandbox_ - findings are proven, not guessed.
3. **Approval gate** - before any intrusive/exploit action, the agent pauses and
   asks the operator, showing exactly what will run. Nothing irreversible happens
   without an explicit human `allow`.
4. **Report** - a reporting subagent writes a CVSS 3.1-scored markdown pentest
   report with validated PoC evidence for every finding.

The session is persistent and resumable; a scan survives restarts and reconnects.

## Who it's for

Developers and small security teams who want a real, verified pentest of their own
app without standing up offensive tooling on their machine - and without giving an
AI unsupervised license to attack.

## Why TrueForge (not a from-scratch harness)

TrueForge provides the agent loop, dynamic subagents, approval-gated tools, MCP
tool connectivity, git-backed skills, sandboxed code execution (Daytona), and
resumable persistent sessions. TrueStrike's own code is the domain layer: the
pentest orchestration spec, skills, sandbox toolchain, event-driven CLI, and
report pipeline. Strix proved the workflow; TrueForge lets us build it properly.

## Related work

Autonomous pentest tooling (e.g. [Strix](https://github.com/usestrix/strix) and
similar agents) proved the workflow works - but couples itself to brittle,
host-local container setups with no human-in-the-loop control. TrueStrike builds
that workflow class on a proper agent harness instead: ephemeral isolated
sandboxes, approval gates as a first-class primitive, and a thin domain layer
(orchestration spec, skills, toolchain, reporting) instead of a bespoke runtime.
All code in this repo is original.

## Scope

**In scope (hackathon MVP):**

- Black-box testing of a single authorized web target (demo: local OWASP Juice Shop)
- Recon → validation → approval-gated exploitation → report, end to end
- Custom slim Daytona snapshot with a curated security toolchain
- CLI driving the TrueForge SDK: live event stream, interactive approvals
- Persistent/resumable scan session
- Markdown pentest report (CVSS 3.1, PoC evidence)

**Explicitly out of scope:**

- White-box/SAST, source-code analysis, CI/PR-diff scanning
- Multi-target campaigns, network ranges beyond the single authorized target
- Traffic proxying (Caido-style), encrypted/PDF reporting, hosted deployment
- A custom web UI (TrueForge's built-in UI is the secondary view)

## Success = the final demo

A 3-minute video: launch scan against Juice Shop → watch recon tools run in the
sandbox → candidate finding → **agent pauses for approval, operator approves** →
PoC executes in isolation and validates → report generated. Every second of that
run shows the harness doing real work: tools reached, code sandboxed, human in
control, subagents delegating.
