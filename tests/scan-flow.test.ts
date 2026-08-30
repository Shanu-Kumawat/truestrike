import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import type { TrueForge } from '@truefoundry/trueforge-sdk';
import type { PendingCall } from '../src/agent/approvals.js';
import { consumeCreatedTurn, driveScan } from '../src/cli.js';
import { loadScanState } from '../src/session-store.js';

type Event = { data: TrueForgeApi.TurnStreamingEvent; id?: string };

interface ScriptedTurn {
  /** Events yielded through withMetadata(), in order. */
  events: Event[];
  /** Async hook invoked after the consumer processed event at this index. */
  observeAfterIndex?: { index: number; observe: () => Promise<void> };
}

function scriptedStream(turn: ScriptedTurn): unknown {
  return {
    withMetadata: () => {
      let index = -1;
      return (async function* (): AsyncIterable<Event> {
        for (const event of turn.events) {
          index += 1;
          yield event;
          const hook = turn.observeAfterIndex;
          if (hook && index === hook.index) {
            await hook.observe();
          }
        }
      })();
    },
  };
}

/**
 * Minimal SDK client double: every createTurnStream call pops the next
 * scripted turn and records the input it was called with.
 */
function scriptedClient(turns: ScriptedTurn[]): {
  client: TrueForge;
  inputs: TrueForgeApi.TurnInputItem[][];
} {
  const queue = [...turns];
  const inputs: TrueForgeApi.TurnInputItem[][] = [];
  const client = {
    sessions: {
      createTurnStream: async (
        _sessionId: string,
        request: { input: TrueForgeApi.TurnInputItem[] },
      ) => {
        inputs.push(request.input);
        const turn = queue.shift();
        if (turn === undefined) {
          throw new Error('createTurnStream called more times than scripted');
        }
        return scriptedStream(turn);
      },
    },
  };
  return { client: client as unknown as TrueForge, inputs };
}

