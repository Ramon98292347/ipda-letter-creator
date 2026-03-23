/**
 * _shared/jwt.ts
 * --------------
 * Verificação do JWT customizado da aplicação (USER_SESSION_JWT_SECRET).
 * Importar com: import { verifySessionJWT, type SessionClaims } from "../_shared/jwt.ts";
 *
 * Usado por todas as edge functions que requerem autenticação.
 * O token é gerado pela função `login` e enviado pelo frontend no header Authorization.
 */

import { jwtVerify } from "https://esm.sh/jose@5.2.4";

export type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";

export type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

const ALLOWED_ROLES: Role[] = ["admin", "pastor", "obreiro", "secretario", "financeiro"];

/**
 * Verifica o JWT da sessão customizada da aplicação.
 * Retorna os dados do usuário logado ou null se inválido/expirado.
 */
export async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const secret = Deno.env.get("USER_SESSION_JWT_SECRET") || "";
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });

    const user_id = String(payload.sub || "");
    const role = String(payload.role || "").toLowerCase() as Role;
    const active_totvs_id = String(payload.active_totvs_id || "");

    if (!user_id || !active_totvs_id) return null;
    if (!ALLOWED_ROLES.includes(role)) return null;

    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}
