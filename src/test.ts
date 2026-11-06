// Prueba end-to-end: levanta el servidor y lo usa con el cliente MCP oficial.
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "./app.js";
import type { Config } from "./config.js";
import { issueToken } from "./tokens.js";

const config: Config = {
  secret: new TextEncoder().encode("test-secret-test-secret-test-secret-123"),
  issuer: "mcp-test-issuer",
  audience: "mcp-notes",
  port: 0,
};

const httpServer = createApp(config).listen(0, "127.0.0.1");
await new Promise((r) => httpServer.once("listening", r));
const url = new URL(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`);

async function connect(token: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  return client;
}

async function call(c: Client, name: string, args: Record<string, unknown> = {}) {
  try {
    const r = await c.callTool({ name, arguments: args });
    return { isError: !!r.isError, text: (r.content as { text: string }[])[0].text };
  } catch (e) {
    return { isError: true, text: String(e) }; // errores de protocolo (p. ej. excepción en el tool)
  }
}

const ok = (name: string) => console.log(`  ✔ ${name}`);

const alice = await connect(await issueToken(config, "alice"));
const bob = await connect(await issueToken(config, "bob"));

const aliceList = JSON.parse((await call(alice, "list_notes")).text);
assert.deepEqual(aliceList.map((n: { id: string }) => n.id).sort(), ["n1", "n2"]);
ok("alice ve solo sus 2 notas");

const bobList = JSON.parse((await call(bob, "list_notes")).text);
assert.equal(bobList.length, 1);
ok("bob ve solo su nota");

// El mismo id "n1" existe en ambos usuarios: cada uno recibe la suya.
assert.match((await call(alice, "get_note", { id: "n1" })).text, /Alice/);
assert.match((await call(bob, "get_note", { id: "n1" })).text, /Bob/);
ok("el mismo id resuelve a la nota de cada dueño");

// IDOR: alice intenta leer/borrar una nota que solo existe en bob.
const bobNoteId = (await call(bob, "add_note", { title: "secreto", body: "solo de bob" })).text.split(" ").pop()!;
const idor = await call(alice, "get_note", { id: bobNoteId });
assert.ok(idor.isError && !idor.text.includes("solo de bob"));
assert.ok((await call(alice, "delete_note", { id: bobNoteId })).isError);
assert.match((await call(bob, "get_note", { id: bobNoteId })).text, /solo de bob/);
ok("alice no puede leer ni borrar notas de bob por id");

// Un userId inyectado en los argumentos se ignora (no está en el schema).
const inject = await call(alice, "list_notes", { userId: "bob" });
assert.equal(JSON.parse(inject.text).length, 2);
ok("inyectar userId en los argumentos no cambia la identidad");

// Scopes: un token de solo lectura no puede escribir.
const ro = await connect(await issueToken(config, "alice", ["notes:read"]));
assert.ok((await call(ro, "add_note", { title: "x", body: "y" })).isError);
ok("token sin scope notes:write no puede crear notas");

// Autenticación: sin token, token basura, audience errónea, expirado.
const post = (auth?: string) =>
  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(auth && { authorization: auth }),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
assert.equal((await post()).status, 401);
assert.equal((await post("Bearer basura")).status, 401);
assert.equal((await post(`Bearer ${await issueToken({ ...config, audience: "otro" }, "alice")}`)).status, 401);
assert.equal((await post(`Bearer ${await issueToken(config, "alice", undefined, "-1m")}`)).status, 401);
ok("sin token / inválido / audience errónea / expirado → 401");

assert.equal((await fetch(url, { method: "GET" })).status, 405);
ok("GET /mcp → 405 (sin streams ni sesiones)");

httpServer.close();
console.log("\nTodas las pruebas pasaron");
process.exit(0);
