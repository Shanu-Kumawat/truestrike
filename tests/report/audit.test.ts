import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuditEntries, renderAuditAppendix } from '../../src/report/audit.js';

function tempPath(): string {
  return join(tmpdir(), `truestrike-audit-test-${randomUUID()}.jsonl`);
}

const approval = (id: string, action: string): string =>
  JSON.stringify({
    authorizationId: id,
    action,
    command: `cmd-${id}`,
    rationale: 'why',
    approvedAt: '2026-08-29T10:00:00.000Z',
  });

describe('loadAuditEntries', () => {
  it('pairs approvals with their outcomes', async () => {
    const path = tempPath();
    try {
      await writeFile(
        path,
        [
          approval('a1', 'sqli-probe'),
          JSON.stringify({
            authorizationId: 'a1',
            action: 'sqli-probe',
            command: 'cmd-a1',
            rationale: 'why',
            approvedAt: '2026-08-29T10:00:00.000Z',
            outcome: 'confirmed',
            evidence: 'dump',
            recordedAt: '2026-08-29T10:01:00.000Z',
          }),
          approval('a2', 'bruteforce'),
          'garbage line {',
        ].join('\n'),
        'utf8',
      );
      const entries = await loadAuditEntries(path);
      expect(entries).toHaveLength(2);
      expect(entries?.[0]?.outcome?.outcome).toBe('confirmed');
      expect(entries?.[1]?.outcome).toBeUndefined();
    } finally {
      await rm(path, { force: true });
    }
  });

  it('returns undefined for a missing file', async () => {
    expect(await loadAuditEntries(tempPath())).toBeUndefined();
  });

  it('skips malformed records instead of crashing', async () => {
    const path = tempPath();
    try {
      await writeFile(
        path,
        [
          // Missing command/approvedAt: must be skipped, not rendered.
          JSON.stringify({ authorizationId: 'bad', action: 'no-cmd' }),
          approval('good', 'works'),
          JSON.stringify({ authorizationId: 'bad2', command: 'no-action' }),
        ].join('\n'),
        'utf8',
      );
      const entries = await loadAuditEntries(path);
      expect(entries).toHaveLength(1);
      expect(entries?.[0]?.approval.action).toBe('works');
    } finally {
      await rm(path, { force: true });
    }
  });

  it('excludes approvals from before startedAt (previous scans)', async () => {
    const path = tempPath();
    try {
      await writeFile(
        path,
        [approval('old', 'old-scan-action'), approval('new', 'this-scan-action')]
          .map((line, index) =>
            line.replace(
              '"approvedAt":"2026-08-29T10:00:00.000Z"',
              `"approvedAt":"${index === 0 ? '2026-08-28T10:00:00.000Z' : '2026-08-29T11:00:00.000Z'}"`,
            ),
          )
          .join('\n'),
        'utf8',
      );
      const entries = await loadAuditEntries(path, '2026-08-29T10:30:00.000Z');
      expect(entries).toHaveLength(1);
      expect(entries?.[0]?.approval.action).toBe('this-scan-action');
    } finally {
      await rm(path, { force: true });
    }
  });
});

describe('renderAuditAppendix', () => {
  it('renders a table with outcomes', () => {
    const rendered = renderAuditAppendix([
      {
        approval: {
          authorizationId: 'a1',
          action: 'sqli-probe',
          command: 'sqlmap -u http://localhost:3000/rest/products',
          rationale: 'validate injection',
          approvedAt: '2026-08-29T10:00:00.000Z',
        },
        outcome: {
          authorizationId: 'a1',
          action: 'sqli-probe',
          command: 'sqlmap -u http://localhost:3000/rest/products',
          rationale: 'validate injection',
          approvedAt: '2026-08-29T10:00:00.000Z',
          outcome: 'confirmed',
          evidence: 'dump',
          recordedAt: '2026-08-29T10:01:00.000Z',
        },
      },
      {
        approval: {
          authorizationId: 'a2',
          action: 'pipe|table',
          command: 'cmd with | `tick` and\nnewline',
          rationale: 'r',
          approvedAt: '2026-08-29T10:05:00.000Z',
        },
        outcome: undefined,
      },
    ]);
    expect(rendered).toContain('## Approved intrusive actions');
    expect(rendered).toContain('sqli-probe');
    expect(rendered).toContain('confirmed (2026-08-29T10:01:00.000Z)');
    expect(rendered).toContain('outcome not recorded');
    expect(rendered).toContain('pipe\\|table');
    expect(rendered).toContain('cmd with \\| \\`tick\\` and');
    expect(rendered).not.toContain('cmd with | `tick`');
  });

  it('returns undefined for an empty trail', () => {
    expect(renderAuditAppendix([])).toBeUndefined();
  });
});
