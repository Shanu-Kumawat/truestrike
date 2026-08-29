import {
  TrueForge,
  TrueForgeError,
  isEventDelta,
  mergeEventDelta,
} from '@truefoundry/trueforge-sdk';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { loadConfig, loadDotEnv } from './config.js';
import type { TrueStrikeConfig } from './config.js';
import { buildScanSpec } from './agent/spec.js';
import { buildApprovalInput, collectPendingCalls, describePendingCall } from './agent/approvals.js';
import type { PendingCall } from './agent/approvals.js';
import { TargetScopeError, validateTarget } from './target.js';
import { sanitizeForTerminal } from './terminal.js';
import { clearScanState, loadScanState, saveScanState, statePathFromEnv } from './session-store.js';
import type { ScanState } from './session-store.js';

type TrueForgeClient = TrueForge;
type TurnStream = Awaited<ReturnType<TrueForgeClient['sessions']['createTurnStream']>>;

export const USAGE = `Usage:
  truestrike scan <target-url>    run a scan against the authorized target
  truestrike scan --resume        resume the previous scan after a disconnect
  truestrike gateway              start the exploit-gateway MCP server

Environment:
  TRUESTRIKE_MODEL        model in provider/model form (required, e.g. openai/gpt-5)
  TRUEFORGE_BASE_URL      TrueForge server (default http://localhost:8790)
  TRUEFORGE_TOKEN         OIDC ID token (hosted servers only)
  TRUESTRIKE_ALLOW_HOSTS  comma-separated extra authorized hosts
  TRUESTRIKE_MCP_SERVERS  comma-separated MCP server names to attach
  TRUESTRIKE_SKILLS       comma-separated skill names to attach
                          (default: web-recon,vuln-validation,report-writing)
  TRUESTRIKE_GATEWAY_PORT port for the gateway MCP server (default 8815)
  TRUESTRIKE_AUDIT_LOG    gateway audit log path (default .truestrike/audit.jsonl)
  TRUESTRIKE_STATE_FILE   scan resume state path (default .truestrike/last-scan.json)
`;

export function parseArgs(
  argv: string[],
):
  | { command: 'scan'; targetUrl?: string; resume: boolean }
  | { command: 'gateway' }
  | { usage: true } {
  const [command, ...rest] = argv;
  if (command === 'gateway' && rest.length === 0) {
    return { command: 'gateway' };
  }
  if (command !== 'scan') {
    return { usage: true };
  }
  const resume = rest.includes('--resume');
  const positional = rest.filter((arg) => arg !== '--resume');
  if (resume && positional.length > 0) {
    return { usage: true };
  }
  if (positional.length === 1) {
    return { command: 'scan', targetUrl: positional[0]!, resume: false };
  }
  if (resume) {
    return { command: 'scan', resume: true };
  }
  return { usage: true };
}

export interface GatewayOptions {
  port: number;
  auditLogPath: string;
}

