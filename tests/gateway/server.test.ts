import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { buildGatewayMcpServer } from '../../src/gateway/server.js';
import {
  AuthorizationLedger,
  type AuditSink,
  type OutcomeRecord,
  type ApprovalRecord,
} from '../../src/gateway/authorizations.js';

class CollectingSink implements AuditSink {
  readonly records: (ApprovalRecord | OutcomeRecord)[] = [];
  async write(record: ApprovalRecord | OutcomeRecord): Promise<void> {
    this.records.push(record);
  }
}

function textOf(result: CallToolResult): string {
  const first = result.content[0];
  return first?.type === 'text' ? first.text : '';
}

async function connectClient(): Promise<{ client: Client; sink: CollectingSink }> {
  const sink = new CollectingSink();
  const ledger = new AuthorizationLedger(sink);
  const server = buildGatewayMcpServer(ledger);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, sink };
}

describe('gateway MCP server', () => {
  it('exposes exactly the two approval-gated tools', async () => {
    const { client } = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'record_exploit_outcome',
      'request_intrusive_approval',
    ]);
    expect(tools[0]?.annotations).toBeDefined();
  });

  it('mints an authorization id on request_intrusive_approval', async () => {
    const { client, sink } = await connectClient();
    const result = (await client.callTool({
      name: 'request_intrusive_approval',
      arguments: {
        action: 'sqli-test',
        command: 'sqlmap -u http://localhost:3000/item?id=1',
        rationale: 'validate suspected SQL injection',
      },
    })) as CallToolResult;
    const payload = JSON.parse(textOf(result)) as { approved: boolean; authorizationId: string };
    expect(payload.approved).toBe(true);
    expect(payload.authorizationId).toBeTruthy();
    expect(sink.records).toHaveLength(1);
  });

  it('roundtrips an approval to its recorded outcome, once', async () => {
    const { client, sink } = await connectClient();
    const mint = (await client.callTool({
      name: 'request_intrusive_approval',
      arguments: { action: 'a', command: 'c', rationale: 'r' },
    })) as CallToolResult;
    const { authorizationId } = JSON.parse(textOf(mint)) as { authorizationId: string };

    const recorded = (await client.callTool({
      name: 'record_exploit_outcome',
      arguments: { authorizationId, outcome: 'confirmed', evidence: 'dump' },
    })) as CallToolResult;
    expect(recorded.isError).toBeUndefined();
    expect(textOf(recorded)).toContain('"recorded":true');
    expect(sink.records).toHaveLength(2);

    const replay = (await client.callTool({
      name: 'record_exploit_outcome',
      arguments: { authorizationId, outcome: 'again', evidence: 'x' },
    })) as CallToolResult;
    expect(replay.isError).toBe(true);
    expect(textOf(replay)).toMatch(/already used/);
  });

  it('rejects recording with an unknown authorization id', async () => {
    const { client } = await connectClient();
    const result = (await client.callTool({
      name: 'record_exploit_outcome',
      arguments: { authorizationId: 'bogus', outcome: 'o', evidence: 'e' },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/Unknown authorization/);
  });
});
