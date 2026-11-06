// Configuración leída del entorno. Falla al arrancar si falta el secreto
// (fail closed: nunca arrancamos con una clave por defecto).
export function loadConfig() {
  const secret = process.env.MCP_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MCP_JWT_SECRET es obligatorio y debe tener al menos 32 caracteres");
  }
  return {
    secret: new TextEncoder().encode(secret),
    issuer: process.env.MCP_ISSUER ?? "mcp-test-issuer",
    audience: process.env.MCP_AUDIENCE ?? "mcp-notes",
    port: Number(process.env.PORT ?? 3000),
  };
}

export type Config = ReturnType<typeof loadConfig>;
