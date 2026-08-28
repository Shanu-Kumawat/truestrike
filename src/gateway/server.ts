import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server, IncomingMessage } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { AuthorizationLedger, JsonlAuditWriter } from './authorizations.js';

const MAX_BODY_BYTES = 1024 * 1024;

const sessions = new Map<
  string,
  { mcpServer: McpServer; transport: StreamableHTTPServerTransport }
>();

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

/**
 * authorization ledger is shared across sessions.
 */
export function createGatewayMcpServer(ledger: AuthorizationLedger): McpServer {
  const mcpServer = new McpServer(
    { name: 'truestrike-gateway', version: '0.1.0' },
    { instructions: GATEWAY_INSTRUCTIONS },
  );

  mcpServer.registerTool(
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

  mcpServer.registerTool(
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

  return mcpServer;
}

/**
 * Builds one MCP server + transport pair for a single HTTP client session;
 * the authorization ledger is shared across sessions.
 */
export function createGatewaySession(ledger: AuthorizationLedger): {
  mcpServer: McpServer;
  transport: StreamableHTTPServerTransport;
} {
  const mcpServer = createGatewayMcpServer(ledger);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessionclosed: (sessionId) => {
      sessions.delete(sessionId);
    },
  });

  void mcpServer
    .connect(
      // SDK type artifact under exactOptionalPropertyTypes: the transport's
      // optional event handlers are assignable at runtime.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transport as any,
    )
    .catch(() => {
      sessions.delete(transport.sessionId ?? '');
    });

  return { mcpServer, transport };
}

function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        resolve(undefined);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(undefined));
  });
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
  const ledger = await AuthorizationLedger.restore(
    new JsonlAuditWriter(auditLogPath),
    auditLogPath,
  );

  const httpServer = createServer((req, res) => {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

    if (req.method === 'POST') {
      const session = sessionId ? sessions.get(sessionId) : undefined;
      if (sessionId && !session) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'session not found' }));
        return;
      }
      void readBody(req).then(async (body) => {
        if (body === undefined) {
          if (!res.headersSent) {
            res.writeHead(413, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'request body too large or unreadable' }));
          }
          return;
        }
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        try {
          if (session) {
            await session.transport.handleRequest(req, res, parsedBody);
            return;
          }
          // No session id: this must be an initialize request; open a session.
          const created = createGatewaySession(ledger);
          await created.transport.handleRequest(req, res, parsedBody);
          if (created.transport.sessionId) {
            sessions.set(created.transport.sessionId, created);
          }
        } catch {
          if (!res.headersSent) {
            res.writeHead(500, { 'content-type': 'application/json' });
          }
          res.end(JSON.stringify({ error: 'gateway failure' }));
        }
      });
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      const session = sessionId ? sessions.get(sessionId) : undefined;
      if (!session) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'session not found' }));
        return;
      }
      void session.transport.handleRequest(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
        }
        res.end(JSON.stringify({ error: 'gateway failure' }));
      });
      return;
    }

    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
  });

  return await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, '127.0.0.1', () => {
      resolve({
        server: httpServer,
        port,
        close: async () => {
          for (const session of sessions.values()) {
            await session.transport.close();
            await session.mcpServer.close();
          }
          sessions.clear();
          await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
        },
      });
    });
  });
}
