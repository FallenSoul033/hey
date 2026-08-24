import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const ALLOWED_ORIGINS = new Set([
  "https://icefresh.kz",
  "https://www.icefresh.kz",
  "https://icefresh-kz-crm.risingsoul.chatgpt.site",
]);
const CUSTOMER_TYPES = new Set(["private", "business"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "content-type, apikey",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
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
  if (contentLength > 6000) return response(origin, { ok: false, message: "Слишком большой запрос." }, 413);

  let input: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 6000) {
      return response(origin, { ok: false, message: "Слишком большой запрос." }, 413);
    }
    input = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return response(origin, { ok: false, message: "Некорректные данные заявки." }, 400);
  }

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
  const quantity = Number(input.quantity);
  const suppliedIdempotencyKey = cleanText(input.idempotencyKey, 40);
  const idempotencyKey = suppliedIdempotencyKey || crypto.randomUUID();

  if (
    customerName.length < 2 ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15 ||
    !CUSTOMER_TYPES.has(customerType) ||
    productId.length < 1 ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000 ||
    (suppliedIdempotencyKey.length > 0 && !UUID_RE.test(suppliedIdempotencyKey))
  ) {
    return response(origin, { ok: false, message: "Проверьте имя, телефон, продукцию и количество." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const configuredOrganizationId = Deno.env.get("ICEFRESH_ORGANIZATION_ID")?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) return response(origin, { ok: false, message: "Сервис временно недоступен." }, 503);

  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = request.headers.get("cf-connecting-ip") ?? forwardedIp ?? "unknown";
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let organization: { id: string } | null = null;
  if (configuredOrganizationId) {
    const { data, error } = await supabase.from("organizations").select("id").eq("id", configuredOrganizationId).maybeSingle();
    if (error) console.error("website request organization lookup failed", error.code);
    organization = data;
  } else {
    const { data, error } = await supabase.from("organizations").select("id").order("created_at", { ascending: true }).limit(2);
    if (error) console.error("website request organization lookup failed", error.code);
    if (data?.length === 1) organization = data[0];
  }
  if (!organization) return response(origin, { ok: false, message: "Сервис временно недоступен." }, 503);

  const { data, error } = await supabase.rpc("submit_public_request_rc", {
    p_organization_id: organization.id,
    p_idempotency_key: idempotencyKey,
    p_customer_name: customerName,
    p_phone: phone,
    p_customer_type: customerType,
    p_product_id: productId,
    p_quantity: quantity,
    p_message: message,
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
      return response(origin, { ok: false, message: "Некорректные данные заявки." }, 400);
    }
    console.error("website request submission failed", error.code);
    return response(origin, { ok: false, message: "Не удалось сохранить заявку." }, 500);
  }

  return response(origin, { ok: true, requestId: data }, 201);
});
