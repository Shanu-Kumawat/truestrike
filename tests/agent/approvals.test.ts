import { describe, expect, it } from 'vitest';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import {
  buildApprovalInput,
  collectPendingCalls,
  describePendingCall,
} from '../../src/agent/approvals.js';

function modelMessageWithCall(
  eventId: string,
  call: { id: string; name: string; args: string },
): TrueForgeApi.ModelMessageEvent {
  return {
    type: 'model.message',
    id: eventId,
    threadId: 'main',
    content: '',
    toolCalls: [
      {
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.args },
        toolInfo: { type: 'mcp', name: call.name, serverId: 'srv-1', serverName: 'gateway' },
      },
    ],
  } as unknown as TrueForgeApi.ModelMessageEvent;
}

describe('collectPendingCalls', () => {
  const index = new Map<string, TrueForgeApi.TurnStreamingEvent>([
    [
      'msg-1',
      modelMessageWithCall('msg-1', { id: 'call-1', name: 'run_exploit', args: '{"x":1}' }),
    ],
  ]);

  const approvalEvent = {
    type: 'tool.approval_required',
    id: 'apr-1',
    threadId: 'main',
    toolCalls: [{ id: 'call-1', sourceEventId: 'msg-1' }],
  } as unknown as TrueForgeApi.ToolApprovalRequiredEvent;

  it('resolves tool name, server, and args from the event index', () => {
    const pending = collectPendingCalls([approvalEvent], index);
    expect(pending).toEqual([
      {
        threadId: 'main',
        toolCallId: 'call-1',
        toolName: 'run_exploit',
        serverName: 'gateway',
        args: '{"x":1}',
      },
    ]);
  });

  it('skips refs whose source event or call is missing', () => {
    const dangling = {
      ...approvalEvent,
      id: 'apr-2',
      toolCalls: [
        { id: 'call-1', sourceEventId: 'msg-missing' },
        { id: 'call-missing', sourceEventId: 'msg-1' },
      ],
    } as unknown as TrueForgeApi.ToolApprovalRequiredEvent;
    expect(collectPendingCalls([dangling], index)).toEqual([]);
  });
});

describe('buildApprovalInput', () => {
  const call = {
    threadId: 'main',
    toolCallId: 'call-1',
    toolName: 'run_exploit',
    serverName: 'gateway',
    args: '{}',
  };

  it('builds an allow decision', () => {
    expect(buildApprovalInput(call, true)).toEqual({
      type: 'user.tool_approval',
      threadId: 'main',
      toolCallId: 'call-1',
      approval: { status: 'allow' },
    });
  });

  it('builds a deny decision with a reason', () => {
    expect(buildApprovalInput(call, false)).toEqual({
      type: 'user.tool_approval',
      threadId: 'main',
      toolCallId: 'call-1',
      approval: { status: 'deny', reason: 'denied by operator' },
    });
  });
});

describe('describePendingCall', () => {
  it('includes tool name, server, and args', () => {
    expect(
      describePendingCall({
        threadId: 'main',
        toolCallId: 'c',
        toolName: 'run_exploit',
        serverName: 'gateway',
        args: '{"target":"x"}',
      }),
    ).toBe('run_exploit (server: gateway) {"target":"x"}');
  });

  it('truncates long arguments', () => {
    const described = describePendingCall({
      threadId: 'main',
      toolCallId: 'c',
      toolName: 't',
      serverName: undefined,
      args: 'a'.repeat(500),
    });
    expect(described.length).toBeLessThan(230);
    expect(described.endsWith('...')).toBe(true);
  });
});
