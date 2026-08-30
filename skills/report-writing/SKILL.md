# Report writing

Use this skill during the REPORT phase, when validation is complete and you
are writing the two required artifacts.

## Who executes this

Orchestrators: hand this to a reporting subagent together with the
consolidated findings and evidence paths, then review its draft before
emitting the final sandbox_artifacts block. Reporting subagents: write both
artifacts yourself from the evidence on disk, and return their paths plus a
one-paragraph summary of what you reported.

## The two artifacts (contract)

You must produce, inside the sandbox, before finishing:

1. `/workspace/truestrike-report/pentest_report.md` - the human-readable
   report.
2. `/workspace/truestrike-report/findings.json` - the machine-readable
   findings.

Then emit a fenced sandbox_artifacts block listing both files with absolute
paths so the operator's CLI can download them. Missing or malformed artifacts
are treated as process failures by the pipeline; produce them even when there
is nothing dramatic to report.

## Report structure (pentest_report.md)

Write in this order:

1. **Executive summary** - 3 to 6 sentences, plain language, no jargon walls:
   what was tested, what was found (count by severity), what matters most,
   and the single most urgent remediation.
2. **Scope** - the exact authorized target, what was tested, and explicitly
   what was NOT tested (areas the scope excluded or time did not cover).
3. **Methodology** - one short section: recon approach, validation approach,
   and that every confirmed finding has an executed PoC in the evidence
   directory.
4. **Findings** - one subsection per finding, ordered by severity (highest
   first), each containing:
   - Title with the finding id (F-001, F-002, ...).
   - Severity and CVSS 3.1 vector with its score.
   - The affected endpoint(s).
   - Description: the weakness in one paragraph.
   - Proof-of-concept: the exact steps or command, referencing the evidence
     file that contains the request/response.
   - Evidence excerpt: the decisive response content, quoted.
   - Impact: what an attacker gains, concretely.
   - Remediation: the specific fix, not a category of fixes.
5. **Unconfirmed hypotheses** - what you investigated and could not prove,
   with the reason (blocked, mitigated, inconclusive). Honest negatives
   build trust.
6. **Coverage statement** - what was covered and the boundaries of that
   coverage.

## findings.json rules

- One object per finding: id, title, severity (critical|high|medium|low|info),
  cvssVector (full CVSS:3.1 base vector), cvssScore, endpoint, poc, evidence,
  remediation, status.
- `status: "confirmed"` requires a PoC that executed and demonstrated impact.
- `status: "probable"` requires a PoC that executed but was inconclusive;
  state what is missing in the poc field.
- No guesses, no scanner noise, no undemonstrated hypotheses. An engagement
  with no findings still gets both files with an empty findings array and an
  explicit coverage statement.
- The pipeline recomputes every CVSS score from its vector; make sure the
  vector and the score agree, because the computed value wins.

## Severity calibration

- Score the demonstrated impact. SQL injection that extracts the users table
  is critical; the same injection limited to an error-based boolean oracle
  without data extraction is not, until you demonstrate the extraction.
- Reflect that calibration in the vector: scope and CIA impacts must match
  what the PoC actually showed.
- Consistency check: a "critical" severity with an impact paragraph about
  "potential" damage is a contradiction. Fix one or the other.

## Style

- Evidence over adjectives: every claim points at an artifact.
- Write for the developer who will fix it: exact endpoints, exact payloads,
  concrete remediation (parameterized queries, output encoding at the
  specific sink, access-control check at the specific handler).
- No filler ("we are pleased to report"), no fear-mongering, no padding.
- Plain punctuation only.
