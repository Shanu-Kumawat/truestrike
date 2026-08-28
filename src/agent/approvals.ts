import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

/** A single gated tool call awaiting an operator decision. */
export interface PendingCall {
  threadId: string;
  toolCallId: string;
  toolName: string;
  serverName: string | undefined;
  /** Raw JSON arguments of the call, for display. */
  args: string;
}

function isModelMessage(
  event: TrueForgeApi.TurnStreamingEvent | undefined,
): event is TrueForgeApi.ModelMessageEvent {
  return event?.type === 'model.message';
}

function toolInfoName(call: TrueForgeApi.ToolCall): { toolName: string; serverName?: string } {
  const info = call.toolInfo;
  if (info.type === 'mcp') {
    return { toolName: info.name, serverName: info.serverName };
  }
  return { toolName: info.name };
}

/**
 * Resolves every pending approval into a displayable call description.
 *
 * `tool.approval_required` events only carry references (`sourceEventId` +
 * `toolCallId`); the actual tool name and arguments live on the
 * `model.message` event that emitted the call, which the stream consumer
 * keeps in `eventIndex`.
 */
export function collectPendingCalls(
  approvalEvents: TrueForgeApi.ToolApprovalRequiredEvent[],
  eventIndex: Map<string, TrueForgeApi.TurnStreamingEvent>,
): PendingCall[] {
  const pending: PendingCall[] = [];
  for (const approvalEvent of approvalEvents) {
    for (const ref of approvalEvent.toolCalls) {
      const source = eventIndex.get(ref.sourceEventId);
      if (!isModelMessage(source)) {
        continue;
      }
      const call = source.toolCalls?.find((c) => c.id === ref.id);
      if (!call) {
        continue;
      }
      const { toolName, serverName } = toolInfoName(call);
      pending.push({
        threadId: approvalEvent.threadId,
        toolCallId: ref.id,
        toolName,
        serverName,
        args: call.function.arguments ?? '',
      });
    }
  }
  return pending;
}

/**
 * Builds the resume-turn input item for one operator decision.
 * Pure; never throws on odd input.
 */
export function buildApprovalInput(
  call: PendingCall,
  allow: boolean,
  denyReason = 'denied by operator',
): TrueForgeApi.UserToolApprovalEvent {
  return {
    type: 'user.tool_approval',
    threadId: call.threadId,
    toolCallId: call.toolCallId,
    approval: allow ? { status: 'allow' } : { status: 'deny', reason: denyReason },
  };
}

/** One-line human-readable summary of a pending call for the approval prompt. */
export function describePendingCall(call: PendingCall): string {
  const server = call.serverName ? ` (server: ${call.serverName})` : '';
  const args = call.args.length > 200 ? `${call.args.slice(0, 200)}...` : call.args;
  return `${call.toolName}${server} ${args}`;
}