export function loadGatewayOptions(env: NodeJS.ProcessEnv = process.env): GatewayOptions {
  const rawPort = env.TRUESTRIKE_GATEWAY_PORT ?? '8815';
  if (!/^\d+$/.test(rawPort)) {
    throw new Error(`Invalid TRUESTRIKE_GATEWAY_PORT: "${rawPort}"`);
  }
  const port = Number.parseInt(rawPort, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid TRUESTRIKE_GATEWAY_PORT: "${rawPort}"`);
  }
  return {
    port,
    auditLogPath: env.TRUESTRIKE_AUDIT_LOG?.trim() || '.truestrike/audit.jsonl',
  };
}
export async function runGateway(): Promise<number> {
  loadDotEnv();
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

/** Operator decision callback: resolve one pending call to allow/deny. */
export type DecisionFn = (call: PendingCall) => Promise<boolean>;

async function promptDecision(call: PendingCall): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    // EOF on stdin (background runs, closed terminals) must resolve as a
    // denial; otherwise the pending top-level await kills the process with
    // an unsettled-await crash instead of resuming the turn.
    const answer = await Promise.race([
      rl.question(
        `\n[approval required] ${sanitizeForTerminal(describePendingCall(call))}\nApprove? [y/N] `,
      ),
      new Promise<string>((resolve) => {
        rl.on('close', () => resolve(''));
      }),
    ]);
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
  turnId: string | undefined;
  lastSequenceNumber: number;
}

function emptyResult(): StreamResult {
  return {
    turnStatus: 'done',
    errorMessage: undefined,
    metrics: undefined,
    pendingApprovals: [],
    streamedAssistantText: false,
    eventIndex: new Map(),
    turnId: undefined,
    lastSequenceNumber: 0,
  };
}

function applyEvent(event: TrueForgeApi.TurnStreamingEvent, result: StreamResult): void {
  result.eventIndex.set(event.id, event);

  switch (event.type) {
    case 'turn.created':
      result.turnId = event.turnId;
      break;
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

async function consumeTurnStream(
  stream: TurnStream,
  onTurnCreated?: (turnId: string) => void,
  onProgress?: (seq: number) => void,
): Promise<StreamResult> {
  const result = emptyResult();
  let eventsSinceFlush = 0;
  for await (const { data: event, id } of stream.withMetadata()) {
    if (id != null && Number.isFinite(Number(id))) {
      result.lastSequenceNumber = Math.max(result.lastSequenceNumber, Number(id));
    }
    if (isEventDelta(event)) {
      const base = result.eventIndex.get(event.id);
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
    applyEvent(event, result);
    if (event.type === 'turn.created' && onTurnCreated && result.turnId !== undefined) {
      onTurnCreated(result.turnId);
    }
    eventsSinceFlush += 1;
    if (onProgress && eventsSinceFlush >= CURSOR_FLUSH_INTERVAL) {
      eventsSinceFlush = 0;
      onProgress(result.lastSequenceNumber);
    }
  }
  return result;
}

async function consumeCreatedTurn(
  sessionId: string,
  input: TrueForgeApi.TurnInputItem[],
  client: TrueForgeClient,
  onTurnCreated?: (turnId: string) => void,
  onProgress?: (seq: number) => void,
): Promise<StreamResult> {
  const stream = await client.sessions.createTurnStream(sessionId, { input });
  return consumeTurnStream(stream, onTurnCreated, onProgress);
}

async function consumeSubscribedTurn(
  sessionId: string,
  turnId: string,
  afterSequenceNumber: number,
  client: TrueForgeClient,
  onTurnCreated?: (turnId: string) => void,
  onProgress?: (seq: number) => void,
): Promise<StreamResult> {
  const stream = await client.sessions.subscribeToTurn(
    sessionId,
    turnId,
    { afterSequenceNumber },
    { timeoutInSeconds: 600 },
  );
  return consumeTurnStream(stream, onTurnCreated, onProgress);
}

/**
 * Rebuilds a finished turn's result from a persisted event log (deltas are
 * pre-merged by the server). Terminal state comes from the logged turn.done.
 * Injectable iterable keeps this unit-testable without a live server.
 */
export async function rebuildTurnFromEvents(
  events: AsyncIterable<TrueForgeApi.SessionEvent>,
  onTurnCreated?: (turnId: string) => void,
): Promise<StreamResult> {
  const result = emptyResult();
  for await (const event of events) {
    applyEvent(event, result);
    if (event.type === 'turn.created' && onTurnCreated && result.turnId !== undefined) {
      onTurnCreated(result.turnId);
    }
  }
  return result;
}

const MAX_APPROVAL_ROUNDS = 25;
/** Persist the resume cursor every N stream events. */
const CURSOR_FLUSH_INTERVAL = 20;

/**
 * Drives a scan turn to completion: consumes the first stream (fresh turn,
 * subscribed turn, or rebuilt log), resolves approval pauses with new turns,
 * and keeps the resume state file current throughout.
 */
interface ScanOutcome {
  code: number;
  /** Turn that produced the final state; the report is collected from it. */
  finalTurnId: string | undefined;
  /** True when the scan completed (any final turn status, no crash). */
  completed: boolean;
}

async function driveScan(
  sessionId: string,
  target: string,
  client: TrueForgeClient,
  decide: DecisionFn,
  startedAtIso: string,
  firstTurn: (
    onTurnCreated: (turnId: string) => void,
    onProgress: (seq: number) => void,
  ) => Promise<StreamResult>,
): Promise<ScanOutcome> {
  let input: TrueForgeApi.TurnInputItem[] | undefined;
  let activeTurnId: string | undefined;

  // Persist as soon as the turn id is known (turn.created) and flush the
  // stream cursor periodically, so a crash mid-turn resumes close to where it
  // stopped. Writes are chained (never concurrent) and awaited before
  // clearing so an older write cannot resurrect cleared state.
  let pendingPersist: Promise<void> = Promise.resolve();
  const persist = (turnId: string, lastSequenceNumber: number): Promise<void> =>
    saveScanState({ sessionId, turnId, lastSequenceNumber, target, startedAt: startedAtIso });
  const queuePersist = (turnId: string, lastSequenceNumber: number): void => {
    pendingPersist = pendingPersist
      .then(() => persist(turnId, lastSequenceNumber))
      .catch((error: unknown) => {
        console.error(
          `[warn] failed to persist resume state: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  };
  const onTurnCreated = (turnId: string): void => {
    activeTurnId = turnId;
    queuePersist(turnId, 0);
  };
  const onProgress = (seq: number) => {
    if (activeTurnId !== undefined) {
      queuePersist(activeTurnId, seq);
    }
  };
  const clearState = async (): Promise<void> => {
    await pendingPersist;
    await clearScanState();
  };

  for (let round = 0; round < MAX_APPROVAL_ROUNDS; round++) {
    const result =
      round === 0
        ? await firstTurn(onTurnCreated, onProgress)
        : await consumeCreatedTurn(sessionId, input!, client, onTurnCreated, onProgress);
    activeTurnId = result.turnId ?? activeTurnId;

    if (result.turnStatus === 'cancelled') {
      console.error('Turn cancelled');
      await clearState();
      return { code: 1, finalTurnId: activeTurnId, completed: false };
    }
    if (result.turnStatus === 'error') {
      // Do not resume an errored turn, even if approval events were streamed
      // before the failure; resuming is only defined for paused turns.
      console.error(`Turn error: ${result.errorMessage ?? 'unknown'}`);
      await clearState();
      return { code: 1, finalTurnId: activeTurnId, completed: false };
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
      await clearState();
      return { code: 0, finalTurnId: activeTurnId, completed: true };
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
  await clearState();
  return { code: 1, finalTurnId: activeTurnId, completed: false };
}

function createClient(config: { baseUrl: string; token: string | undefined }): TrueForgeClient {
  return new TrueForge({
    baseUrl: config.baseUrl,
    timeoutInSeconds: 600,
    ...(config.token ? { token: config.token } : {}),
  });
}

/**
 * Post-scan report collection for completed scans. Failures warn and keep
 * the scan's exit code; a completed scan with findings yields exit code 2.
 */
async function finishScan(
  client: TrueForgeClient,
  config: TrueStrikeConfig,
  sessionId: string,
  outcome: ScanOutcome,
  startedAtIso: string,
): Promise<number> {
  if (!outcome.completed) {
    return outcome.code;
  }
  const { collectReport } = await import('./report/pipeline.js');
  const report = await collectReport(
    client,
    sessionId,
    outcome.finalTurnId,
    'truestrike-runs',
    config.auditLogPath,
    startedAtIso,
  );
  return Math.max(outcome.code, report.exitCode);
}

export async function runScan(
  targetUrl: string,
  decide: DecisionFn = promptDecision,
): Promise<number> {
  const config = loadConfig();
  const target = validateTarget(targetUrl, config.extraAllowedHosts);
  const client = createClient(config);

  console.log(`TrueStrike - authorized target: ${target}`);
  console.log(`Connecting to TrueForge at ${config.baseUrl} (model: ${config.model})\n`);

  const startedAtIso = new Date().toISOString();
  const { data: session } = await client.sessions.create({
    agent: {
      spec: buildScanSpec(target, {
        model: config.model,
        mcpServers: config.mcpServers,
        skills: config.skills,
      }),
    },
  });
  console.log(`Session: ${session.id}\n`);

  const initialInput: TrueForgeApi.TurnInputItem[] = [
    {
      type: 'user.message',
      content: `Begin the security engagement for the authorized target ${target}.`,
    },
  ];

  const outcome = await driveScan(
    session.id,
    target,
    client,
    decide,
    startedAtIso,
    (onTurnCreated) => consumeCreatedTurn(session.id, initialInput, client, onTurnCreated),
  );
  return await finishScan(client, config, session.id, outcome, startedAtIso);
}

export async function runResumedScan(decide: DecisionFn = promptDecision): Promise<number> {
  loadDotEnv();
  const state: ScanState | undefined = await loadScanState();
  if (!state) {
    console.error(
      `No previous scan to resume (state file: ${statePathFromEnv()}). Start a fresh scan with: truestrike scan <target-url>`,
    );
    return 2;
  }

  const config = loadConfig();
  const target = validateTarget(state.target, config.extraAllowedHosts);
  const client = createClient(config);

  console.log(`TrueStrike - resuming scan of ${target}`);
  console.log(`Session: ${state.sessionId}, turn: ${state.turnId}\n`);

  let turn: TrueForgeApi.Turn;
  try {
    const response = await client.sessions.getTurn(state.sessionId, state.turnId);
    turn = response.data;
  } catch (error) {
    // Only a gone session/turn invalidates the state file; transient
    // failures (network, timeout, auth) must keep it resumable.
    const isNotFound = error instanceof TrueForgeError && error.statusCode === 404;
    if (isNotFound) {
      console.error(
        'Previous scan is no longer reachable (session or turn was deleted). ' +
          'Start a fresh scan with: truestrike scan <target-url>',
      );
      await clearScanState();
    } else {
      console.error(
        `Resume failed (${error instanceof Error ? error.message : String(error)}). ` +
          'The scan state was kept; try `truestrike scan --resume` again.',
      );
    }
    return 1;
  }

  if (turn.state.status === 'running') {
    console.log('Turn still running on the server; reconnecting to the event stream...\n');
    const outcome = await driveScan(
      state.sessionId,
      target,
      client,
      decide,
      state.startedAt,
      (onTurnCreated) =>
        consumeSubscribedTurn(
          state.sessionId,
          state.turnId,
          state.lastSequenceNumber,
          client,
          onTurnCreated,
        ),
    );
    return await finishScan(client, config, state.sessionId, outcome, state.startedAt);
  }

  console.log('Turn already finished; rebuilding from the event log...\n');
  const outcome = await driveScan(
    state.sessionId,
    target,
    client,
    decide,
    state.startedAt,
    async (onTurnCreated) =>
      rebuildTurnFromEvents(
        await client.sessions.listTurnEvents(state.sessionId, state.turnId),
        onTurnCreated,
      ),
  );
  return await finishScan(client, config, state.sessionId, outcome, state.startedAt);
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
    if (parsed.resume) {
      return await runResumedScan(decide);
    }
    return await runScan(parsed.targetUrl!, decide);
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
