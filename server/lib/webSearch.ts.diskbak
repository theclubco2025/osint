export type WebSearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebSearchProvider = "brave" | "routeway";

export async function webSearch(query: string, opts?: { limit?: number; timeoutMs?: number }): Promise<{
  provider: WebSearchProvider;
  query: string;
  results: WebSearchResult[];
}> {
  const provider = (process.env.OSINT_SEARCH_PROVIDER || "").trim().toLowerCase() as WebSearchProvider;
  if (!provider) {
    return { provider: "brave", query, results: [] };
  }

  switch (provider) {
    case "brave":
      return braveWebSearch(query, opts);
    case "routeway":
      return routewayWebSearch(query, opts);
    default:
      return { provider: "brave", query, results: [] };
  }
}

async function braveWebSearch(query: string, opts?: { limit?: number; timeoutMs?: number }) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY || "";
  if (!apiKey) return { provider: "brave" as const, query, results: [] };

  const limit = Math.max(1, Math.min(20, opts?.limit ?? 10));
  const timeoutMs = Math.max(3000, Math.min(30000, opts?.timeoutMs ?? 15000));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Dpt-of-Karma-OSINT/1.0 (+local)",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Brave Search HTTP ${res.status}: ${text.slice(0, 500)}`);
    const json = text ? (JSON.parse(text) as any) : null;

    const items = Array.isArray(json?.web?.results) ? json.web.results : [];
    const results: WebSearchResult[] = items
      .map((r: any) => ({
        title: String(r?.title ?? "").trim(),
        url: String(r?.url ?? "").trim(),
        snippet: String(r?.description ?? "").trim() || undefined,
      }))
      .filter((r: WebSearchResult) => r.title && r.url);

    return { provider: "brave" as const, query, results };
  } finally {
    clearTimeout(t);
  }
}

function normalizeResults(raw: any): WebSearchResult[] {
  // Accept common shapes:
  // - { web: { results: [{ title, url, description }] } } (Brave-like)
  // - { results: [{ title, url, snippet }] }
  // - { data: [{ title, url, snippet }] }
  // - [{ title, url, snippet }]
  const items =
    (Array.isArray(raw?.web?.results) && raw.web.results) ||
    (Array.isArray(raw?.results) && raw.results) ||
    (Array.isArray(raw?.data) && raw.data) ||
    (Array.isArray(raw) && raw) ||
    [];

  return (items as any[])
    .map((r: any) => ({
      title: String(r?.title ?? r?.name ?? "").trim(),
      url: String(r?.url ?? r?.link ?? "").trim(),
      snippet: String(r?.snippet ?? r?.description ?? r?.summary ?? "").trim() || undefined,
    }))
    .filter((r: WebSearchResult) => r.title && r.url);
}

async function routewayWebSearch(query: string, opts?: { limit?: number; timeoutMs?: number }) {
  const apiKey = process.env.ROUTEWAY_API_KEY || "";
  const searchUrl = process.env.ROUTEWAY_SEARCH_URL || "";
  if (!apiKey || !searchUrl) return { provider: "routeway" as const, query, results: [] };

  const limit = Math.max(1, Math.min(20, opts?.limit ?? 10));
  const timeoutMs = Math.max(3000, Math.min(30000, opts?.timeoutMs ?? 15000));
  const method = (process.env.ROUTEWAY_SEARCH_METHOD || "GET").trim().toUpperCase();

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    if (method === "POST") {
      res = await fetch(searchUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "Dpt-of-Karma-OSINT/1.0 (+local)",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ q: query, query, count: limit, limit }),
        signal: controller.signal,
      });
    } else {
      const url = new URL(searchUrl);
      if (!url.searchParams.get("q")) url.searchParams.set("q", query);
      if (!url.searchParams.get("query")) url.searchParams.set("query", query);
      if (!url.searchParams.get("count")) url.searchParams.set("count", String(limit));
      if (!url.searchParams.get("limit")) url.searchParams.set("limit", String(limit));
      res = await fetch(url.toString(), {
        headers: {
          accept: "application/json",
          "user-agent": "Dpt-of-Karma-OSINT/1.0 (+local)",
          authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
    }

    const text = await res.text();
    if (!res.ok) throw new Error(`Routeway Search HTTP ${res.status}: ${text.slice(0, 500)}`);
    const json = text ? (JSON.parse(text) as any) : null;
    const results = normalizeResults(json);
    return { provider: "routeway" as const, query, results };
  } finally {
    clearTimeout(t);
  }
}


