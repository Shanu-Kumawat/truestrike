import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { AuthorizationLedger, JsonlAuditWriter } from './authorizations.js';

const GATEWAY_INSTRUCTIONS = [
  'TrueStrike intrusive-action gateway.',
  'Every tool here is approval-gated: a human must explicitly allow the call',
  'before it executes. Use request_intrusive_approval before any intrusive or',
  'destructive action against the authorized target; it returns an',
  'authorizationId. Execute the approved action in the sandbox, then call',
  'record_exploit_outcome exactly once with the authorizationId, the result,',
  'and the evidence. Do not perform intrusive actions without a minted',
  'authorizationId, and never reuse one.',
].join('\n');

export function buildGatewayMcpServer(ledger: AuthorizationLedger): McpServer {
  const server = new McpServer(
    { name: 'truestrike-gateway', version: '0.1.0' },
    { instructions: GATEWAY_INSTRUCTIONS },
  );

  server.registerTool(
    'request_intrusive_approval',
    {
      title: 'Request approval for an intrusive action',
      description:
        'Request human approval for an intrusive or destructive action against the ' +
        'authorized target. Returns an authorizationId on approval. Approval is ' +
        'enforced by the harness: this call pauses until the operator allows it.',
      inputSchema: {
        action: z.string().min(1).describe('Short name of the action, e.g. sqlmap-injection'),
        command: z.string().min(1).describe('The exact command or request to be executed'),
        rationale: z.string().min(1).describe('Why this action is needed and what it proves'),
      },
      annotations: { destructiveHint: true, readOnlyHint: false, openWorldHint: false },
    },
    async ({ action, command, rationale }) => {
      const authorizationId = await ledger.mint({ action, command, rationale });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              approved: true,
              authorizationId,
              note: 'Execute this exact action in the sandbox, then record the outcome with record_exploit_outcome.',
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    'record_exploit_outcome',
    {
      title: 'Record the outcome of an approved intrusive action',
      description:
        'Record the result and evidence of an intrusive action after executing it in ' +
        'the sandbox. Each authorizationId can be used exactly once.',
      inputSchema: {
        authorizationId: z.string().min(1),
        outcome: z
          .string()
          .min(1)
          .describe('What happened, e.g. vulnerability confirmed or not reproduced'),
        evidence: z
          .string()
          .min(1)
          .describe('Concrete evidence: request/response excerpts, command output'),
      },
      annotations: { destructiveHint: false, readOnlyHint: false, openWorldHint: false },
    },
    async ({ authorizationId, outcome, evidence }) => {
      await ledger.consume(authorizationId, outcome, evidence);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ recorded: true, authorizationId }),
          },
        ],
      };
    },
  );

  return server;
}

export interface GatewayHandle {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

export async function startGatewayServer(
  port: number,
  auditLogPath: string,
): Promise<GatewayHandle> {
  const ledger = new AuthorizationLedger(new JsonlAuditWriter(auditLogPath));
  const mcpServer = buildGatewayMcpServer(ledger);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });
  await mcpServer.connect(
    // SDK type artifact under exactOptionalPropertyTypes: the transport's
    // optional event handlers are assignable at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport as any,
  );

  const httpServer = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'method or path not allowed' }));
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid JSON body' }));
        return;
      }
      void transport.handleRequest(req, res, parsedBody).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
        }
        res.end(JSON.stringify({ error: 'gateway failure' }));
      });
    });
    req.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(400);
      }
      res.end();
    });
  });

  return await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '127.0.0.1', () => {
      resolve({
        server: httpServer,
        port,
        close: async () => {
          await transport.close();
          await mcpServer.close();
          await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
        },
      });
    });
  });
}
