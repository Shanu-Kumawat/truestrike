import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuthorizationLedger } from '../../src/gateway/authorizations.js';
import type { ApprovalRecord, AuditSink } from '../../src/gateway/authorizations.js';

class CollectingSink implements AuditSink {
  readonly records: (ApprovalRecord | { authorizationId: string; outcome: string })[] = [];
  async write(
    record: ApprovalRecord | { authorizationId: string; outcome: string },
  ): Promise<void> {
    this.records.push(record);
  }
}

describe('AuthorizationLedger', () => {
  it('mints unique authorization ids and writes an audit record', async () => {
    const sink = new CollectingSink();
    const ledger = new AuthorizationLedger(sink);
    const id1 = await ledger.mint({ action: 'a', command: 'c', rationale: 'r' });
    const id2 = await ledger.mint({ action: 'a', command: 'c', rationale: 'r' });
    expect(id1).not.toBe(id2);
    expect(ledger.isConsumable(id1)).toBe(true);
    expect(sink.records).toHaveLength(2);
    expect(sink.records[0]).toMatchObject({ action: 'a', command: 'c', rationale: 'r' });
  });

  it('consumes an authorization exactly once and links the outcome', async () => {
    const sink = new CollectingSink();
    const ledger = new AuthorizationLedger(sink);
    const id = await ledger.mint({ action: 'a', command: 'c', rationale: 'r' });
    await ledger.consume(id, 'confirmed', 'response dump');
    expect(ledger.isConsumable(id)).toBe(false);
    expect(ledger.has(id)).toBe(true);
    expect(sink.records).toHaveLength(2);
    expect(sink.records[1]).toMatchObject({ outcome: 'confirmed', evidence: 'response dump' });
  });

  it('rejects unknown and already-consumed authorization ids', async () => {
    const ledger = new AuthorizationLedger(new CollectingSink());
    await expect(ledger.consume('nope', 'o', 'e')).rejects.toThrow(/Unknown authorization/);
    const id = await ledger.mint({ action: 'a', command: 'c', rationale: 'r' });
    await ledger.consume(id, 'o', 'e');
    await expect(ledger.consume(id, 'o', 'e')).rejects.toThrow(/already used/);
  });

  it('keeps the authorization consumable when the audit write fails', async () => {
    let attempts = 0;
    const flaky: AuditSink = {
      write: async () => {
        attempts += 1;
        if (attempts === 2) {
          throw new Error('transient failure');
        }
      },
    };
    const ledger = new AuthorizationLedger(flaky);
    const id = await ledger.mint({ action: 'a', command: 'c', rationale: 'r' });

    await expect(ledger.consume(id, 'o', 'e')).rejects.toThrow(/transient failure/);
    expect(ledger.isConsumable(id)).toBe(true);

    await expect(ledger.consume(id, 'o', 'e')).resolves.toBeInstanceOf(Object);
    expect(ledger.isConsumable(id)).toBe(false);
    expect(attempts).toBe(3);
  });
});

describe('AuthorizationLedger.restore', () => {
  it('rebuilds open and consumed state from a JSONL audit log', async () => {
    const log = [
      JSON.stringify({
        authorizationId: 'open-1',
        action: 'a',
        command: 'c',
        rationale: 'r',
        approvedAt: 't',
      }),
      JSON.stringify({
        authorizationId: 'used-1',
        action: 'a',
        command: 'c',
        rationale: 'r',
        approvedAt: 't',
        outcome: 'o',
        evidence: 'e',
        recordedAt: 't2',
      }),
      'not json',
    ].join('\n');
    const path = join(tmpdir(), `truestrike-test-${randomUUID()}.jsonl`);
    await writeFile(path, log, 'utf8');
    try {
      const ledger = await AuthorizationLedger.restore(new CollectingSink(), path);
      expect(ledger.isConsumable('open-1')).toBe(true);
      expect(ledger.isConsumable('used-1')).toBe(false);
      expect(ledger.has('used-1')).toBe(true);
      expect(ledger.isConsumable('missing')).toBe(false);
    } finally {
      await rm(path, { force: true });
    }
  });

  it('returns an empty ledger when the audit log does not exist', async () => {
    const ledger = await AuthorizationLedger.restore(
      new CollectingSink(),
      join(tmpdir(), `missing-${randomUUID()}.jsonl`),
    );
    expect(ledger.has('anything')).toBe(false);
  });
});
