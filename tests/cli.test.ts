import { describe, expect, it } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { USAGE, loadGatewayOptions, parseArgs, rebuildTurnFromEvents } from '../src/cli.js';

describe('parseArgs', () => {
  it('parses a scan command with its target', () => {
    expect(parseArgs(['scan', 'http://localhost:3000'])).toEqual({
      command: 'scan',
      targetUrl: 'http://localhost:3000',
      resume: false,
    });
  });

  it('parses the resume flag without a target', () => {
    expect(parseArgs(['scan', '--resume'])).toEqual({ command: 'scan', resume: true });
  });

  it('rejects --resume combined with a target', () => {
    expect(parseArgs(['scan', '--resume', 'http://localhost:3000'])).toEqual({ usage: true });
  });

  it('parses the gateway command without extra arguments', () => {
    expect(parseArgs(['gateway'])).toEqual({ command: 'gateway' });
  });

  it('returns usage for missing or wrong commands', () => {
    expect(parseArgs([])).toEqual({ usage: true });
    expect(parseArgs(['scan'])).toEqual({ usage: true });
    expect(parseArgs(['recon', 'http://localhost:3000'])).toEqual({ usage: true });
    expect(parseArgs(['gateway', 'extra'])).toEqual({ usage: true });
  });
});

describe('loadGatewayOptions', () => {
  it('applies defaults', () => {
    expect(loadGatewayOptions({})).toEqual({ port: 8815, auditLogPath: '.truestrike/audit.jsonl' });
  });

  it('reads overrides from the environment', () => {
    expect(
      loadGatewayOptions({ TRUESTRIKE_GATEWAY_PORT: '9100', TRUESTRIKE_AUDIT_LOG: '/tmp/a.jsonl' }),
    ).toEqual({ port: 9100, auditLogPath: '/tmp/a.jsonl' });
  });

  it('rejects invalid ports', () => {
    expect(() => loadGatewayOptions({ TRUESTRIKE_GATEWAY_PORT: 'notaport' })).toThrow(
      /TRUESTRIKE_GATEWAY_PORT/,
    );
    expect(() => loadGatewayOptions({ TRUESTRIKE_GATEWAY_PORT: '99999' })).toThrow(
      /TRUESTRIKE_GATEWAY_PORT/,
    );
  });
});

describe('USAGE', () => {
  it('documents the scan command and required model env', () => {
    expect(USAGE).toContain('truestrike scan <target-url>');
    expect(USAGE).toContain('TRUESTRIKE_MODEL');
    expect(USAGE).not.toMatch(/—|…/);
  });
});

function fakeEvents(events: TrueForgeApi.SessionEvent[]): AsyncIterable<TrueForgeApi.SessionEvent> {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

describe('rebuildTurnFromEvents', () => {
  it('rebuilds a finished turn: turn id, final output, and metrics', async () => {
    let createdTurnId = '';
    const result = await rebuildTurnFromEvents(
      fakeEvents([
        {
          type: 'turn.created',
          id: 'e1',
          createdAt: '',
          threadId: null,
          turnId: 'turn-9',
          state: { status: 'running' },
        },
        {
          type: 'turn.done',
          id: 'e2',
          createdAt: '',
          threadId: null,
          state: {
            status: 'done',
            output: { type: 'model.message', id: 'm1', threadId: 'main', content: 'final reply' },
            requiredActions: [],
            metrics: { totalTokens: 123, totalCostInUsd: 0.01 },
          },
        },
      ] as unknown as TrueForgeApi.SessionEvent[]),
      (turnId) => {
        createdTurnId = turnId;
      },
    );
    expect(createdTurnId).toBe('turn-9');
    expect(result.turnId).toBe('turn-9');
    expect(result.turnStatus).toBe('done');
    expect(result.metrics?.totalTokens).toBe(123);
    expect(result.pendingApprovals).toHaveLength(0);
  });

  it('rebuilds a paused turn with resolvable pending approvals', async () => {
    const result = await rebuildTurnFromEvents(
      fakeEvents([
        {
          type: 'turn.created',
          id: 'e1',
          createdAt: '',
          threadId: null,
          turnId: 'turn-10',
          state: { status: 'running' },
        },
        {
          type: 'model.message',
          id: 'msg-1',
          createdAt: '',
          threadId: 'main',
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'run_exploit', arguments: '{}' },
              toolInfo: { type: 'mcp', name: 'run_exploit', serverId: 's', serverName: 'gateway' },
            },
          ],
        },
        {
          type: 'tool.approval_required',
          id: 'e2',
          createdAt: '',
          threadId: 'main',
          toolCalls: [{ id: 'call-1', sourceEventId: 'msg-1' }],
        },
        {
          type: 'turn.done',
          id: 'e3',
          createdAt: '',
          threadId: null,
          state: { status: 'done', output: null, requiredActions: [] },
        },
      ] as unknown as TrueForgeApi.SessionEvent[]),
    );
    expect(result.turnStatus).toBe('done');
    expect(result.pendingApprovals).toHaveLength(1);
    // The approval resolver can name the gated call from the rebuilt index.
    const { collectPendingCalls } = await import('../src/agent/approvals.js');
    const pending = collectPendingCalls(result.pendingApprovals, result.eventIndex);
    expect(pending[0]?.toolName).toBe('run_exploit');
  });
});
