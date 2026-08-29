import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TrueForge } from '@truefoundry/trueforge-sdk';
import { collectReport } from '../../src/report/pipeline.js';

function fakeClient(files: Record<string, string>, failures = false): TrueForge {
  return {
    sessions: {
      downloadSandboxFile: async (
        _sessionId: string,
        _turnId: string,
        request: { path: string },
      ) => {
        if (failures) {
          throw new Error('gone');
        }
        const content = files[request.path];
        if (content === undefined) {
          throw new Error(`no artifact at ${request.path}`);
        }
        return {
          arrayBuffer: async () => new TextEncoder().encode(content).buffer as ArrayBuffer,
        };
      },
    },
  } as unknown as TrueForge;
}

const validFinding = {
  id: 'F-001',
  title: 'Reflected XSS in search',
  severity: 'medium',
  cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N',
  cvssScore: 6.1,
  endpoint: 'http://localhost:3000/search?q=',
  poc: 'submit <script> payload',
  evidence: 'payload reflected unescaped',
  remediation: 'contextual output encoding',
  status: 'confirmed',
};

describe('collectReport', () => {
  const outputRoot = join(tmpdir(), `truestrike-report-test-${randomUUID()}`);

  it('writes report + findings and maps exit code 2 for findings', async () => {
    const client = fakeClient({
      '/workspace/truestrike-report/pentest_report.md': '# Report\n\nAgent wrote this.',
      '/workspace/truestrike-report/findings.json': JSON.stringify({
        findings: [validFinding, { ...validFinding, id: 'F-002', title: 'Second', cvssScore: 6.1 }],
      }),
    });
    const auditPath = join(outputRoot, 'audit.jsonl');
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      auditPath,
      JSON.stringify({
        authorizationId: 'a1',
        action: 'sqli-probe',
        command: 'sqlmap -u target',
        rationale: 'r',
        approvedAt: 't1',
      }) + '\n',
      'utf8',
    );

    const outcome = await collectReport(client, 'sess-1', 'turn-1', outputRoot, auditPath);
    expect(outcome.exitCode).toBe(2);
    expect(outcome.findingsCount).toBe(2);

    const report = await readFile(join(outputRoot, 'sess-1', 'pentest_report.md'), 'utf8');
    expect(report).toContain('Agent wrote this.');
    expect(report).toContain('## Approved intrusive actions');
    expect(report).toContain('sqli-probe');

    const findings = JSON.parse(
      await readFile(join(outputRoot, 'sess-1', 'findings.json'), 'utf8'),
    ) as { findings: Array<{ id: string }> };
    expect(findings.findings.map((f) => f.id)).toEqual(['F-001', 'F-002']);

    await rm(outputRoot, { recursive: true, force: true });
  });

  it('exit code 0 for zero findings', async () => {
    const outputRootEmpty = join(tmpdir(), `truestrike-report-test-${randomUUID()}`);
    const client = fakeClient({
      '/workspace/truestrike-report/pentest_report.md': '# Report',
      '/workspace/truestrike-report/findings.json': JSON.stringify({ findings: [] }),
    });
    const auditPath = join(outputRootEmpty, 'nonexistent.jsonl');
    const outcome = await collectReport(client, 'sess-2', 'turn-2', outputRootEmpty, auditPath);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.findingsCount).toBe(0);

    const report = await readFile(join(outputRootEmpty, 'sess-2', 'pentest_report.md'), 'utf8');
    expect(report).not.toContain('Approved intrusive actions');
    await rm(outputRootEmpty, { recursive: true, force: true });
  });

  it('warns and degrades when downloads fail', async () => {
    const client = fakeClient({}, true);
    const outcome = await collectReport(
      client,
      'sess-3',
      'turn-3',
      join(tmpdir(), `x-${randomUUID()}`),
      '/nonexistent/audit.jsonl',
    );
    expect(outcome.exitCode).toBe(0);
    expect(outcome.outputDir).toBeUndefined();
  });

  it('notes CVSS discrepancies and writes computed scores', async () => {
    const outputRootDisc = join(tmpdir(), `truestrike-report-test-${randomUUID()}`);
    const client = fakeClient({
      '/workspace/truestrike-report/pentest_report.md': '# Report',
      '/workspace/truestrike-report/findings.json': JSON.stringify({
        findings: [{ ...validFinding, cvssScore: 5.0 }],
      }),
    });
    const outcome = await collectReport(
      client,
      'sess-4',
      'turn-4',
      outputRootDisc,
      '/nonexistent/audit.jsonl',
    );
    expect(outcome.exitCode).toBe(2);
    const report = await readFile(join(outputRootDisc, 'sess-4', 'pentest_report.md'), 'utf8');
    expect(report).toContain('## CVSS score verification');
    expect(report).toContain('| F-001 | 5 | 6.1 |');
    const findings = JSON.parse(
      await readFile(join(outputRootDisc, 'sess-4', 'findings.json'), 'utf8'),
    ) as { findings: Array<{ cvssScore: number }> };
    expect(findings.findings[0]?.cvssScore).toBe(6.1);
    await rm(outputRootDisc, { recursive: true, force: true });
  });

  it('handles malformed findings.json without crashing', async () => {
    const outputRootBad = join(tmpdir(), `truestrike-report-test-${randomUUID()}`);
    const client = fakeClient({
      '/workspace/truestrike-report/pentest_report.md': '# Report',
      '/workspace/truestrike-report/findings.json': '{broken',
    });
    const outcome = await collectReport(
      client,
      'sess-5',
      'turn-5',
      outputRootBad,
      '/nonexistent/audit.jsonl',
    );
    expect(outcome.exitCode).toBe(0);
    expect(outcome.findingsCount).toBe(0);
    // The raw agent output is preserved for inspection, not replaced by a
    // fabricated empty findings.json.
    const raw = await readFile(join(outputRootBad, 'sess-5', 'findings.invalid.json'), 'utf8');
    expect(raw).toBe('{broken');
    await expect(
      readFile(join(outputRootBad, 'sess-5', 'findings.json'), 'utf8'),
    ).rejects.toThrow();
    await rm(outputRootBad, { recursive: true, force: true });
  });

  it('skips gracefully when there is no final turn', async () => {
    const client = fakeClient({});
    const outcome = await collectReport(
      client,
      'sess-6',
      undefined,
      join(tmpdir(), `x-${randomUUID()}`),
      '/nonexistent/audit.jsonl',
    );
    expect(outcome.exitCode).toBe(0);
  });
});
