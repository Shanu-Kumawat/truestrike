import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
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

/**
 * Tracks minted intrusive-action authorizations. An authorization is minted
 * when the (human-approved) gateway tool runs, and can be consumed exactly
 * once when its outcome is recorded.
 */
export class AuthorizationLedger {
  private readonly open = new Map<string, ApprovalRecord>();
  private readonly consumed = new Set<string>();

  constructor(private readonly sink: AuditSink) {}

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

  /** Marks an authorization used and writes the linked outcome. Throws when the id is unknown or already used. */
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
    this.open.delete(authorizationId);
    this.consumed.add(authorizationId);
    const record: OutcomeRecord = {
      ...base,
      outcome,
      evidence,
      recordedAt: new Date().toISOString(),
    };
    await this.sink.write(record);
    return record;
  }
}