function turnCreatedEvent(id: string, turnId: string): Event {
  return {
    id,
    data: {
      type: 'turn.created',
      id,
      createdAt: '2026-08-29T10:00:00.000Z',
      threadId: null,
      turnId,
      previousTurnId: null,
      input: [],
      state: { status: 'running' },
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function approvalRequiredEvent(id: string, callId: string, sourceEventId: string): Event {
  return {
    id,
    data: {
      type: 'tool.approval_required',
      id,
      createdAt: '2026-08-29T10:00:01.000Z',
      threadId: 'main',
      toolCalls: [{ id: callId, sourceEventId }],
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function modelMessageWithToolCall(id: string, callId: string): Event {
  return {
    id,
    data: {
      type: 'model.message',
      id,
      createdAt: '2026-08-29T10:00:00.500Z',
      threadId: 'main',
      content: '',
      toolCalls: [
        {
          id: callId,
          type: 'function',
          function: {
            name: 'request_intrusive_approval',
            arguments:
              '{"action":"sqli-probe","command":"sqlmap -u http://localhost:3000","rationale":"validate"}',
          },
          toolInfo: {
            type: 'mcp',
            name: 'request_intrusive_approval',
            serverId: 'srv-1',
            serverName: 'truestrike-gateway',
          },
        },
      ],
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function deltaEvent(id: string, baseId: string, content: string): Event {
  return {
    id,
    data: {
      type: 'model.message.delta',
      id: baseId,
      createdAt: '2026-08-29T10:00:00.400Z',
      threadId: 'main',
      content,
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function modelMessageBase(id: string): Event {
  return {
    id,
    data: {
      type: 'model.message',
      id,
      createdAt: '2026-08-29T10:00:00.300Z',
      threadId: 'main',
      content: '',
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function toolResponseEvent(id: string, seq: number): Event {
  return {
    id,
    data: {
      type: 'tool.response',
      id,
      createdAt: '2026-08-29T10:00:01.000Z',
      threadId: 'main',
      toolCallId: `call-${seq}`,
      content: `result ${seq}`,
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function threadCreatedEvent(id: string): Event {
  return {
    id,
    data: {
      type: 'thread.created',
      id,
      createdAt: '2026-08-29T10:00:00.700Z',
      threadId: 'thread-1',
      title: 'recon subagent',
      parent: { threadId: 'main', toolCallId: 'call-0' },
      agentInfo: { type: 'dynamic', name: 'recon', input: 'map the surface' },
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function threadDoneEvent(id: string): Event {
  return {
    id,
    data: {
      type: 'thread.done',
      id,
      createdAt: '2026-08-29T10:00:00.800Z',
      threadId: 'thread-1',
      state: { status: 'done' },
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function turnDoneEvent(id: string, state: TrueForgeApi.TurnDoneEventState): Event {
  return {
    id,
    data: {
      type: 'turn.done',
      id,
      createdAt: '2026-08-29T10:00:02.000Z',
      threadId: null,
      state,
    } as unknown as TrueForgeApi.TurnStreamingEvent,
  };
}

function pausedTurnDoneEvent(id: string): Event {
  return turnDoneEvent(id, {
    status: 'done',
    output: null,
    requiredActions: [],
    completedAt: '2026-08-29T10:00:02.000Z',
  });
}

function completedTurnDoneEvent(id: string, content: string): Event {
  return turnDoneEvent(id, {
    status: 'done',
    output: {
      type: 'model.message',
      id: 'final',
      threadId: 'main',
      content,
    } as unknown as TrueForgeApi.ModelMessageEvent,
    requiredActions: [],
    metrics: { totalTokens: 321, totalCostInUsd: 0.02 },
    completedAt: '2026-08-29T10:00:02.000Z',
  });
}

describe('driveScan integration (scripted event streams)', () => {
  let statePath: string;

  beforeEach(() => {
    statePath = join(tmpdir(), `truestrike-ts17-${randomUUID()}.json`);
    process.env.TRUESTRIKE_STATE_FILE = statePath;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.TRUESTRIKE_STATE_FILE;
    await rm(statePath, { force: true });
  });

  const startedAt = '2026-08-29T09:55:00.000Z';
  const initialInput: TrueForgeApi.TurnInputItem[] = [
    { type: 'user.message', content: 'Begin the engagement.' },
  ];

  it('resolves an approval pause, resumes with the decision, and completes', async () => {
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    const loggedLines: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      loggedLines.push(args.map(String).join(' '));
    });

    const pausedTurn: ScriptedTurn = {
      events: [
        turnCreatedEvent('1', 'turn-paused'),
        modelMessageBase('2'),
        deltaEvent('3', '2', 'Recon st'),
        deltaEvent('4', '2', 'arted.\n'),
        threadCreatedEvent('5'),
        threadDoneEvent('6'),
        modelMessageWithToolCall('7', 'call-1'),
        approvalRequiredEvent('8', 'call-1', '7'),
        pausedTurnDoneEvent('9'),
      ],
    };
    const completingTurn: ScriptedTurn = {
      events: [
        turnCreatedEvent('1', 'turn-final'),
        modelMessageBase('2'),
        deltaEvent('3', '2', 'Done.'),
        completedTurnDoneEvent('4', 'Done.'),
      ],
    };
    const { client, inputs } = scriptedClient([pausedTurn, completingTurn]);

    const observedCalls: PendingCall[] = [];
    const decide = async (call: PendingCall): Promise<boolean> => {
      observedCalls.push(call);
      // Between rounds: state must hold the paused turn at cursor 0
      // (persisted at turn.created; fewer than 20 events, so no flush yet).
      const midState = await loadScanState(statePath);
      expect(midState).toMatchObject({
        sessionId: 'sess-1',
        turnId: 'turn-paused',
        lastSequenceNumber: 0,
      });
      return true;
    };

    const outcome = await driveScan(
      'sess-1',
      'http://localhost:3000/',
      client,
      decide,
      startedAt,
      (onTurnCreated, onProgress) =>
        consumeCreatedTurn('sess-1', initialInput, client, onTurnCreated, onProgress),
    );

    expect(outcome).toEqual({ code: 0, finalTurnId: 'turn-final', completed: true });

    // Delta fragments streamed to the operator merge into the full reply.
    expect(stdoutChunks.join('')).toContain('Recon started.\n');
    // Subagent lifecycle events render as they arrive (thread.done carries
    // no title, so the thread id renders).
    const logged = loggedLines.join('\n');
    expect(logged).toContain('[subagent started] recon subagent');
    expect(logged).toContain('[subagent finished] thread-1');
    stdoutSpy.mockRestore();
    logSpy.mockRestore();

    // The operator decision was resolved from the event index.
    expect(observedCalls).toEqual([
      {
        threadId: 'main',
        toolCallId: 'call-1',
        toolName: 'request_intrusive_approval',
        serverName: 'truestrike-gateway',
        args: '{"action":"sqli-probe","command":"sqlmap -u http://localhost:3000","rationale":"validate"}',
      },
    ]);

    // Round 2 resumed with exactly one allow approval for the pending call.
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual(initialInput);
    expect(inputs[1]).toEqual([
      {
        type: 'user.tool_approval',
        threadId: 'main',
        toolCallId: 'call-1',
        approval: { status: 'allow' },
      },
    ]);

    // Clean completion clears the resume state.
    expect(await loadScanState(statePath)).toBeUndefined();
  });

  it('denied approvals resume with a deny decision and reason', async () => {
    const pausedTurn: ScriptedTurn = {
      events: [
        turnCreatedEvent('1', 'turn-paused'),
        modelMessageWithToolCall('2', 'call-1'),
        approvalRequiredEvent('3', 'call-1', '2'),
        pausedTurnDoneEvent('4'),
      ],
    };
    const completingTurn: ScriptedTurn = {
      events: [
        turnCreatedEvent('1', 'turn-final'),
        completedTurnDoneEvent('2', 'Denied and finished.'),
      ],
    };
    const { client, inputs } = scriptedClient([pausedTurn, completingTurn]);

    const outcome = await driveScan(
      'sess-1',
      'http://localhost:3000/',
      client,
      async () => false,
      startedAt,
      (onTurnCreated, onProgress) =>
        consumeCreatedTurn('sess-1', initialInput, client, onTurnCreated, onProgress),
    );

    expect(outcome.code).toBe(0);
    expect(inputs[1]).toEqual([
      {
        type: 'user.tool_approval',
        threadId: 'main',
        toolCallId: 'call-1',
        approval: { status: 'deny', reason: 'denied by operator' },
      },
    ]);
  });

  it('flushes the resume cursor every 20 non-delta events, deltas not counted', async () => {
    // Layout: turn.created, then 20 (tool.response, delta) pairs, then
    // turn.done. Non-delta events: 1 + 20 = 21; the flush trips exactly on
    // the 20th non-delta event (the 19th tool response, stream index 37,
    // stream id 38). Interleaved deltas carry higher ids but must NOT count
    // toward the interval: if they did, the flushed cursor at index 37 would
    // be a stale, smaller value.
    const events: Event[] = [turnCreatedEvent('1', 'turn-cursor')];
    for (let k = 1; k <= 20; k += 1) {
      events.push(toolResponseEvent(String(2 * k), k));
      events.push(deltaEvent(String(2 * k + 1), '2', `chunk ${k} `));
    }
    events.push(completedTurnDoneEvent('42', 'Cursor flush verified.'));

    const observed: Array<{ turnId: string; lastSequenceNumber: number }> = [];
    const turn: ScriptedTurn = {
      events,
      observeAfterIndex: {
        index: 37,
        // Poll until the queued flush lands (bounded); a fixed sleep would
        // flake under slow runners or filesystems.
        observe: async () => {
          const deadline = Date.now() + 2000;
          for (;;) {
            const state = await loadScanState(statePath);
            if (state && state.lastSequenceNumber >= 20) {
              observed.push({ turnId: state.turnId, lastSequenceNumber: state.lastSequenceNumber });
              return;
            }
            if (Date.now() > deadline) {
              throw new Error(
                `cursor flush did not land within 2s (last state: ${JSON.stringify(state ?? null)})`,
              );
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        },
      },
    };
    const { client } = scriptedClient([turn]);

    const outcome = await driveScan(
      'sess-1',
      'http://localhost:3000/',
      client,
      async () => true,
      startedAt,
      (onTurnCreated, onProgress) =>
        consumeCreatedTurn('sess-1', initialInput, client, onTurnCreated, onProgress),
    );

    expect(outcome.code).toBe(0);
    expect(observed).toEqual([{ turnId: 'turn-cursor', lastSequenceNumber: 38 }]);
    expect(await loadScanState(statePath)).toBeUndefined();
  });

  it('seeds the final turn id from knownTurnId when turn.created is not replayed', async () => {
    // A resumed running turn subscribes mid-flight: no turn.created event.
    const turn: ScriptedTurn = {
      events: [toolResponseEvent('30', 30), completedTurnDoneEvent('31', 'Resumed and finished.')],
    };
    const { client } = scriptedClient([turn]);

    const outcome = await driveScan(
      'sess-1',
      'http://localhost:3000/',
      client,
      async () => true,
      startedAt,
      (onTurnCreated, onProgress) =>
        consumeCreatedTurn('sess-1', initialInput, client, onTurnCreated, onProgress),
      'turn-known',
    );

    expect(outcome).toEqual({ code: 0, finalTurnId: 'turn-known', completed: true });
    // turn.created never arrived, but the state still records the known turn.
    expect((await loadScanState(statePath))?.turnId).toBeUndefined();
  });

  it('cancelled turns exit non-zero and clear state', async () => {
    const turn: ScriptedTurn = {
      events: [
        turnCreatedEvent('1', 'turn-cancelled'),
        turnDoneEvent('2', {
          status: 'cancelled',
          reason: 'server-execution-timeout',
          completedAt: '2026-08-29T10:10:00.000Z',
        }),
      ],
    };
    const { client } = scriptedClient([turn]);

    const outcome = await driveScan(
      'sess-1',
      'http://localhost:3000/',
      client,
      async () => true,
      startedAt,
      (onTurnCreated, onProgress) =>
        consumeCreatedTurn('sess-1', initialInput, client, onTurnCreated, onProgress),
    );

    expect(outcome).toEqual({ code: 1, finalTurnId: 'turn-cancelled', completed: false });
    expect(await loadScanState(statePath)).toBeUndefined();
  });
});
