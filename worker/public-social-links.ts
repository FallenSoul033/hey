interface PublicSocialLinksEnv {
  ASSETS: Fetcher;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

interface PublicSupabaseConfig {
  url: string;
  key: string;
}

const PUBLIC_FIELDS = "platform,url,label,sort_order";
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

async function publicSupabaseConfig(request: Request, env: PublicSocialLinksEnv): Promise<PublicSupabaseConfig | null> {
  const envUrl = validSupabaseUrl(env.SUPABASE_URL || "");
  const envKey = validPublishableKey(env.SUPABASE_PUBLISHABLE_KEY || "");
  if (envUrl && envKey) return { url: envUrl, key: envKey };

  const configRequest = new Request(new URL("/config.js", request.url), { method: "GET" });
  const response = await env.ASSETS.fetch(configRequest);
  if (!response.ok) return null;
  const source = await response.text();
  const url = validSupabaseUrl(source.match(/supabaseUrl\s*:\s*['"]([^'"]+)['"]/)?.[1] || "");
  const key = validPublishableKey(source.match(/supabasePublishableKey\s*:\s*['"]([^'"]+)['"]/)?.[1] || "");
  return url && key ? { url, key } : null;
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

    const endpoint = new URL("/rest/v1/social_links", config.url);
    endpoint.searchParams.set("select", PUBLIC_FIELDS);
    endpoint.searchParams.set("order", "sort_order.asc,platform.asc");
    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    const payload = await upstream.json().catch(() => null) as { code?: string } | unknown[] | null;

    if (!upstream.ok) {
      const code = payload && !Array.isArray(payload) ? String(payload.code || "") : "";
      if (upstream.status === 404 || MISSING_RELATION_CODES.has(code)) {
        return json({ links: [], available: false });
      }
      return json({ links: [], available: null, degraded: true });
    }

    return json({ links: Array.isArray(payload) ? payload : [], available: true });
  } catch {
    return json({ links: [], available: null, degraded: true });
  }
}
