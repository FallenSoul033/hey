import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const ALLOWED_ORIGINS = new Set([
  "https://icefresh.kz",
  "https://www.icefresh.kz",
  "https://icefresh-kz-crm.risingsoul.chatgpt.site",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
]);
const PRODUCT_IDS = new Set(["cup250", "bag1", "bag2"]);
const CUSTOMER_TYPES = new Set(["private", "business"]);
const RATE_LIMIT_PER_HOUR = 5;

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

async function hmacHex(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    input = await request.json();
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
  const productId = cleanText(input.productId, 20);
  const message = cleanText(input.message, 500);
  const quantity = Number(input.quantity);

  if (
    customerName.length < 2 ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15 ||
    !CUSTOMER_TYPES.has(customerType) ||
    !PRODUCT_IDS.has(productId) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000
  ) {
    return response(origin, { ok: false, message: "Проверьте имя, телефон, продукцию и количество." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return response(origin, { ok: false, message: "Сервис временно недоступен." }, 503);

  const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = request.headers.get("cf-connecting-ip") ?? forwardedIp ?? "unknown";
  const ipHash = await hmacHex(clientIp, serviceRoleKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: rateError } = await supabase
    .from("website_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (rateError) {
    console.error("website request rate check failed", rateError.code);
    return response(origin, { ok: false, message: "Сервис временно недоступен." }, 503);
  }
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return response(origin, { ok: false, message: "Слишком много заявок. Попробуйте позже." }, 429);
  }

  // This is a single-business installation: attach public enquiries to its first organization.
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (organizationError || !organization) {
    console.error("website request organization lookup failed", organizationError?.code);
    return response(origin, { ok: false, message: "Сервис временно недоступен." }, 503);
  }

  const { data, error } = await supabase
    .from("website_requests")
    .insert({
      organization_id: organization.id,
      customer_name: customerName,
      phone,
      customer_type: customerType,
      product_id: productId,
      quantity,
      message,
      ip_hash: ipHash,
    })
    .select("id")
    .single();
  if (error) {
    console.error("website request insert failed", error.code);
    return response(origin, { ok: false, message: "Не удалось сохранить заявку." }, 500);
  }

  return response(origin, { ok: true, requestId: data.id }, 201);
});
