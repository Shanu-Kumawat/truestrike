// Registers/updates the saved "truestrike" agent on the TrueForge server so
// it appears in the Agents Library UI (and is runnable from the chat UI).
// Uses the exact same buildScanSpec as the CLI: identical doctrine, skills,
// sandbox, and gateway gating. No drift by construction.
//
// Usage:
//   TRUESTRIKE_MODEL=... pnpm tsx scripts/register-ui-agent.mts <target-url>
//
// NOTE: the instructions embed the target URL. The demo relay URL changes on
// every cloudflared tunnel restart - re-run this script whenever you repoint
// the worker (it is idempotent).

import { TrueForge } from '@truefoundry/trueforge-sdk';
import { loadConfig, loadDotEnv, resolveSkills } from '../src/config.js';
import { buildScanSpec } from '../src/agent/spec.js';
import { validateTarget } from '../src/target.js';

const AGENT_NAME = 'truestrike';

async function main(): Promise<void> {
  const [targetUrl] = process.argv.slice(2);
  if (!targetUrl) {
    console.error('usage: pnpm tsx scripts/register-ui-agent.mts <target-url>');
    process.exit(2);
  }

  loadDotEnv();
  const config = loadConfig();
  const target = validateTarget(targetUrl, config.extraAllowedHosts);

  const client = new TrueForge({
    baseUrl: config.baseUrl,
    timeoutInSeconds: 60,
    ...(config.token ? { token: config.token } : {}),
  });

  const { data: configuredSkills } = await client.skills.list();
  const skills = resolveSkills(
    config.skills,
    (configuredSkills ?? []).map((skill) => skill.name),
  );

  const spec = buildScanSpec(target, {
    model: config.model,
    mcpServers: config.mcpServers,
    skills,
  });

  // Idempotent registration: POST first; on name conflict, PUT the full
  // manifest by id.
  try {
    await client.agents.create({ name: AGENT_NAME, manifest: spec });
    console.log(`registered agent "${AGENT_NAME}" (new)`);
  } catch (error) {
    if (error instanceof Error && !/conflict|exist|409/i.test(error.message)) {
      throw error;
    }
    const { data: agents } = await client.agents.list();
    const existing = (agents ?? []).find((agent) => agent.name === AGENT_NAME);
    if (existing === undefined) {
      throw error;
    }
    await client.agents.update(existing.id, { manifest: spec });
    console.log(`updated agent "${AGENT_NAME}" (${existing.id})`);
  }

  console.log(`target: ${target}`);
  console.log(
    `model: ${config.model}, skills: ${skills.length}, mcp: ${config.mcpServers.join(', ') || '(none)'}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
