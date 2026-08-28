import type { TrueForgeApi } from '@truefoundry/trueforge-sdk';

/**
 * Builds the TrueStrike AgentSpec for a scan of `targetUrl`.
 *
 * NOTE (TS-13): this is the skeleton spec. The full orchestrator instructions
 * (phase doctrine, subagent delegation, skills, sandbox config, and
 * require_approval_for_tools gating) land with the agent-chain milestone.
 */
export function buildScanSpec(targetUrl: string, model: string): TrueForgeApi.AgentSpec {
  return {
    model: { name: model },
    instructions: [
      'You are TrueStrike, an autonomous web security testing agent.',
      '',
      `Authorized target (scope): ${targetUrl}`,
      'You must only ever act against this exact target. Any host outside this',
      'scope is strictly out of bounds.',
      '',
      'For now, introduce yourself briefly, confirm the target scope you have',
      'been given, and outline the reconnaissance steps you would take against',
      'this target. Do not take any action yet.',
    ].join('\n'),
    config: { iterationLimit: 25 },
  };
}
