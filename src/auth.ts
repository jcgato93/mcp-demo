import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Config } from "./config.js";

/**
 * Capa de seguridad #1: AUTENTICACIÓN.
 *
 * Cada request HTTP trae `Authorization: Bearer <JWT>`. Como el servidor es
 * stateless, el token se valida en CADA request: no hay sesión que "recordar".
 *
 * Se verifica firma, expiración, issuer y audience. Lo importante para el
 * aislamiento es `sub`: la identidad del usuario sale SIEMPRE del token firmado,
 * jamás de los argumentos que manda el cliente/LLM.
 *
 * Nota: aquí usamos HS256 con secreto compartido por simplicidad. En producción
 * usa un IdP (OAuth 2.1 / OIDC) y verifica contra su JWKS con `createRemoteJWKSet`.
 */
export function authMiddleware(config: Config) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return unauthorized(res, "missing_token");
    }

    try {
      const { payload } = await jwtVerify(token, config.secret, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["HS256"], // lista blanca: evita ataques de confusión de algoritmo
      });
      if (!payload.sub) return unauthorized(res, "missing_sub");

      const authInfo: AuthInfo = {
        token,
        clientId: String(payload.client_id ?? "unknown"),
        scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
        expiresAt: payload.exp,
        extra: { userId: payload.sub },
      };
      // El transport del SDK copia req.auth a `extra.authInfo` en los handlers.
      (req as Request & { auth?: AuthInfo }).auth = authInfo;
      next();
    } catch {
      // Mensaje genérico: no filtramos por qué falló la validación.
      unauthorized(res, "invalid_token");
    }
  };
}

function unauthorized(res: Response, error: string) {
  res
    .status(401)
    .set("WWW-Authenticate", `Bearer error="${error}"`)
    .json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
}
