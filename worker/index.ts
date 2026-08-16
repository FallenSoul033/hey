/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { handleAiAssistant, type AiAssistantEnv } from "./ai-assistant";

interface Env extends AiAssistantEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net; img-src 'self' data: https://*.supabase.co; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

function secure(response: Response, cacheControl?: string, robotsTag?: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  if (robotsTag) headers.set("X-Robots-Tag", robotsTag);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function applicationShell(request: Request, env: Env, internal: boolean): Promise<Response> {
  const shellRequest = new Request(new URL("/app-shell.html", request.url), {
    method: "GET",
    headers: request.headers,
  });
  return secure(
    await env.ASSETS.fetch(shellRequest),
    internal ? "no-store" : "no-cache",
    internal ? "noindex, nofollow" : "index, follow",
  );
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/ai-assistant") {
      return secure(await handleAiAssistant(request, env), "no-store");
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return applicationShell(request, env, false);
    }

    if (url.pathname === "/app" || url.pathname.startsWith("/app/")) {
      return applicationShell(request, env, true);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return secure(await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths));
    }

    if (/\.(?:html|css|js|json|svg|txt|xml|webmanifest)$/.test(url.pathname) || url.pathname.startsWith("/assets/")) {
      const noCache = ["/sw.js", "/config.js", "/version.json"].includes(url.pathname);
      return secure(await env.ASSETS.fetch(request), noCache ? "no-cache" : undefined);
    }

    return secure(await handler.fetch(request, env, ctx));
  },
};

export default worker;
