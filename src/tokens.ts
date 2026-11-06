import { SignJWT } from "jose";
import type { Config } from "./config.js";

/** Emite un JWT de corta duración. En producción esto lo hace tu IdP, no tu app. */
export function issueToken(config: Config, userId: string, scopes = ["notes:read", "notes:write"], ttl = "1h") {
  return new SignJWT({ scope: scopes.join(" "), client_id: "demo-client" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(config.secret);
}
