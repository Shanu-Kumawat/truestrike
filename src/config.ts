export interface TrueStrikeConfig {
  /** TrueForge server base URL. */
  baseUrl: string;
  /** Optional OIDC ID token (hosted servers only; local mode needs none). */
  token: string | undefined;
  /** Model to run the agent on, in "provider/model" form (e.g. "openai/gpt-5"). */
  model: string;
  /** Extra authorized target hostnames beyond loopback (comma-separated in env). */
  extraAllowedHosts: string[];
  /** MCP server names configured on the TrueForge server to attach (comma-separated). */
  mcpServers: string[];
  /** Skill names configured on the TrueForge server to attach (comma-separated). */
  skills: string[];
  /** Gateway audit log path (rendered into reports as the approved-actions appendix). */
  auditLogPath: string;
}

/**
 * Default TrueStrike skill packs (configured in TrueForge from skills/ in
 * this repo). TRUESTRIKE_SKILLS overrides the list; empty disables skills.
 * The special value '*' (the default) attaches every skill configured on
 * the TrueForge server at scan time, so newly added packs apply without
 * config changes.
 */
export const DEFAULT_SKILLS = ['web-recon', 'vuln-validation', 'report-writing'];

export const ALL_CONFIGURED_SKILLS = '*';

/**
 * Resolves the requested skill list against the skills configured on the
 * TrueForge server: '*' expands to every configured skill name; any other
 * list is used as-is (the server rejects unknown names at session creation).
 */
export function resolveSkills(requested: string[], configuredNames: string[]): string[] {
  if (requested.length === 1 && requested[0] === ALL_CONFIGURED_SKILLS) {
    return [...configuredNames].sort();
  }
  return requested;
}

/**
 * Loads `.env` from cwd when present. Missing file is fine.
 */
export function loadDotEnv(): void {
  try {
    // Node >= 20.12: loads .env without a dependency.
    process.loadEnvFile();
  } catch {
    // no .env present; rely on real environment
  }
}

/**
 * Loads configuration from the environment (`.env` in cwd is read when present).
 * Throws with an actionable message when a required value is missing.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): TrueStrikeConfig {
  loadDotEnv();

  const model = env.TRUESTRIKE_MODEL?.trim();
  if (!model) {
    throw new Error(
      'TRUESTRIKE_MODEL is not set. Set it to a model configured on your TrueForge ' +
        'server, e.g. TRUESTRIKE_MODEL=openai/gpt-5 (see .env.example).',
    );
  }

  return {
    baseUrl: env.TRUEFORGE_BASE_URL?.trim() || 'http://localhost:8790',
    token: env.TRUEFORGE_TOKEN?.trim() || undefined,
    model,
    extraAllowedHosts: (env.TRUESTRIKE_ALLOW_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    mcpServers: (env.TRUESTRIKE_MCP_SERVERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    skills: (env.TRUESTRIKE_SKILLS ?? ALL_CONFIGURED_SKILLS)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    auditLogPath: env.TRUESTRIKE_AUDIT_LOG?.trim() || '.truestrike/audit.jsonl',
  };
}
