interface PublicSocialLinksEnv {
  ASSETS: Fetcher;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ICEFRESH_ORGANIZATION_ID?: string;
}

interface PublicSupabaseConfig {
  url: string;
  key: string;
  organizationId: string;
}

const PUBLIC_FIELDS = "platform,url,label,sort_order";
const PUBLIC_PRODUCT_FIELDS = "id,name,description,weight_label,default_price,unit,photo_path,active,public_visible,sort_order";
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205"]);

function json(body: unknown, status = 200): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function validSupabaseUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co")
      ? parsed.origin
      : "";
  } catch {
    return "";
  }
}

function validPublishableKey(value: string): string {
  const key = value.trim();
  return /^[A-Za-z0-9._-]{20,512}$/.test(key) ? key : "";
}

function validOrganizationId(value: string): string {
  const id = value.trim().toLowerCase();
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) ? id : "";
}

async function publicSupabaseConfig(request: Request, env: PublicSocialLinksEnv): Promise<PublicSupabaseConfig | null> {
  const envUrl = validSupabaseUrl(env.SUPABASE_URL || "");
  const envKey = validPublishableKey(env.SUPABASE_PUBLISHABLE_KEY || "");
  const organizationId = validOrganizationId(env.ICEFRESH_ORGANIZATION_ID || "");
  if (!organizationId) return null;
  if (envUrl && envKey) return { url: envUrl, key: envKey, organizationId };

  const configRequest = new Request(new URL("/config.js", request.url), { method: "GET" });
  const response = await env.ASSETS.fetch(configRequest);
  if (!response.ok) return null;
  const source = await response.text();
  const url = validSupabaseUrl(source.match(/supabaseUrl\s*:\s*['"]([^'"]+)['"]/)?.[1] || "");
  const key = validPublishableKey(source.match(/supabasePublishableKey\s*:\s*['"]([^'"]+)['"]/)?.[1] || "");
  return url && key ? { url, key, organizationId } : null;
}

async function publicRows(
  config: PublicSupabaseConfig,
  relation: "social_links" | "products",
  fields: string,
  order: string,
): Promise<{ payload: unknown[] | null; status: number; code: string }> {
  const endpoint = new URL(`/rest/v1/${relation}`, config.url);
  endpoint.searchParams.set("select", fields);
  endpoint.searchParams.set("organization_id", `eq.${config.organizationId}`);
  endpoint.searchParams.set("order", order);
  const upstream = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    signal: AbortSignal.timeout(6000),
  });
  const body = await upstream.json().catch(() => null) as { code?: string } | unknown[] | null;
  return {
    payload: Array.isArray(body) ? body : null,
    status: upstream.status,
    code: body && !Array.isArray(body) ? String(body.code || "") : "",
  };
}

export async function handlePublicSocialLinks(request: Request, env: PublicSocialLinksEnv): Promise<Response> {
  if (request.method !== "GET") {
    const response = json({ error: "method_not_allowed" }, 405);
    response.headers.set("Allow", "GET");
    return response;
  }

  try {
    const config = await publicSupabaseConfig(request, env);
    if (!config) return json({ links: [], available: null, degraded: true });

    const upstream = await publicRows(config, "social_links", PUBLIC_FIELDS, "sort_order.asc,platform.asc");
    if (upstream.status < 200 || upstream.status >= 300) {
      if (upstream.status === 404 || MISSING_RELATION_CODES.has(upstream.code)) {
        return json({ links: [], available: false });
      }
      return json({ links: [], available: null, degraded: true });
    }

    return json({ links: upstream.payload || [], available: true });
  } catch {
    return json({ links: [], available: null, degraded: true });
  }
}

export async function handlePublicProducts(request: Request, env: PublicSocialLinksEnv): Promise<Response> {
  if (request.method !== "GET") {
    const response = json({ error: "method_not_allowed" }, 405);
    response.headers.set("Allow", "GET");
    return response;
  }

  try {
    const config = await publicSupabaseConfig(request, env);
    if (!config) return json({ products: [], available: null, degraded: true });
    const upstream = await publicRows(config, "products", PUBLIC_PRODUCT_FIELDS, "sort_order.asc,name.asc");
    if (upstream.status < 200 || upstream.status >= 300) {
      if (upstream.status === 404 || MISSING_RELATION_CODES.has(upstream.code)) {
        return json({ products: [], available: false });
      }
      return json({ products: [], available: null, degraded: true });
    }
    return json({ products: upstream.payload || [], available: true });
  } catch {
    return json({ products: [], available: null, degraded: true });
  }
}
