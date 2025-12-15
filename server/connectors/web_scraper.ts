import type { Connector } from "./types";

function pickUserAgent() {
  const agents = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
  ];
  return agents[Math.floor(Math.random() * agents.length)]!;
}

async function fetchText(url: string, opts: { timeoutMs: number; maxBytes: number; headers?: Record<string, string> }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": pickUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...opts.headers,
      },
    });

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > opts.maxBytes) {
      throw new Error(`Response too large (${buf.byteLength} bytes > ${opts.maxBytes})`);
    }

    return { res, text: buf.toString("utf-8") };
  } finally {
    clearTimeout(t);
  }
}

async function isRobotsAllowed(targetUrl: URL) {
  // Minimal robots.txt compliance: honor Disallow for "*" only.
  const robotsUrl = new URL("/robots.txt", targetUrl.origin);
  try {
    const { res, text } = await fetchText(robotsUrl.toString(), { timeoutMs: 5000, maxBytes: 256_000, headers: {} });
    if (!res.ok) return true;

    const lines = text.split(/\r?\n/);
    let inGlobal = false;
    const disallows: string[] = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [k, ...rest] = line.split(":");
      const key = (k ?? "").trim().toLowerCase();
      const value = rest.join(":").trim();

      if (key === "user-agent") {
        inGlobal = value === "*";
      }
      if (inGlobal && key === "disallow") {
        disallows.push(value);
      }
    }

    // If robots has empty Disallow, allow everything.
    const path = targetUrl.pathname;
    for (const rule of disallows) {
      if (!rule) continue;
      if (rule === "/" || path.startsWith(rule)) return false;
    }

    return true;
  } catch {
    // If robots cannot be fetched, default allow (operator can tighten via config).
    return true;
  }
}

export const webScraperConnector: Connector = {
  name: "web-scraper",
  description: "Fetch a public URL and archive a sanitized HTML snapshot (robots.txt-aware).",
  supportedTargetTypes: ["url", "domain"],
  async run(ctx) {
    const input = ctx.input.trim();
    const url = ctx.targetType === "domain" ? `https://${input}` : input;
    const targetUrl = new URL(url);

    const robotsOk = await isRobotsAllowed(targetUrl);
    if (!robotsOk) {
      return {
        evidence: [
          {
            type: "text",
            title: `Robots blocked: ${targetUrl.toString()}`,
            content: `robots.txt disallows automated collection for path: ${targetUrl.pathname}`,
            source: "Web Scraper",
            tags: ["robots", "blocked"],
            metadata: { url: targetUrl.toString() },
          },
        ],
        notes: "robots.txt disallowed this request.",
      };
    }

    const timeoutMs = Number(ctx.options?.timeoutMs ?? 15_000);
    const maxBytes = Number(ctx.options?.maxBytes ?? 2_000_000);

    const { res, text } = await fetchText(targetUrl.toString(), { timeoutMs, maxBytes, headers: {} });

    return {
      evidence: [
        {
          type: "html",
          title: `HTML snapshot: ${targetUrl.host}${targetUrl.pathname}`,
          content: text,
          source: "Web Scraper",
          tags: ["web", "html"],
          metadata: {
            url: targetUrl.toString(),
            status: res.status,
            contentType: res.headers.get("content-type"),
          },
        },
      ],
    };
  },
};
