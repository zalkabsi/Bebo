import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(repoRoot);

const server = await createServer({
  configFile: resolve(repoRoot, "vite.config.ts"),
  root: repoRoot,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});

let connected = false;

async function request(baseUrl, path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { "x-bebo-mcp-request": "1", ...(init.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Bebo returned HTTP ${response.status}`);
  return body;
}

async function post(baseUrl, path, body) {
  return request(baseUrl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

try {
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address === "object", "Bebo test server did not bind a local port");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const { server: status } = await post(baseUrl, "/api/mcp/connect", {
    serverId: "gridcraft",
    mode: "headless",
  });
  connected = true;
  assert.equal(status.connected, true, "Bebo did not connect to GridCraft");
  assert.ok(status.toolCount > 0, "GridCraft did not expose MCP tools to Bebo");

  const { tools } = await request(baseUrl, "/api/mcp/tools");
  const names = tools.filter((item) => item.serverId === "gridcraft").map((item) => item.tool.name);
  assert.ok(names.includes("read_range"), "GridCraft read_range tool was not discovered");
  assert.ok(names.includes("evaluate_formula"), "GridCraft evaluate_formula tool was not discovered");

  const { result } = await post(baseUrl, "/api/mcp/call", {
    serverId: "gridcraft",
    name: "evaluate_formula",
    arguments: { formula: "=SUM(1,2,3)" },
  });
  assert.match(result, /6/, `Unexpected GridCraft formula result: ${result}`);

  console.log(`GridCraft MCP connected through Bebo (${status.toolCount} tools); =SUM(1,2,3) returned ${result}.`);
} finally {
  if (connected) {
    const address = server.httpServer?.address();
    if (address && typeof address === "object") {
      await post(`http://127.0.0.1:${address.port}`, "/api/mcp/disconnect", { serverId: "gridcraft" }).catch(() => {});
    }
  }
  await server.close();
}
