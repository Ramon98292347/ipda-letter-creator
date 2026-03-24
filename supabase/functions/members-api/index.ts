/**
 * members-api
 * ===========
 * Função unificada que roteia ações de gestão de membros/obreiros.
 *
 * Campos do body:
 *   action: "save"          → salva/cria usuário (requer JWT: admin/pastor/secretario OU x-admin-key)
 *   action: "save-profile"  → atualiza o próprio perfil (requer JWT: qualquer role)
 *   action: "get-profile"   → obtém o próprio perfil (requer JWT: qualquer role)
 *   action: "upload-photo"  → faz upload de foto de obreiro (requer JWT: qualquer role)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { jwtVerify } from "https://esm.sh/jose@5.2.4";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers compartilhados
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: headers CORS necessários para chamadas do frontend.
// Incluímos x-admin-key para que a action "save" possa ser chamada
// com chave de administrador master.
function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-admin-key, x-client-info",
  };
}

// Comentario: retorna JSON com status HTTP e headers CORS já incluídos.
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: secretario = 2°/3° pastor. financeiro = role futuro.
type Role = "admin" | "pastor" | "obreiro" | "secretario" | "financeiro";
type ChurchClass = "estadual" | "setorial" | "central" | "regional" | "local";

type SessionClaims = {
  user_id: string;
  role: Role;
  active_totvs_id: string;
};

type TotvsAccessItem = {
  totvs_id: string;
  role: Role;
};

type ChurchRow = {
  totvs_id: string;
  parent_totvs_id: string | null;
  class: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Verificação de JWT de sessão
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: valida o token Bearer enviado no header Authorization.
// Retorna os dados da sessão (user_id, role, active_totvs_id) ou null se inválido.
async function verifySessionJWT(req: Request): Promise<SessionClaims | null> {
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
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(role)) return null;
    return { user_id, role, active_totvs_id };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Funções auxiliares para a action "save"
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: remove todos os caracteres que não sejam dígitos de uma string.
function onlyDigits(value: string) {
  return String(value || "").replace(/\D+/g, "");
}

// Comentario: garante que o valor de classe da igreja é um dos valores válidos
// ou retorna null se não reconhecer.
function normalizeChurchClass(value: string | null | undefined): ChurchClass | null {
  const safe = String(value || "").trim().toLowerCase();
  if (
    safe === "estadual" ||
    safe === "setorial" ||
    safe === "central" ||
    safe === "regional" ||
    safe === "local"
  ) {
    return safe;
  }
  return null;
}

// Comentario: calcula o conjunto de igrejas que o pastor pode gerenciar —
// a sua própria igreja e todas as filhas, netas etc.
function computeScope(rootTotvs: string, churches: ChurchRow[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of churches) {
    const parent = String(c.parent_totvs_id || "");
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(String(c.totvs_id));
  }

  const scope = new Set<string>();
  const queue = [rootTotvs];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (scope.has(current)) continue;
    scope.add(current);
    for (const child of children.get(current) || []) queue.push(child);
  }
  return scope;
}

// Comentario: normaliza o campo totvs_access que pode chegar como array de
// strings ou array de objetos {totvs_id, role}. Remove duplicatas.
function normalizeTotvsAccess(input: unknown, fallbackRole: Role): TotvsAccessItem[] {
  if (!Array.isArray(input)) return [];
  const out: TotvsAccessItem[] = [];

  for (const item of input) {
    if (typeof item === "string") {
      const id = item.trim();
      if (id) out.push({ totvs_id: id, role: fallbackRole });
      continue;
    }

    if (!item || typeof item !== "object") continue;
    const id = String((item as Record<string, unknown>).totvs_id || "").trim();
    const roleRaw = String((item as Record<string, unknown>).role || fallbackRole).toLowerCase();
    const role: Role =
      roleRaw === "admin" || roleRaw === "pastor" || roleRaw === "obreiro"
        ? roleRaw
        : fallbackRole;
    if (id) out.push({ totvs_id: id, role });
  }

  // Comentario: remove totvs_ids duplicados mantendo o último encontrado.
  const uniq = new Map<string, TotvsAccessItem>();
  for (const item of out) uniq.set(item.totvs_id, item);
  return [...uniq.values()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Parâmetros de crop 3x4 para upload de foto (não alterar)
// ─────────────────────────────────────────────────────────────────────────────
const PAD_TOP = 0.22;    // espaço acima do rosto
const PAD_BOTTOM = 1.20; // espaço abaixo do queixo (usado como referência de CROP_H)
const PAD_SIDES = 0.38;  // espaço lateral
const CROP_H = 1.90;     // altura total = face_h * CROP_H
const CY_OFFSET = 0.28;  // offset vertical do centro
const OUT_W = 600;       // largura final em pixels
const OUT_H = 800;       // altura final em pixels

// ─────────────────────────────────────────────────────────────────────────────
// Handler: action "save" — cria ou atualiza um usuário (save-user original)
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: tipo do body esperado para a action "save".
type SaveBody = {
  id?: string;
  cpf?: string;
  full_name?: string;
  role?: Role;
  totvs_access?: unknown;
  default_totvs_id?: string | null;
  password?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  baptism_date?: string | null;
  minister_role?: string | null;
  ministerio?: string | null;
  ordination_date?: string | null;
  rg?: string | null;
  marital_status?: string | null;
  matricula?: string | null;
  profession?: string | null;
  avatar_url?: string | null;
  cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  is_active?: boolean | null;
  can_create_released_letter?: boolean | null;
};

async function handleSave(
  req: Request,
  body: SaveBody,
  isAdminByKey: boolean,
  session: SessionClaims | null
): Promise<Response> {
  const requestedId = String(body.id || "").trim();
  const cpfInput = onlyDigits(body.cpf || "");
  const fullNameInput = String(body.full_name || "").trim();

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );

  // Comentario: busca o usuário já existente pelo ID ou pelo CPF para decidir
  // se será insert ou update.
  let existingQuery = sb
    .from("users")
    .select("id, role, matricula, cpf, full_name")
    .limit(1);

  if (requestedId) {
    existingQuery = existingQuery.eq("id", requestedId);
  } else {
    existingQuery = existingQuery.eq("cpf", cpfInput);
  }

  const { data: existingRows, error: existingErr } = await existingQuery;
  if (existingErr) return json({ ok: false, error: "db_error_existing_user" }, 500);
  const existingUser = Array.isArray(existingRows) ? existingRows[0] || null : null;

  const cpf = cpfInput || String(existingUser?.cpf || "").trim();
  const full_name = fullNameInput || String(existingUser?.full_name || "").trim();
  if (cpf.length !== 11) return json({ ok: false, error: "invalid_cpf" }, 400);
  if (!full_name) return json({ ok: false, error: "missing_full_name" }, 400);

  // Comentario: o role do usuário existente nunca é trocado pela edição.
  // Apenas na criação o role informado é considerado.
  const requestedRole = String(body.role || "obreiro").toLowerCase();
  let role: Role = "obreiro";
  if (existingUser?.role) {
    role = String(existingUser.role).toLowerCase() as Role;
  } else if (isAdminByKey) {
    // Comentario: admin master pode criar qualquer role incluindo secretario e financeiro.
    if (!["admin", "pastor", "obreiro", "secretario", "financeiro"].includes(requestedRole)) {
      return json({ ok: false, error: "invalid_role" }, 400);
    }
    role = requestedRole as Role;
  } else if (session?.role === "admin") {
    // Comentario: admin comum pode criar pastor, obreiro, secretario e financeiro.
    if (!["pastor", "obreiro", "secretario", "financeiro"].includes(requestedRole)) {
      return json({ ok: false, error: "invalid_role_for_admin" }, 400);
    }
    role = requestedRole as Role;
  } else {
    role = "obreiro";
  }

  const { data: allChurches, error: allChurchesErr } = await sb
    .from("churches")
    .select("totvs_id, parent_totvs_id, class");
  if (allChurchesErr) return json({ ok: false, error: "db_error_churches" }, 500);

  const churchRows = (allChurches || []) as ChurchRow[];
  const churchSet = new Set(churchRows.map((c) => String(c.totvs_id)));

  let totvsAccess = normalizeTotvsAccess(body.totvs_access, role);
  if (totvsAccess.length === 0 && session?.active_totvs_id) {
    totvsAccess = [{ totvs_id: session.active_totvs_id, role: "obreiro" }];
  }
  if (totvsAccess.length === 0) return json({ ok: false, error: "missing_totvs_access" }, 400);

  const invalidTotvs = totvsAccess.map((a) => a.totvs_id).filter((id) => !churchSet.has(id));
  if (invalidTotvs.length > 0) {
    return json({ ok: false, error: "totvs_not_found", invalid_totvs: invalidTotvs }, 400);
  }

  // Comentario: pastor só consegue cadastrar usuário dentro do próprio escopo de igrejas.
  if (!isAdminByKey && session?.role === "pastor") {
    const activeClass = normalizeChurchClass(
      churchRows.find((c) => c.totvs_id === session.active_totvs_id)?.class
    );
    if (!activeClass) return json({ ok: false, error: "active_church_invalid_class" }, 403);

    const scope = computeScope(session.active_totvs_id, churchRows);
    const outOfScope = totvsAccess.map((a) => a.totvs_id).filter((id) => !scope.has(id));
    if (outOfScope.length > 0) {
      return json({ ok: false, error: "totvs_out_of_scope", out_of_scope: outOfScope }, 403);
    }
  }

  const default_totvs_id =
    String(body.default_totvs_id || "").trim() || totvsAccess[0].totvs_id;
  if (!churchSet.has(default_totvs_id)) {
    return json({ ok: false, error: "default_totvs_not_found" }, 400);
  }

  const password = String(body.password || "");
  const password_hash = password ? bcrypt.hashSync(password, 10) : null;

  const ministerio = String(body.ministerio || body.minister_role || "").trim();
  const matriculaInput = String(body.matricula || "").trim();
  const matriculaFinal =
    matriculaInput ||
    String((existingUser as Record<string, unknown> | undefined)?.matricula || "").trim() ||
    (cpf ? `${cpf.slice(-6)}${Date.now().toString().slice(-4)}` : "");

  const savePayload: Record<string, unknown> = {
    ...(existingUser?.id ? { id: existingUser.id } : {}),
    cpf,
    full_name,
    role,
    phone: body.phone ?? null,
    email: body.email ?? null,
    birth_date: body.birth_date ?? null,
    baptism_date: body.baptism_date ?? null,
    ordination_date: body.ordination_date ?? null,
    minister_role: ministerio || null,
    rg: body.rg ?? null,
    marital_status: body.marital_status ?? null,
    ...(matriculaFinal ? { matricula: matriculaFinal } : {}),
    profession: body.profession ?? null,
    avatar_url: body.avatar_url ?? null,
    cep: body.cep ?? null,
    address_street: body.address_street ?? null,
    address_number: body.address_number ?? null,
    address_complement: body.address_complement ?? null,
    address_neighborhood: body.address_neighborhood ?? null,
    address_city: body.address_city ?? null,
    address_state: body.address_state ?? null,
    totvs_access: totvsAccess,
    default_totvs_id,
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    can_create_released_letter:
      typeof body.can_create_released_letter === "boolean"
        ? body.can_create_released_letter
        : false,
  };
  if (password_hash) savePayload.password_hash = password_hash;

  const { data: saved, error: saveErr } = await sb
    .from("users")
    .upsert(savePayload, { onConflict: "cpf" })
    .select(
      "id, cpf, full_name, role, default_totvs_id, totvs_access, is_active, can_create_released_letter, updated_at"
    )
    .single();
  if (saveErr) return json({ ok: false, error: "db_error_save_user" }, 500);

  return json({ ok: true, user: saved }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: action "save-profile" — atualiza o próprio cadastro (save-my-profile original)
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: tipo do body esperado para a action "save-profile".
type SaveProfileBody = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  ordination_date?: string | null;
  minister_role?: string | null;
  cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
};

async function handleSaveProfile(
  session: SessionClaims,
  body: SaveProfileBody
): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceRoleKey);

  // Comentario: esta action permite ao usuário atualizar apenas o próprio
  // cadastro, sem abrir permissão geral de update por RLS.
  const profilePayload = {
    full_name: String(body.full_name || "").trim() || null,
    phone: String(body.phone || "").trim() || null,
    email: String(body.email || "").trim() || null,
    birth_date: String(body.birth_date || "").trim() || null,
    ordination_date: String(body.ordination_date || "").trim() || null,
    minister_role: String(body.minister_role || "").trim() || null,
    cep: String(body.cep || "").trim() || null,
    address_street: String(body.address_street || "").trim() || null,
    address_number: String(body.address_number || "").trim() || null,
    address_complement: String(body.address_complement || "").trim() || null,
    address_neighborhood: String(body.address_neighborhood || "").trim() || null,
    address_city: String(body.address_city || "").trim() || null,
    address_state: String(body.address_state || "").trim().toUpperCase() || null,
  };

  if (!profilePayload.full_name) return json({ ok: false, error: "missing_full_name" }, 400);
  if (!profilePayload.phone) return json({ ok: false, error: "missing_phone" }, 400);

  const { data, error } = await sb
    .from("users")
    .update(profilePayload)
    .eq("id", session.user_id)
    .select(
      "id, full_name, phone, email, birth_date, ordination_date, minister_role, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, is_active, can_create_released_letter"
    )
    .single();

  if (error) return json({ ok: false, error: "db_error_update_profile" }, 500);

  return json({ ok: true, profile: data }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: action "get-profile" — obtém o próprio perfil (get-my-profile original)
// ─────────────────────────────────────────────────────────────────────────────

async function handleGetProfile(session: SessionClaims): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await sb
    .from("users")
    .select(
      "id, full_name, phone, email, birth_date, ordination_date, minister_role, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, is_active, can_create_released_letter"
    )
    .eq("id", session.user_id)
    .single();

  if (error) return json({ ok: false, error: "db_error_get_profile" }, 500);

  return json({ ok: true, profile: data }, 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler: action "upload-photo" — upload de foto de obreiro (upload-obreiro-photo original)
// ─────────────────────────────────────────────────────────────────────────────

// Comentario: detecta o rosto por variância de luminância em grade 8x8.
// Retorna {x, y, w, h} em proporção da imagem (0.0 a 1.0)
// ou null se não encontrar rosto.
function detectarRostoPorLuminancia(
  pixels: Uint8Array,
  imgW: number,
  imgH: number
): { x: number; y: number; w: number; h: number } | null {
  const GRID = 8; // grade 8x8
  const cellW = Math.floor(imgW / GRID);
  const cellH = Math.floor(imgH / GRID);

  // Calcular a variância de cada célula da grade
  const variancias: number[][] = Array.from({ length: GRID }, () =>
    new Array(GRID).fill(0)
  );

  let maxVar = 0;
  let maxRow = -1;
  let maxCol = -1;

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const startX = col * cellW;
      const startY = row * cellH;

      // Calcular luminância média da célula
      let soma = 0;
      let count = 0;
      for (let y = startY; y < startY + cellH && y < imgH; y++) {
        for (let x = startX; x < startX + cellW && x < imgW; x++) {
          const idx = (y * imgW + x) * 4;
          // Fórmula de luminância: 0.299R + 0.587G + 0.114B
          const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
          soma += lum;
          count++;
        }
      }
      const media = soma / count;

      // Calcular variância
      let somaVar = 0;
      for (let y = startY; y < startY + cellH && y < imgH; y++) {
        for (let x = startX; x < startX + cellW && x < imgW; x++) {
          const idx = (y * imgW + x) * 4;
          const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
          somaVar += Math.pow(lum - media, 2);
        }
      }
      variancias[row][col] = somaVar / count;

      if (variancias[row][col] > maxVar) {
        maxVar = variancias[row][col];
        maxRow = row;
        maxCol = col;
      }
    }
  }

  // Se não encontrou variância significativa, não há rosto
  if (maxVar < 100 || maxRow < 0) return null;

  // Estimamos a caixa do rosto ao redor da célula de maior variância.
  // Assumimos que o rosto ocupa ~3x3 células centradas na de maior variância.
  const faceGridW = 3;
  const faceGridH = 4;
  const startCol = Math.max(0, maxCol - Math.floor(faceGridW / 2));
  const startRow = Math.max(0, maxRow - Math.floor(faceGridH / 2));
  const endCol = Math.min(GRID, startCol + faceGridW);
  const endRow = Math.min(GRID, startRow + faceGridH);

  return {
    x: (startCol * cellW) / imgW,
    y: (startRow * cellH) / imgH,
    w: ((endCol - startCol) * cellW) / imgW,
    h: ((endRow - startRow) * cellH) / imgH,
  };
}

// Comentario: aplica crop 3x4 com os parâmetros calibrados.
// Recebe pixels RGBA e retorna as coordenadas do recorte.
function aplicarCrop3x4(
  pixels: Uint8Array,
  imgW: number,
  imgH: number,
  face: { x: number; y: number; w: number; h: number }
): { cropX: number; cropY: number; cropW: number; cropH: number } {
  // Dimensões absolutas do rosto detectado
  const faceW = face.w * imgW;
  const faceH = face.h * imgH;
  const faceCX = (face.x + face.w / 2) * imgW;
  const faceCY = (face.y + face.h / 2) * imgH + CY_OFFSET * faceH;

  // Largura e altura do crop baseadas no rosto
  const cropW = faceW * (1 + 2 * PAD_SIDES);
  const cropH = faceH * CROP_H;

  // Posição do crop centralizada no rosto
  const cropX = Math.round(faceCX - cropW / 2);
  const cropY = Math.round(faceCY - PAD_TOP * faceH - faceH * 0.5);

  // Limitar aos limites da imagem
  const clampX = Math.max(0, Math.min(cropX, imgW - 1));
  const clampY = Math.max(0, Math.min(cropY, imgH - 1));
  const clampW = Math.min(cropW, imgW - clampX);
  const clampH = Math.min(cropH, imgH - clampY);

  return {
    cropX: Math.round(clampX),
    cropY: Math.round(clampY),
    cropW: Math.round(clampW),
    cropH: Math.round(clampH),
  };
}

async function handleUploadPhoto(
  body: { obreiroId?: string; imageBase64?: string; mimeType?: string }
): Promise<Response> {
  const { obreiroId, imageBase64, mimeType } = body;

  // Comentario: obreiroId e imageBase64 são obrigatórios para o upload.
  if (!obreiroId || !imageBase64) {
    return json({ error: "obreiroId e imageBase64 são obrigatórios" }, 400);
  }

  try {
    // ---- Passo 1: Decodificar a imagem base64 ----
    // Remove o prefixo "data:image/jpeg;base64," se existir
    const base64Puro = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const bytesImagem = Uint8Array.from(atob(base64Puro), (c) => c.charCodeAt(0));

    // ---- Passo 2: Tentar enviar para o Cloudflare Worker (remoção de fundo) ----
    // Nota: Como Deno Edge não tem Canvas API nativa, usamos uma abordagem
    // de detecção por luminância na grade 8x8 e enviamos para o CF Worker
    // com a imagem original. O CF Worker aplica o crop na imagem completa.
    // O crop foi feito no frontend via face-api.js.
    const cfWorkerUrl = Deno.env.get("CF_WORKER_URL");

    let imagemFinal: string;
    let mimeTypeFinal = "image/jpeg";

    if (cfWorkerUrl) {
      // ---- Passo 3: Chamar o Cloudflare Worker para remover o fundo ----
      const cfResponse = await fetch(cfWorkerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: imageBase64,
          mimeType: mimeType || "image/jpeg",
        }),
      });

      if (cfResponse.ok) {
        const cfData = await cfResponse.json() as { imageBase64: string; mimeType: string };
        imagemFinal = cfData.imageBase64.replace(/^data:[^;]+;base64,/, "");
        mimeTypeFinal = "image/png"; // resultado do rembg é sempre PNG
      } else {
        // Se o CF Worker falhar, usar imagem original
        console.warn("CF Worker falhou, usando imagem original");
        imagemFinal = base64Puro;
      }
    } else {
      // Sem CF Worker configurado, usar imagem original
      imagemFinal = base64Puro;
    }

    // ---- Passo 4: Upload no Supabase Storage ----
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const ext = mimeTypeFinal === "image/png" ? "png" : "jpg";
    const storagePath = `avatars/users/${obreiroId}.${ext}`;
    const imageBytes = Uint8Array.from(atob(imagemFinal), (c) => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(storagePath, imageBytes, {
        contentType: mimeTypeFinal,
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      throw new Error(`Erro no upload: ${uploadError.message}`);
    }

    // Obter URL pública com cache-bust
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(storagePath);

    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    // ---- Passo 5: Atualizar avatar_url na tabela users ----
    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", obreiroId);

    if (updateError) {
      // Não é crítico — a URL já está no storage
      console.warn("Aviso: não foi possível atualizar avatar_url:", updateError.message);
    }

    return json({ success: true, avatar_url: avatarUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Erro ao processar foto: ${msg}` }, 500);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada principal — roteamento por campo "action"
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Comentario: responde ao preflight do CORS sem processar nada.
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    // Comentario: lê o body uma única vez — todas as actions recebem JSON.
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "").trim();

    // Comentario: verifica autenticação — válida para todas as actions.
    // A action "save" também aceita x-admin-key como alternativa ao JWT.
    const adminKey = Deno.env.get("ADMIN_KEY") || "";
    const adminHeader = req.headers.get("x-admin-key") || "";
    const isAdminByKey = Boolean(adminKey && adminHeader && adminHeader === adminKey);
    const session = isAdminByKey ? null : await verifySessionJWT(req);

    switch (action) {
      // ── action: "save" ───────────────────────────────────────────────────
      case "save": {
        // Comentario: somente admin (por chave ou JWT) e pastor podem salvar usuários.
        // Obreiros não têm permissão.
        if (!isAdminByKey && !session) return json({ ok: false, error: "unauthorized" }, 401);
        if (!isAdminByKey && session?.role === "obreiro") {
          return json({ ok: false, error: "forbidden" }, 403);
        }
        return await handleSave(req, body as SaveBody, isAdminByKey, session);
      }

      // ── action: "save-profile" ───────────────────────────────────────────
      case "save-profile": {
        // Comentario: qualquer usuário autenticado pode atualizar o próprio perfil.
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleSaveProfile(session, body as SaveProfileBody);
      }

      // ── action: "get-profile" ────────────────────────────────────────────
      case "get-profile": {
        // Comentario: qualquer usuário autenticado pode consultar o próprio perfil.
        if (!session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleGetProfile(session);
      }

      // ── action: "upload-photo" ───────────────────────────────────────────
      case "upload-photo": {
        // Comentario: qualquer usuário autenticado pode fazer upload de foto.
        if (!isAdminByKey && !session) return json({ ok: false, error: "unauthorized" }, 401);
        return await handleUploadPhoto(
          body as { obreiroId?: string; imageBase64?: string; mimeType?: string }
        );
      }

      default:
        return json({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (err) {
    return json({ ok: false, error: "exception" }, 500);
  }
});
