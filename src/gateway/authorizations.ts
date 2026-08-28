import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface ApprovalRecord {
  authorizationId: string;
  action: string;
  command: string;
  rationale: string;
  approvedAt: string;
}

export interface OutcomeRecord extends ApprovalRecord {
  outcome: string;
  evidence: string;
  recordedAt: string;
}

export interface AuditSink {
  write: (record: ApprovalRecord | OutcomeRecord) => Promise<void>;
}

/** Appends one JSON line per record to a JSONL file. */
export class JsonlAuditWriter implements AuditSink {
  constructor(private readonly filePath: string) {}

  async write(record: ApprovalRecord | OutcomeRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }
}

function isOutcomeRecord(record: unknown): record is OutcomeRecord {
  return typeof record === 'object' && record !== null && 'outcome' in record;
}

/**
 * Tracks minted intrusive-action authorizations. An authorization is minted
 * when the (human-approved) gateway tool runs, and can be consumed exactly
 * once when its outcome is recorded. The ledger can be restored from the
 * JSONL audit log so a gateway restart does not strand approved actions.
 */
export class AuthorizationLedger {
  private readonly open = new Map<string, ApprovalRecord>();
  private readonly consumed = new Set<string>();

  constructor(private readonly sink: AuditSink) {}

  /**
   * Rebuilds ledger state from a JSONL audit log written by JsonlAuditWriter:
   * records without an outcome are open again; records with an outcome are
   * treated as consumed. Returns the number of records replayed.
   */
  static async restore(sink: AuditSink, auditLogPath: string): Promise<AuthorizationLedger> {
    const ledger = new AuthorizationLedger(sink);
    let raw: string;
    try {
      raw = await readFile(auditLogPath, 'utf8');
    } catch {
      return ledger;
    }
    for (const line of raw.split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (isOutcomeRecord(record) && typeof record.authorizationId === 'string') {
        ledger.consumed.add(record.authorizationId);
      } else if (
        typeof record === 'object' &&
        record !== null &&
        'authorizationId' in record &&
        typeof (record as ApprovalRecord).authorizationId === 'string' &&
        typeof (record as ApprovalRecord).action === 'string'
      ) {
        ledger.open.set((record as ApprovalRecord).authorizationId, record as ApprovalRecord);
      }
    }
    return ledger;
  }

  async mint(input: Omit<ApprovalRecord, 'authorizationId' | 'approvedAt'>): Promise<string> {
    const record: ApprovalRecord = {
      ...input,
      authorizationId: randomUUID(),
      approvedAt: new Date().toISOString(),
    };
    this.open.set(record.authorizationId, record);
    await this.sink.write(record);
    return record.authorizationId;
  }

  has(authorizationId: string): boolean {
    return this.open.has(authorizationId) || this.consumed.has(authorizationId);
  }

  isConsumable(authorizationId: string): boolean {
    return this.open.has(authorizationId);
  }

  /**
   * Marks an authorization used and writes the linked outcome. The outcome is
   * persisted before the id is marked consumed, so a failed audit write can be
   * retried instead of stranding the approved action. Throws when the id is
   * unknown or already used.
   */
  async consume(
    authorizationId: string,
    outcome: string,
    evidence: string,
  ): Promise<OutcomeRecord> {
    const base = this.open.get(authorizationId);
    if (!base) {
      throw new Error(
        this.consumed.has(authorizationId)
          ? `Authorization ${authorizationId} was already used`
          : `Unknown authorization ${authorizationId}`,
      );
    }
    const record: OutcomeRecord = {
      ...base,
      outcome,
      evidence,
      recordedAt: new Date().toISOString(),
    };
    await this.sink.write(record);
    this.open.delete(authorizationId);
    this.consumed.add(authorizationId);
    return record;
  }
}
