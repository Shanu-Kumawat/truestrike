# TrueForge findings from a week of real use

We built [TrueStrike](https://github.com/Shanu-Kumawat/truestrike), an
autonomous pentest agent, on TrueForge for the WeMakeDevs Agent Harness
Hackathon (Aug 2026). A week of real engagements surfaced the findings below.
Everything here is documented precisely because we could reproduce it or
verify it in source; each is queued for filing upstream as an issue, and we
are happy to send PRs for the docs-sized ones. The goal is the same as the
build: make the harness better.

## 1. No provider configured means a silent local sandbox (security)

**What we hit.** With no sandbox provider configured, the server runs all
agent tooling on the host through its local host-process sandbox - with no
warning in the logs and no banner in the UI. We ran scans for a day believing
they were isolated; the tell was that the "sandbox" could reach
`localhost:3000`.

**Repro.** Fresh server, configure a model, run any agent that executes code:
commands appear as host processes (ps aux), nothing flags it.

**Suggested fix.** Log a prominent warning and show a UI banner whenever a
code-executing agent runs without a configured sandbox provider; consider
making the local sandbox an explicit opt-in. Effort: small.

## 2. The sandbox image is compile-time pinned, and the adoption seam is undocumented

**What we hit.** The sandbox image reference (`sandboxImage.json`) is
rewritten by CI per release; provider settings accept only an API key and
tuning fields. There is no supported way to run a custom toolchain image.
Reading the Daytona provider source, we found the seam it leaves open: the
provider derives its snapshot name deterministically
(`trueforge-build-<image digest>`), and when snapshot creation hits a 409 it
treats the existing snapshot as its own build ("started by another server
replica") and adopts it - without verifying the contents. We used this
constructively: we built our toolchain image inside Daytona under the exact
derived name, and the provider adopted it as its own (no registry, no fork;
see our `sandbox/overlay.Dockerfile` and
`scripts/create-toolchain-snapshot.mjs`, which also verifies the adoption by
executing tools from the snapshot).

**Suggested fix.** Either honor a `SANDBOX_IMAGE_URI` env override when no
build metadata is persisted, or document the name-adoption semantics as a
bring-your-own-image mechanism (including the digest-matching requirement and
what adoption does and does not verify). Effort: small for the env override;
docs-only for the semantics.

## 3. The 10-minute turn timeout cancels turns silently

**What we hit.** `SERVER_EXECUTION_TIMEOUT_SECONDS` defaults to 600. A deep
agentic scan was cancelled mid-flight with reason `server-execution-timeout`
and no warning event beforehand; the client just sees the turn end. Nothing
in the docs suggests the default exists.

**Suggested fix.** Emit a grace warning event before the timeout lands,
document the env prominently, and allow a per-agent override in the
AgentSpec. Effort: medium.

## 4. Sandbox networking is undocumented (loopback reachability and egress allowlists)

**What we hit.** Two things every local-target user discovers the hard way:
(a) a cloud sandbox cannot reach services bound to the operator's loopback;
(b) sandbox egress runs through an allowlist of "essential services" (package
registries, GitHub, some CDN endpoints), and non-allowlisted domains fail
with 403s over HTTP and TLS resets over HTTPS. Our agent diagnosed the
allowlist from inside the sandbox before we understood it. Neither behavior
is documented; failures look like generic connection resets.

**Suggested fix.** A docs page on sandbox networking: loopback
unreachability, the egress allowlist, how to probe it from inside a sandbox,
and a sanctioned pattern for exposing local targets (we use a Cloudflare
Worker relay since `*.workers.dev` is allowlisted, and would contribute that
write-up). Effort: small-medium, docs.

## 5. Provider errors surface opaque and stripped of attribution

**What we hit.** A misconfigured model endpoint surfaces as a bare
"Internal server error" with no indication of which provider or what went
wrong. Separately, with model `opencode/hy-3-free` configured, the 401 error
read "Model hy3-free is not supported" - the provider prefix is stripped, so
attribution requires guessing which provider config to fix.

**Suggested fix.** Wrap provider call failures with the provider-qualified
model name and a hint taxonomy (bad key vs unreachable endpoint vs upstream
5xx), surfaced in the turn error state. Effort: medium.

## 6. The sandbox_artifacts download contract is undocumented

**What we hit.** `downloadSandboxFile` requires the requested path to be
listed in the assistant's `sandbox_artifacts` block - a contract we only
found in an SDK docstring. How the agent is expected to emit that block (and
that it gates downloads) appears nowhere in the docs or cookbook.

**Suggested fix.** Document the `sandbox_artifacts` block in the SDK and
sandbox docs with an example assistant message and the resulting download
call. Effort: small, docs.

## More where these came from

The full internal list has eighteen entries; the six above are the ones we
can document with clean, confirmed evidence. As we file them upstream we will
add links here.
