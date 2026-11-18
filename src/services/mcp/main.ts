import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import process from 'node:process';
import { createCineCraftMcpServer, resolveMcpConfig } from './mcpServer.ts';

/**
 * Stdio entrypoint for the CineCraft MCP bridge (R27.1).
 *
 * Run with `npm run mcp` and register it with an MCP-capable agent, e.g.
 * Claude Code:
 *
 *   claude mcp add cinecraft -- npm run mcp
 *
 * All diagnostics go to stderr; stdout carries only MCP JSON-RPC frames.
 */
async function main(): Promise<void> {
  const config = resolveMcpConfig();
  const server = createCineCraftMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[cinecraft-mcp] connected; bridging tools to ${config.baseUrl} ` +
      `(auth ${config.token ? 'enabled' : 'disabled'})\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[cinecraft-mcp] fatal: ${(err as Error)?.message || String(err)}\n`);
  process.exit(1);
});
