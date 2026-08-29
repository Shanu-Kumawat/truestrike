import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DEFAULT_STATE_PATH = '.truestrike/last-scan.json';

export interface ScanState {
  sessionId: string;
  turnId: string;
  lastSequenceNumber: number;
  target: string;
  savedAt: string;
  /** Engagement start (ISO); scopes audit-appendix entries to this scan. */
  startedAt: string;
}

export function statePathFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return env.TRUESTRIKE_STATE_FILE?.trim() || DEFAULT_STATE_PATH;
}

/**
 * Persists the identity of the in-flight scan so a disconnected CLI can
 * resume it. Lives under `.truestrike/` (gitignored).
 */
export async function saveScanState(
  state: Omit<ScanState, 'savedAt'>,
  filePath: string = statePathFromEnv(),
): Promise<void> {
  const record: ScanState = { ...state, savedAt: new Date().toISOString() };
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
}

/**
 * Loads the persisted scan state. Returns undefined when absent or corrupt
 * (a corrupt file must not wedge the CLI; a fresh scan is always available).
 */
export async function loadScanState(
  filePath: string = statePathFromEnv(),
): Promise<ScanState | undefined> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ScanState>;
    if (
      typeof parsed.sessionId === 'string' &&
      typeof parsed.turnId === 'string' &&
      typeof parsed.lastSequenceNumber === 'number' &&
      typeof parsed.target === 'string' &&
      typeof parsed.startedAt === 'string'
    ) {
      return {
        sessionId: parsed.sessionId,
        turnId: parsed.turnId,
        lastSequenceNumber: parsed.lastSequenceNumber,
        target: parsed.target,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
        startedAt: parsed.startedAt,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function clearScanState(filePath: string = statePathFromEnv()): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // already absent; nothing to clear
  }
}
