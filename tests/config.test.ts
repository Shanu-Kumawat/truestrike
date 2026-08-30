import { describe, expect, it } from 'vitest';
import { ALL_CONFIGURED_SKILLS, loadConfig, resolveSkills } from '../src/config.js';

function env(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { ...overrides };
}

describe('resolveSkills', () => {
  it('expands * to every configured skill, sorted', () => {
    expect(resolveSkills([ALL_CONFIGURED_SKILLS], ['xss', 'web-recon', 'sql-injection'])).toEqual([
      'sql-injection',
      'web-recon',
      'xss',
    ]);
  });

  it('passes explicit lists through untouched', () => {
    expect(resolveSkills(['web-recon'], ['web-recon', 'xss'])).toEqual(['web-recon']);
    expect(resolveSkills([], ['web-recon'])).toEqual([]);
  });
});

describe('loadConfig', () => {
  it('throws an actionable error when TRUESTRIKE_MODEL is missing', () => {
    expect(() => loadConfig(env({}))).toThrow(/TRUESTRIKE_MODEL/);
  });

  it('applies defaults for optional values', () => {
    const config = loadConfig(env({ TRUESTRIKE_MODEL: 'openai/gpt-5' }));
    expect(config.baseUrl).toBe('http://localhost:8790');
    expect(config.token).toBeUndefined();
    expect(config.extraAllowedHosts).toEqual([]);
    expect(config.mcpServers).toEqual([]);
    expect(config.auditLogPath).toBe('.truestrike/audit.jsonl');
    expect(config.skills).toEqual([ALL_CONFIGURED_SKILLS]);
  });

  it('parses comma-separated allowlist and mcp server lists', () => {
    const config = loadConfig(
      env({
        TRUESTRIKE_MODEL: 'openai/gpt-5',
        TRUESTRIKE_ALLOW_HOSTS: 'A.test, b.test ,,',
        TRUESTRIKE_MCP_SERVERS: 'gateway, search',
        TRUESTRIKE_AUDIT_LOG: '/tmp/audit.jsonl',
      }),
    );
    expect(config.extraAllowedHosts).toEqual(['a.test', 'b.test']);
    expect(config.mcpServers).toEqual(['gateway', 'search']);
    expect(config.auditLogPath).toBe('/tmp/audit.jsonl');
  });
});
