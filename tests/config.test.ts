import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

function env(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { ...overrides };
}

describe('loadConfig', () => {
  it('throws an actionable error when TRUESTRIKE_MODEL is missing', () => {
    expect(() => loadConfig(env({}))).toThrow(/TRUESTRIKE_MODEL/);
  });

  it('applies defaults for optional values', () => {
    const config = loadConfig(env({ TRUESTRIKE_MODEL: 'openai/gpt-5' }));
    expect(config.baseUrl).toBe('http://localhost:8790');
    expect(config.token).toBeUndefined();
    expect(config.sandbox).toBe(true);
    expect(config.extraAllowedHosts).toEqual([]);
    expect(config.mcpServers).toEqual([]);
  });

  it('parses comma-separated allowlist and mcp server lists', () => {
    const config = loadConfig(
      env({
        TRUESTRIKE_MODEL: 'openai/gpt-5',
        TRUESTRIKE_ALLOW_HOSTS: 'A.test, b.test ,,',
        TRUESTRIKE_MCP_SERVERS: 'gateway, search',
      }),
    );
    expect(config.extraAllowedHosts).toEqual(['a.test', 'b.test']);
    expect(config.mcpServers).toEqual(['gateway', 'search']);
  });

  it.each(['1', 'true', 'YES', 'on'])('accepts %s as sandbox=true', (value) => {
    expect(loadConfig(env({ TRUESTRIKE_MODEL: 'm', TRUESTRIKE_SANDBOX: value })).sandbox).toBe(
      true,
    );
  });

  it.each(['0', 'false', 'NO', 'off'])('accepts %s as sandbox=false', (value) => {
    expect(loadConfig(env({ TRUESTRIKE_MODEL: 'm', TRUESTRIKE_SANDBOX: value })).sandbox).toBe(
      false,
    );
  });

  it('rejects malformed booleans instead of silently disabling the sandbox', () => {
    expect(() => loadConfig(env({ TRUESTRIKE_MODEL: 'm', TRUESTRIKE_SANDBOX: 'treu' }))).toThrow(
      /TRUESTRIKE_SANDBOX/,
    );
  });
});
