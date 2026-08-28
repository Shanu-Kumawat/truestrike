import { describe, expect, it } from 'vitest';
import {
  AuthorizationLedger,
  type AuditSink,
  type ApprovalRecord,
} from '../../src/gateway/authorizations.js';

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
});
