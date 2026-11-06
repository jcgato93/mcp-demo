import type { Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authMiddleware } from "./auth.js";
import type { Config } from "./config.js";
import { createMcpServer } from "./server.js";

export function createApp(config: Config) {
  const app = createMcpExpressApp(); // JSON body parser + protección DNS rebinding en localhost

  app.post("/mcp", authMiddleware(config), async (req: Request, res: Response) => {
    // Stateless: servidor + transport nuevos por request, sin session id.
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true, // respuesta JSON simple, sin SSE
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  });

  // Sin sesiones no hay stream GET ni DELETE de sesión.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res
      .status(405)
      .set("Allow", "POST")
      .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}
