import { TrueForge, isEventDelta, mergeEventDelta } from '@truefoundry/trueforge-sdk';
import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';
import { loadConfig } from './config.js';
import { buildScanSpec } from './agent/spec.js';
import { TargetScopeError, validateTarget } from './target.js';

const USAGE = `Usage:
  truestrike scan <target-url>

Environment:
  TRUESTRIKE_MODEL        model in provider/model form (required, e.g. openai/gpt-5)
  TRUEFORGE_BASE_URL      TrueForge server (default http://localhost:8790)
  TRUEFORGE_TOKEN         OIDC ID token (hosted servers only)
  TRUESTRIKE_ALLOW_HOSTS  comma-separated extra authorized hosts
`;

async function runScan(targetUrl: string): Promise<number> {
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

  const events = new Map<string, TrueForgeApi.TurnStreamingEvent>();
  let exitCode = 0;
  let streamedAssistantText = false;

  const stream = await client.sessions.createTurnStream(session.id, {
    input: [
      {
        type: 'user.message',
        content: `Begin the security engagement for the authorized target ${target}.`,
      },
    ],
  });

  for await (const { data: event } of stream.withMetadata()) {
    if (isEventDelta(event)) {
      const base = events.get(event.id);
      if (base) {
        mergeEventDelta(base, event);
      }
      if (event.type === 'model.message.delta' && event.threadId === 'main') {
        if (event.content) {
          streamedAssistantText = true;
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
        console.log(`\n[tool result] ${String(event.content ?? '').slice(0, 200)}`);
        break;
      case 'sandbox.created':
        console.log(`\n[sandbox provisioned] ${event.sandboxId}`);
        break;
      case 'mcp.auth_required':
        console.log('\n[mcp auth required] authorize the listed servers, then resume');
        break;
      case 'tool.approval_required':
        console.log('\n[approval required] interactive approvals land with TS-14');
        break;
      case 'turn.done': {
        const state = event.state;
        console.log(`\n\nTurn finished: ${state.status}`);
        if (state.status === 'done') {
          // The reply already streamed via deltas; only print when it did not.
          if (state.output && !streamedAssistantText) {
            console.log(`\n${state.output.content ?? ''}`);
          }
          if (state.metrics) {
            console.log(
              `\n(tokens: ${state.metrics.totalTokens ?? '?'}, ` +
                `cost: $${state.metrics.totalCostInUsd ?? '?'})`,
            );
          }
        }
        if (state.status === 'cancelled') {
          console.error(`Turn cancelled: ${state.reason}`);
          exitCode = 1;
        }
        if (state.status === 'error') {
          console.error(`Turn error: ${state.message}`);
          exitCode = 1;
        }
        break;
      }
      default:
        break;
    }
  }

  return exitCode;
}

async function main(): Promise<number> {
  const [command, targetUrl] = process.argv.slice(2);

  if (command !== 'scan' || !targetUrl) {
    process.stderr.write(USAGE);
    return 2;
  }

  try {
    return await runScan(targetUrl);
  } catch (error) {
    if (error instanceof TargetScopeError) {
      console.error(`Scope error: ${error.message}`);
      return 2;
    }
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

process.exitCode = await main();
