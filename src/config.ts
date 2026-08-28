export interface TrueStrikeConfig {
  /** TrueForge server base URL. */
  baseUrl: string;
  /** Optional OIDC ID token (hosted servers only; local mode needs none). */
  token: string | undefined;
  /** Model to run the agent on, in "provider/model" form (e.g. "openai/gpt-5"). */
  model: string;
  /** Extra authorized target hostnames beyond loopback (comma-separated in env). */
  extraAllowedHosts: string[];
  /** Enable the Daytona sandbox for the agent (default: on). */
  sandbox: boolean;
  /** MCP server names configured on the TrueForge server to attach (comma-separated). */
  mcpServers: string[];
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function parseStrictBool(name: string, value: string | undefined, fallback: boolean): boolean {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === undefined || trimmed === '') {
    return fallback;
  }
  if (TRUE_VALUES.has(trimmed)) {
    return true;
  }
  if (FALSE_VALUES.has(trimmed)) {
    return false;
  }
  throw new Error(
    `Invalid value for ${name}: "${value}". ` +
      `Use one of: ${[...TRUE_VALUES, ...FALSE_VALUES].join(', ')}.`,
  );
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
    sandbox: parseStrictBool('TRUESTRIKE_SANDBOX', env.TRUESTRIKE_SANDBOX, true),
    mcpServers: (env.TRUESTRIKE_MCP_SERVERS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
