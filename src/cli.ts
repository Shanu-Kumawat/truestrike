import { TrueForge, isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { buildScanSpec } from './agent/spec.js';
import { buildApprovalInput, collectPendingCalls, describePendingCall } from './agent/approvals.js';
import type { PendingCall } from './agent/approvals.js';
import { TargetScopeError, validateTarget } from './target.js';
import { sanitizeForTerminal } from './terminal.js';

export const USAGE = `Usage:
  truestrike scan <target-url>    run a scan against the authorized target
  truestrike gateway              start the exploit-gateway MCP server

Environment:
  TRUESTRIKE_MODEL        model in provider/model form (required, e.g. openai/gpt-5)
  TRUEFORGE_BASE_URL      TrueForge server (default http://localhost:8790)
  TRUEFORGE_TOKEN         OIDC ID token (hosted servers only)
  TRUESTRIKE_ALLOW_HOSTS  comma-separated extra authorized hosts
  TRUESTRIKE_SANDBOX      enable the Daytona sandbox (default: 1)
  TRUESTRIKE_MCP_SERVERS  comma-separated MCP server names to attach
  TRUESTRIKE_GATEWAY_PORT port for the gateway MCP server (default 8815)
  TRUESTRIKE_AUDIT_LOG    gateway audit log path (default .truestrike/audit.jsonl)
`;

export interface GatewayOptions {
  port: number;
  auditLogPath: string;
}

export function loadGatewayOptions(env: NodeJS.ProcessEnv = process.env): GatewayOptions {
  const port = Number.parseInt(env.TRUESTRIKE_GATEWAY_PORT ?? '8815', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid TRUESTRIKE_GATEWAY_PORT: "${env.TRUESTRIKE_GATEWAY_PORT ?? ''}"`);
  }
  return {
    port,
    auditLogPath: env.TRUESTRIKE_AUDIT_LOG?.trim() || '.truestrike/audit.jsonl',
  };
}

export async function runGateway(): Promise<number> {
  const { startGatewayServer } = await import('./gateway/server.js');
  const options = loadGatewayOptions();
  const handle = await startGatewayServer(options.port, options.auditLogPath);
  console.log(`Exploit-gateway MCP server listening on http://127.0.0.1:${handle.port}/mcp`);
  console.log(`Audit log: ${options.auditLogPath}`);
  console.log('Add this URL as an MCP connector in TrueForge (Settings > Connectors).');
  const shutdown = async (): Promise<void> => {
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  return 0;
}

export function parseArgs(
  argv: string[],
): { command: 'scan'; targetUrl: string } | { command: 'gateway' } | { usage: true } {
  const [command, targetUrl] = argv;
  if (command === 'gateway' && targetUrl === undefined) {
    return { command: 'gateway' };
  }
  if (command !== 'scan' || !targetUrl) {
    return { usage: true };
  }
  return { command: 'scan', targetUrl };
}

/** Operator decision callback: resolve one pending call to allow/deny. */
export type DecisionFn = (call: PendingCall) => Promise<boolean>;

async function promptDecision(call: PendingCall): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    rl.write('');
    const answer = await rl.question(
      `\n[approval required] ${describePendingCall(call)}\nApprove? [y/N] `,
    );
    return ['y', 'yes'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

interface StreamResult {
  turnStatus: 'done' | 'cancelled' | 'error';
  errorMessage: string | undefined;
  metrics: TrueForgeApi.TurnMetrics | undefined;
  pendingApprovals: TrueForgeApi.ToolApprovalRequiredEvent[];
  streamedAssistantText: boolean;
  eventIndex: Map<string, TrueForgeApi.TurnStreamingEvent>;
}

async function consumeStream(
  sessionId: string,
  input: TrueForgeApi.TurnInputItem[],
  client: TrueForge,
): Promise<StreamResult> {
  const result: StreamResult = {
    turnStatus: 'done',
    errorMessage: undefined,
    metrics: undefined,
    pendingApprovals: [],
    streamedAssistantText: false,
    eventIndex: new Map(),
  };
  const events = result.eventIndex;

  const stream = await client.sessions.createTurnStream(sessionId, { input });
  for await (const { data: event } of stream.withMetadata()) {
    if (isEventDelta(event)) {
      const base = events.get(event.id);
      if (base) {
        mergeEventDelta(base, event);
      }
      if (event.type === 'model.message.delta' && event.threadId === 'main') {
        if (event.content) {
          result.streamedAssistantText = true;
        }
        process.stdout.write(event.content ?? '');
      }
      continue;
    }

    events.set(event.id, event);

    switch (event.type) {
      case 'thread.created':
        console.log(`\n[subagent started] ${event.title}`);
        break;
      case 'thread.done':
        console.log(`\n[subagent finished] ${event.title ?? event.threadId}`);
        break;
      case 'tool.response':
        console.log(
          `\n[tool result] ${sanitizeForTerminal(String(event.content ?? '')).slice(0, 200)}`,
        );
        break;
      case 'sandbox.created':
        console.log(`\n[sandbox provisioned] ${event.sandboxId}`);
        break;
      case 'mcp.auth_required':
        console.log('\n[mcp auth required] authorize the listed servers, then resume');
        break;
      case 'tool.approval_required':
        result.pendingApprovals.push(event);
        break;
      case 'turn.done': {
        const state = event.state;
        result.turnStatus = state.status;
        if (state.status === 'done') {
          // The reply already streamed via deltas; only print when it did not.
          if (state.output && !result.streamedAssistantText) {
            console.log(`\n${state.output.content ?? ''}`);
          }
          result.metrics = state.metrics;
        }
        if (state.status === 'error') {
          result.errorMessage = state.message;
        }
        break;
      }
      default:
        break;
    }
  }
  return result;
}

export async function runScan(
  targetUrl: string,
  decide: DecisionFn = promptDecision,
): Promise<number> {
  const config = loadConfig();
  const target = validateTarget(targetUrl, config.extraAllowedHosts);

  const client = new TrueForge({
    baseUrl: config.baseUrl,
    timeoutInSeconds: 600,
    ...(config.token ? { token: config.token } : {}),
  });

  console.log(`TrueStrike - authorized target: ${target}`);
  console.log(`Connecting to TrueForge at ${config.baseUrl} (model: ${config.model})\n`);

  const { data: session } = await client.sessions.create({
    agent: {
      spec: buildScanSpec(target, {
        model: config.model,
        sandbox: config.sandbox,
        mcpServers: config.mcpServers,
      }),
    },
  });
  console.log(`Session: ${session.id}\n`);

  let input: TrueForgeApi.TurnInputItem[] = [
    {
      type: 'user.message',
      content: `Begin the security engagement for the authorized target ${target}.`,
    },
  ];

  const MAX_APPROVAL_ROUNDS = 25;
  for (let round = 0; round < MAX_APPROVAL_ROUNDS; round++) {
    const result = await consumeStream(session.id, input, client);

    if (result.turnStatus === 'cancelled') {
      console.error('Turn cancelled');
      return 1;
    }
    if (result.turnStatus === 'error') {
      // Do not resume an errored turn, even if approval events were streamed
      // before the failure; resuming is only defined for paused turns.
      console.error(`Turn error: ${result.errorMessage ?? 'unknown'}`);
      return 1;
    }

    // A paused turn ends with status 'done' (output null, required actions
    // set); approvals were collected from tool.approval_required events
    // during the stream. No pending approvals means the turn truly finished.
    const pending = collectPendingCalls(result.pendingApprovals, result.eventIndex);
    if (pending.length === 0) {
      if (result.metrics) {
        console.log(
          `\n(tokens: ${result.metrics.totalTokens ?? '?'}, ` +
            `cost: $${result.metrics.totalCostInUsd ?? '?'})`,
        );
      }
      return 0;
    }

    const approvals: TrueForgeApi.UserToolApprovalEvent[] = [];
    for (const call of pending) {
      const allow = await decide(call);
      console.error(
        `${allow ? 'Approved' : 'Denied'}: ${sanitizeForTerminal(describePendingCall(call))}`,
      );
      approvals.push(buildApprovalInput(call, allow));
    }
    input = approvals;
  }

  console.error(`Aborting after ${MAX_APPROVAL_ROUNDS} approval rounds without completion`);
  return 1;
}

export async function main(argv: string[], decide?: DecisionFn): Promise<number> {
  const parsed = parseArgs(argv);
  if ('usage' in parsed) {
    process.stderr.write(USAGE);
    return 2;
  }
  if (parsed.command === 'gateway') {
    try {
      return await runGateway();
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }
  try {
    return await runScan(parsed.targetUrl, decide);
  } catch (error) {
    if (error instanceof TargetScopeError) {
      console.error(`Scope error: ${error.message}`);
      return 2;
    }
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
