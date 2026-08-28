import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearScanState, loadScanState, saveScanState } from '../src/session-store.js';

function tempPath(): string {
  return join(tmpdir(), `truestrike-test-${randomUUID()}.json`);
}

describe('scan state store', () => {
  it('roundtrips a saved state', async () => {
    const path = tempPath();
    try {
      await saveScanState(
        {
          sessionId: 'sess-1',
          turnId: 'turn-1',
          lastSequenceNumber: 42,
          target: 'http://localhost:3000/',
        },
        path,
      );
      const loaded = await loadScanState(path);
      expect(loaded).toMatchObject({
        sessionId: 'sess-1',
        turnId: 'turn-1',
        lastSequenceNumber: 42,
        target: 'http://localhost:3000/',
      });
      expect(loaded?.savedAt).toBeTruthy();
    } finally {
      await rm(path, { force: true });
    }
  });

  it('returns undefined for a missing file', async () => {
    expect(await loadScanState(tempPath())).toBeUndefined();
  });

  it('returns undefined for corrupt JSON instead of wedging the CLI', async () => {
    const path = tempPath();
    try {
      await writeFile(path, '{not json', 'utf8');
      expect(await loadScanState(path)).toBeUndefined();
    } finally {
      await rm(path, { force: true });
    }
  });

  it('returns undefined when required fields are missing', async () => {
    const path = tempPath();
    try {
      await writeFile(path, JSON.stringify({ sessionId: 'only' }), 'utf8');
      expect(await loadScanState(path)).toBeUndefined();
    } finally {
      await rm(path, { force: true });
    }
  });

  it('clears state and tolerates a missing file', async () => {
    const path = tempPath();
    await saveScanState({ sessionId: 's', turnId: 't', lastSequenceNumber: 1, target: 'x' }, path);
    await clearScanState(path);
    expect(await loadScanState(path)).toBeUndefined();
    await expect(clearScanState(path)).resolves.toBeUndefined();
  });
});
