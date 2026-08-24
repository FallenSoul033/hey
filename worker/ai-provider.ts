export type OutboundFetch = typeof fetch;

export interface AiProviderEnv {
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  AI_CUSTOM_API_KEY?: string;
  AI_CUSTOM_BASE_URL?: string;
  AI_CUSTOM_MODEL?: string;
}

export type ProviderRequest = {
  prompt: string;
  instructions: string;
  safetyIdentifier: string;
  openAIKey?: string | null;
};

export type ProviderResult =
  | { ok: true; reply: string; provider: string; model: string }
  | { ok: false; status: number; error: "not_configured" | "rate_limit" | "timeout" | "upstream" | "empty" | "invalid_endpoint" };

const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function normalizedProvider(env: AiProviderEnv): "openai" | "anthropic" | "gemini" | "custom" {
  const value = String(env.AI_PROVIDER || "openai").trim().toLowerCase();
  if (value === "anthropic" || value === "claude") return "anthropic";
  if (value === "gemini" || value === "google") return "gemini";
  if (value === "custom" || value === "openai-compatible") return "custom";
  return "openai";
}

function safeCustomBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "127.0.0.1" || host === "::1") return null;
    if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function openAIText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap(part => {
      if (!part || typeof part !== "object") return [];
      const value = part as { type?: unknown; text?: unknown };
      return value.type === "output_text" && typeof value.text === "string" ? [value.text] : [];
    });
  }).join("\n").trim();
}

function anthropicText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content.flatMap(part => {
    if (!part || typeof part !== "object") return [];
    const value = part as { type?: unknown; text?: unknown };
    return value.type === "text" && typeof value.text === "string" ? [value.text] : [];
  }).join("\n").trim();
}

function geminiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return "";
  return candidates.flatMap(candidate => {
    if (!candidate || typeof candidate !== "object") return [];
    const content = (candidate as { content?: { parts?: unknown } }).content;
    if (!content || !Array.isArray(content.parts)) return [];
    return content.parts.flatMap(part => {
      if (!part || typeof part !== "object") return [];
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? [text] : [];
    });
  }).join("\n").trim();
}

async function fetchWithTimeout(fetcher: OutboundFetch, url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetcher(url, { ...init, signal: AbortSignal.timeout(45_000) });
  } catch {
    return null;
  }
}

export async function callAiProvider(
  request: ProviderRequest,
  env: AiProviderEnv,
  outboundFetch: OutboundFetch,
): Promise<ProviderResult> {
  const provider = normalizedProvider(env);

  if (provider === "openai") {
    const apiKey = request.openAIKey?.trim() || env.OPENAI_API_KEY?.trim();
    if (!apiKey) return { ok: false, status: 503, error: "not_configured" };
    const model = env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
    const response = await fetchWithTimeout(outboundFetch, "https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: request.instructions,
        input: [{ role: "user", content: [{ type: "input_text", text: request.prompt }] }],
        max_output_tokens: 700,
        store: false,
        safety_identifier: request.safetyIdentifier,
      }),
    });
    if (!response) return { ok: false, status: 504, error: "timeout" };
    if (!response.ok) return { ok: false, status: response.status === 429 ? 429 : 502, error: response.status === 429 ? "rate_limit" : "upstream" };
    const reply = openAIText(await response.json());
    return reply ? { ok: true, reply, provider: "OpenAI", model } : { ok: false, status: 502, error: "empty" };
  }

  if (provider === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return { ok: false, status: 503, error: "not_configured" };
    const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
    const response = await fetchWithTimeout(outboundFetch, "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 700, system: request.instructions, messages: [{ role: "user", content: request.prompt }] }),
    });
    if (!response) return { ok: false, status: 504, error: "timeout" };
    if (!response.ok) return { ok: false, status: response.status === 429 ? 429 : 502, error: response.status === 429 ? "rate_limit" : "upstream" };
    const reply = anthropicText(await response.json());
    return reply ? { ok: true, reply, provider: "Anthropic", model } : { ok: false, status: 502, error: "empty" };
  }

  if (provider === "gemini") {
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!apiKey) return { ok: false, status: 503, error: "not_configured" };
    const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetchWithTimeout(outboundFetch, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.instructions }] },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: { maxOutputTokens: 700 },
      }),
    });
    if (!response) return { ok: false, status: 504, error: "timeout" };
    if (!response.ok) return { ok: false, status: response.status === 429 ? 429 : 502, error: response.status === 429 ? "rate_limit" : "upstream" };
    const reply = geminiText(await response.json());
    return reply ? { ok: true, reply, provider: "Google Gemini", model } : { ok: false, status: 502, error: "empty" };
  }

  const baseUrl = safeCustomBaseUrl(env.AI_CUSTOM_BASE_URL);
  const apiKey = env.AI_CUSTOM_API_KEY?.trim();
  const model = env.AI_CUSTOM_MODEL?.trim();
  if (!baseUrl) return { ok: false, status: 503, error: "invalid_endpoint" };
  if (!apiKey || !model) return { ok: false, status: 503, error: "not_configured" };
  const response = await fetchWithTimeout(outboundFetch, `${baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: request.instructions, input: request.prompt, max_output_tokens: 700, store: false }),
  });
  if (!response) return { ok: false, status: 504, error: "timeout" };
  if (!response.ok) return { ok: false, status: response.status === 429 ? 429 : 502, error: response.status === 429 ? "rate_limit" : "upstream" };
  const reply = openAIText(await response.json());
  return reply ? { ok: true, reply, provider: "Custom OpenAI-compatible", model } : { ok: false, status: 502, error: "empty" };
}
