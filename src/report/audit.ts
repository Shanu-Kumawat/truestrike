import { readFile } from 'node:fs/promises';
import type { ApprovalRecord, OutcomeRecord } from '../gateway/authorizations.js';

export interface AuditEntry {
  approval: ApprovalRecord;
  outcome: OutcomeRecord | undefined;
}

/**
 * Loads the gateway audit trail and pairs each approval with its recorded
 * outcome (by authorizationId). Returns undefined when the audit file is
 * missing or unreadable so the report omits the appendix silently.
 *
 * When startedAtIso is provided, only approvals from that engagement are
 * included: the audit file is shared across scans, and a report must never
 * attribute a previous scan's intrusive actions to this one.
 */
export async function loadAuditEntries(
  auditLogPath: string,
  startedAtIso?: string,
): Promise<AuditEntry[] | undefined> {
  const startedAtMs = startedAtIso !== undefined ? Date.parse(startedAtIso) : undefined;
  if (startedAtIso !== undefined && Number.isNaN(startedAtMs)) {
    return undefined;
  }

  let raw: string;
  try {
    raw = await readFile(auditLogPath, 'utf8');
  } catch {
    return undefined;
  }

  const approvals = new Map<string, ApprovalRecord>();
  const outcomes = new Map<string, OutcomeRecord>();
  for (const line of raw.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof record.authorizationId !== 'string') {
      continue;
    }
    // Required fields only; anything malformed is skipped rather than
    // crashing report rendering for an otherwise completed scan.
    if (
      typeof record.action !== 'string' ||
      typeof record.command !== 'string' ||
      typeof record.approvedAt !== 'string' ||
      typeof record.rationale !== 'string'
    ) {
      continue;
    }
    if ('outcome' in record && typeof record.outcome === 'string') {
      outcomes.set(record.authorizationId, record as unknown as OutcomeRecord);
    } else {
      approvals.set(record.authorizationId, record as unknown as ApprovalRecord);
    }
  }

  const entries: AuditEntry[] = [];
  for (const [authorizationId, approval] of approvals) {
    if (startedAtMs !== undefined && Date.parse(approval.approvedAt) < startedAtMs) {
      continue;
    }
    entries.push({ approval, outcome: outcomes.get(authorizationId) });
  }
  return entries;
}

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('`', '\\`');
}

/**
 * Renders the "Approved intrusive actions" appendix section from the audit
 * trail. Returns undefined when there is nothing to show.
 */
export function renderAuditAppendix(entries: AuditEntry[]): string | undefined {
  if (entries.length === 0) {
    return undefined;
  }
  const lines = [
    '## Approved intrusive actions',
    '',
    'Every intrusive action below paused for explicit human approval through the',
    'exploit gateway before it executed; each approval is one-time and audited.',
    '',
    '| Action | Command | Approved at | Outcome |',
    '| --- | --- | --- | --- |',
  ];
  for (const entry of entries) {
    const outcome = entry.outcome
      ? `${entry.outcome.outcome} (${entry.outcome.recordedAt})`
      : 'outcome not recorded';
    lines.push(
      `| ${cell(entry.approval.action)} | ${cell(entry.approval.command)} | ${cell(entry.approval.approvedAt)} | ${cell(outcome)} |`,
    );
  }
  return lines.join('\n');
}
