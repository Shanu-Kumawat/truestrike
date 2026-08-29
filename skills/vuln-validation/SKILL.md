# Vulnerability validation

Use this skill during the VALIDATE phase. Its job: turn recon hypotheses into
proven findings (or discard them) with working, evidence-backed
proof-of-concepts executed inside the sandbox against the authorized target.

## Prime directive

A finding without a working PoC is a hypothesis, not a finding. Your value is
measured in demonstrated impact, not in scanner output or speculation.

## Discipline

### One hypothesis at a time

Work candidates sequentially: state the hypothesis, design the smallest test
that could prove or disprove it, run it, record the result, move on. Parallel
probing produces muddled evidence.

### Read-only first

Start every validation with the least intrusive test that could work:

- GET requests with benign payloads before anything active.
- Manual curl/python requests you fully understand before tooling.
- Inspect responses directly instead of trusting tool verdicts.

Escalate only when read-only tests are insufficient to prove or discard.

### Seek counterevidence

Actively try to DISPROVE each hypothesis:

- Check whether the "vulnerability" is intended behavior.
- Test the same input on endpoints where it should be blocked.
- Look for mitigations (WAF, encoding, parameterized paths) that make the
  issue unexploitable in practice.
  A finding that survives honest counterevidence is worth reporting; one that
  does not is a discarded line in the report narrative.

### Capture evidence continuously

- Save full request and response pairs under
  `/workspace/truestrike-report/evidence/<finding-id>/` (one directory per
  candidate, named before you know whether it will pan out).
- Evidence must be reproducible: exact commands, exact payloads, timestamps.
- Screenshots do not exist here; text artifacts are your proof.

## Severity discipline

- Score what was DEMONSTRATED, not what is theoretically possible.
- If your PoC proves partial impact, score the partial impact and describe
  the escalation path as a hypothesis.
- Never inflate: a medium proven well beats a critical speculated loudly.

## Intrusive actions: the gateway is mandatory

Some validations require genuinely intrusive steps (active SQL injection data
extraction, authentication bypass attempts, file-retrieval bypasses, forgery
attempts). For those:

1. Call `request_intrusive_approval` with the exact action name, the exact
   command you intend to run, and a rationale that explains what it proves.
2. Wait for the harness to pause and the operator to approve. The tool
   returns an `authorizationId` only after explicit human approval.
3. Execute exactly the approved command in the sandbox. If you need to vary
   the command materially, request a new approval instead of improvising.
4. Call `record_exploit_outcome` exactly once with the same authorizationId,
   the result, and the strongest evidence excerpt.
5. If approval is denied, record that in the report narrative and move on.

Never route an intrusive action around the gateway by running it as a plain
sandbox command. The sandbox is for building and testing PoCs, not for
evading human control.

## What gets reported

- CONFIRMED: the PoC executed and demonstrated the impact. Goes into
  findings.json with status "confirmed".
- PROBABLE: a PoC executed but was inconclusive. Status "probable" only, with
  an explicit statement of what is missing. Use sparingly and honestly.
- UNDEMONSTRATED: everything else. Narrative only. Never findings.json.

If VALIDATE produces nothing provable, that is a legitimate outcome: say so
in the report with the evidence of what you tried.
