import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const ALLOWED_ORIGINS = new Set([
  "https://icefresh.kz",
  "https://www.icefresh.kz",
  "https://icefresh-kz-crm.risingsoul.chatgpt.site",
]);
const CUSTOMER_TYPES = new Set(["private", "business"]);
const MAX_BODY_BYTES = 6_000;

function response(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "content-type, apikey",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return response("null", { ok: false, message: "Недопустимый источник запроса." }, 403);
  }
  if (request.method === "OPTIONS") return response(origin, { ok: true });
  if (request.method !== "POST") return response(origin, { ok: false, message: "Метод не поддерживается." }, 405);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return response(origin, { ok: false, message: "Слишком большой запрос." }, 413);

  let rawBody = "";
  let input: Record<string, unknown>;
  try {
    rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return response(origin, { ok: false, message: "Слишком большой запрос." }, 413);
    }
    input = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return response(origin, { ok: false, message: "Некорректные данные заявки." }, 400);
  }

  // Honeypot: acknowledge automated submissions without storing them.
  if (cleanText(input.website, 200)) return response(origin, { ok: true }, 201);

  const startedAt = Number(input.startedAt);
  const elapsed = Date.now() - startedAt;
  if (!Number.isFinite(startedAt) || elapsed < 900 || elapsed > 86_400_000) {
    return response(origin, { ok: false, message: "Обновите страницу и заполните форму ещё раз." }, 400);
  }

  const customerName = cleanText(input.customerName, 120);
  const phone = cleanText(input.phone, 40);
  const phoneDigits = phone.replace(/\D/g, "");
  const customerType = cleanText(input.customerType, 20);
  const productId = cleanText(input.productId, 80);
  const message = cleanText(input.message, 500);
  const idempotencyKey = cleanText(input.idempotencyKey, 36);
  const quantity = Number(input.quantity);

  if (
    customerName.length < 2 ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15 ||
    !CUSTOMER_TYPES.has(customerType) ||
    productId.length < 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000
  ) {
    return response(origin, { ok: false, message: "Проверьте имя, телефон, продукцию и количество." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return response(origin, { ok: false, message: "Сервис временно недоступен." }, 503);
  }

  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = request.headers.get("cf-connecting-ip") ?? forwardedIp ?? "unknown";
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let organizationId = Deno.env.get("ICEFRESH_ORGANIZATION_ID")?.trim() ?? "";
  if (!organizationId) {
    const { data: organizations, error: organizationError } = await supabase
      .from("organizations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(2);
    if (organizationError || organizations?.length !== 1) {
      console.error("website request organization lookup failed", organizationError?.code);
      return response(origin, { ok: false, message: "Сервис временно недоступен." }, 503);
    }
    organizationId = organizations[0].id;
  }
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    console.error("website request organization id is invalid");
    return response(origin, { ok: false, message: "Сервис временно недоступен." }, 503);
  }

  const { data, error } = await supabase.rpc("submit_public_request_rc", {
    p_organization_id: organizationId,
    p_idempotency_key: idempotencyKey,
    p_customer_name: customerName,
    p_phone: phone,
    p_customer_type: customerType,
    p_product_id: productId,
    p_quantity: quantity,
    p_message: message,
    // The SECURITY DEFINER RPC immediately HMACs this value with its private,
    // database-only secret; the raw address is never stored in a table.
    p_client_ip: clientIp,
  });
  if (error) {
    if (error.message?.includes("PUBLIC_RATE_LIMIT")) {
      return response(origin, { ok: false, message: "Слишком много заявок. Попробуйте позже." }, 429);
    }
    if (error.message?.includes("PUBLIC_PRODUCT_UNAVAILABLE")) {
      return response(origin, { ok: false, message: "Выбранный товар сейчас недоступен." }, 400);
    }
    if (error.message?.includes("PUBLIC_REQUEST_INVALID")) {
      return response(origin, { ok: false, message: "Проверьте данные заявки." }, 400);
    }
    console.error("website request insert failed", error.code);
    return response(origin, { ok: false, message: "Не удалось сохранить заявку." }, 500);
  }

  return response(origin, { ok: true, requestId: data }, 201);
});
