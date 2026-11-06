import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { notes } from "./store.js";

/** Forma mínima de lo que el SDK nos pasa como último argumento de cada tool. */
type Extra = { authInfo?: { scopes: string[]; extra?: Record<string, unknown> } };

/**
 * Capa de seguridad #2: AUTORIZACIÓN dentro de cada tool.
 *
 * - La identidad se toma de `extra.authInfo` (puesta por authMiddleware desde el JWT).
 * - Ningún tool acepta un parámetro `userId`: el cliente no puede "pedir" ser otro.
 * - Cada tool exige un scope concreto (mínimo privilegio).
 * - Si falta identidad lanzamos error (fail closed).
 */
function requireUser(extra: Extra, scope: string): string {
  const userId = extra.authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) throw new Error("Unauthenticated");
  if (!extra.authInfo!.scopes.includes(scope)) throw new Error(`Missing scope: ${scope}`);
  return userId;
}

const text = (t: string, isError = false): CallToolResult => ({
  content: [{ type: "text", text: t }],
  ...(isError && { isError }),
});

/**
 * Stateless: se crea una instancia NUEVA por request. No hay estado de sesión
 * en memoria del servidor; cualquier réplica puede atender cualquier request.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "notes-mcp", version: "1.0.0" });

  server.registerTool(
    "list_notes",
    { description: "Lista las notas del usuario autenticado" },
    async (extra) => {
      const userId = requireUser(extra, "notes:read");
      const list = notes.list(userId).map(({ id, title }) => ({ id, title }));
      return text(JSON.stringify(list, null, 2));
    },
  );

  server.registerTool(
    "get_note",
    {
      description: "Obtiene una nota propia por id",
      inputSchema: { id: z.string().min(1).max(64) },
    },
    async ({ id }, extra) => {
      const userId = requireUser(extra, "notes:read");
      const note = notes.get(userId, id);
      // Misma respuesta si no existe o si es de otro usuario: no revelamos existencia.
      if (!note) return text("Nota no encontrada", true);
      return text(JSON.stringify(note, null, 2));
    },
  );

  server.registerTool(
    "add_note",
    {
      description: "Crea una nota para el usuario autenticado",
      inputSchema: { title: z.string().min(1).max(120), body: z.string().max(5000) },
    },
    async ({ title, body }, extra) => {
      const userId = requireUser(extra, "notes:write");
      const note = notes.add(userId, title, body);
      return text(`Nota creada con id ${note.id}`);
    },
  );

  server.registerTool(
    "delete_note",
    {
      description: "Elimina una nota propia por id",
      inputSchema: { id: z.string().min(1).max(64) },
    },
    async ({ id }, extra) => {
      const userId = requireUser(extra, "notes:write");
      return notes.remove(userId, id) ? text("Nota eliminada") : text("Nota no encontrada", true);
    },
  );

  return server;
}
