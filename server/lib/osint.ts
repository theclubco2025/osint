import crypto from "crypto";
import dns from "dns/promises";
import { webSearch } from "./webSearch";

type TargetType = "domain" | "email" | "username" | "ip" | "phone" | "address" | "name" | "case";

type CollectionOptions = {
  depth?: "normal" | "thorough";
  timeBudgetMs?: number; // overall budget for this call tree
  onStep?: (step: string) => void | Promise<void>;
  skipWebSearch?: boolean; // internal/advanced: prevent recursive web-search amplification
  _startedAtMs?: number; // internal
};

export type OsintEvidenceDraft = {
  type: "json" | "text";
  title: string;
  source: string;
  content: string; // stored as string (JSON.stringify for json)
  tags?: string[];
  metadata?: Record<string, any>;
};

export type OsintEntityDraft = {
  entityType: string;
  value: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, any>;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (promise as any);
  if (typeof p?.then === "function" && typeof (globalThis as any).fetch === "function") {
    // noop; fetch will be passed signal separately
  }
  return promise.finally(() => clearTimeout(t));
}

async function fetchJson(url: string, opts?: { timeoutMs?: number; headers?: Record<string, string> }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "Dpt-of-Karma-OSINT/1.0 (+local)",
        ...(opts?.headers ?? {}),
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(t);
  }
}

function guessTargetType(target: string): TargetType {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) return "ip";
  if (target.includes("@")) return "email";
  if (target.includes(".") && !target.includes(" ")) return "domain";
  const digits = target.replace(/[^\d]/g, "");
  if (digits.length >= 10 && digits.length <= 15) return "phone";
  // crude address heuristic: has a number + a space + a word (street), or comma-separated
  if (/\d{1,6}\s+\S+/.test(target) || target.includes(",")) return "address";
  // if it has spaces and letters, treat as name by default
  if (/[a-z]/i.test(target) && target.trim().split(/\s+/).length >= 2) return "name";
  return "username";
}

function normalizeTarget(target: string) {
  return target.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  // Keep leading + if present, otherwise return digits
  if (digits.startsWith("+")) return "+" + digits.slice(1).replace(/[^\d]/g, "");
  return digits.replace(/[^\d]/g, "");
}

function tryParseUrl(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

function extractUsernameFromKnownProfileUrl(u: string): { platform: string; username: string } | null {
  const url = tryParseUrl(u);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;

  const first = parts[0];
  const second = parts[1];

  if (host === "instagram.com" && first && !["p", "reel", "tv", "stories", "explore", "accounts"].includes(first)) {
    return { platform: "instagram", username: first };
  }
  if ((host === "facebook.com" || host === "fb.com") && first && !["people", "profile.php", "pages", "watch", "groups", "marketplace"].includes(first)) {
    return { platform: "facebook", username: first };
  }
  if ((host === "twitter.com" || host === "x.com") && first && !["home", "i", "search", "intent"].includes(first)) {
    return { platform: "x", username: first.replace(/^@/, "") };
  }
  if (host === "tiktok.com" && first === "@"+first && first.startsWith("@")) {
    return { platform: "tiktok", username: first.slice(1) };
  }
  if (host === "tiktok.com" && first?.startsWith("@")) {
    return { platform: "tiktok", username: first.slice(1) };
  }
  if (host === "linkedin.com" && first === "in" && second) {
    return { platform: "linkedin", username: second };
  }
  if (host === "github.com" && first && !["features", "pricing", "about", "site", "orgs", "settings"].includes(first)) {
    return { platform: "github", username: first };
  }
  return null;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url: string, opts?: { timeoutMs?: number; headers?: Record<string, string> }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, {
      headers: {
        "accept": "text/plain,*/*",
        "user-agent": "Dpt-of-Karma-OSINT/1.0 (+local)",
        ...(opts?.headers ?? {}),
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

export async function runSafeOsintCollection(input: {
  target: string;
  targetType?: string;
}, options?: CollectionOptions): Promise<{ evidence: OsintEvidenceDraft[]; entities: OsintEntityDraft[]; riskDelta: number; confidence: number }> {
  const target = normalizeTarget(input.target);
  const ttype = (input.targetType as TargetType | undefined) ?? guessTargetType(target);
  const depth = options?.depth ?? "normal";
  const startedAt = options?._startedAtMs ?? Date.now();
  const budgetMs = options?.timeBudgetMs ?? (depth === "thorough" ? 300_000 : 90_000);
  const deadline = startedAt + budgetMs;

  const step = async (s: string) => {
    if (options?.onStep) await options.onStep(s);
  };

  const timeRemainingMs = () => Math.max(0, deadline - Date.now());
  const outOfTime = () => Date.now() >= deadline;

  const evidence: OsintEvidenceDraft[] = [];
  const entities: OsintEntityDraft[] = [];
  let riskDelta = 0;

  const addEntity = (entityType: string, value: string, metadata?: Record<string, any>) => {
    const v = String(value ?? "").trim();
    if (!v) return;
    entities.push({ entityType, value: v, metadata });
  };

  const maybeWebSearch = async (queries: string[], label: string) => {
    if (!queries.length) return;
    if (outOfTime()) return;
    if (options?.skipWebSearch) return;

    const provider = (process.env.OSINT_SEARCH_PROVIDER || "").trim();
    if (!provider) {
      evidence.push({
        type: "json",
        title: `Web search skipped (no provider configured): ${label}`,
        source: "Web Search",
        content: JSON.stringify({ configured: false, hint: "Set OSINT_SEARCH_PROVIDER and provider API key (see config/env.example)" }, null, 2),
        tags: ["web-search", "config"],
        metadata: { confidence: 0.05 },
      });
      return;
    }

    const maxQueries = depth === "thorough" ? 5 : 2;
    const toRun = queries.slice(0, maxQueries);
    for (const q of toRun) {
      if (outOfTime()) break;
      await step(`Web search (${label}): ${q}`);
      try {
        await sleep(250);
        const resp = await webSearch(q, { limit: depth === "thorough" ? 10 : 6, timeoutMs: Math.min(15000, Math.max(5000, timeRemainingMs())) });
        const results = resp.results ?? [];
        evidence.push({
          type: "json",
          title: `Web search results: ${q}`,
          source: resp.provider ? `Web Search (${resp.provider})` : "Web Search",
          content: JSON.stringify({ query: q, results }, null, 2),
          tags: ["web-search"],
          metadata: { confidence: results.length ? 0.45 : 0.15 },
        });

        // Extract simple entities from URLs/snippets (safe, public artifacts only)
        for (const r of results.slice(0, 10)) {
          if (r?.url) addEntity("url", r.url, { from: "web-search" });
          const parsed = r?.url ? tryParseUrl(r.url) : null;
          if (parsed?.hostname) addEntity("domain", parsed.hostname.replace(/^www\./i, ""), { from: "web-search-url" });
          const prof = r?.url ? extractUsernameFromKnownProfileUrl(r.url) : null;
          if (prof?.username) addEntity("username", prof.username, { from: "web-search-profile", platform: prof.platform, url: r.url });

          const snippet = `${r.title ?? ""}\n${r.snippet ?? ""}`;
          const foundEmails = snippet.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
          for (const e of Array.from(new Set(foundEmails)).slice(0, 3)) addEntity("email", e.toLowerCase(), { from: "web-search" });
          const foundPhones = snippet.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) ?? [];
          for (const p of Array.from(new Set(foundPhones)).slice(0, 2)) addEntity("phone", normalizePhone(p), { from: "web-search" });
        }
      } catch (e: any) {
        evidence.push({
          type: "text",
          title: `Web search failed: ${q}`,
          source: "Web Search",
          content: String(e?.message ?? e),
          tags: ["web-search", "error"],
          metadata: { confidence: 0.1 },
        });
      }
    }
  };

  // "case" mode: accept a freeform description and extract multiple indicators.
  if (ttype === "case") {
    const text = String(input.target || "").trim();
    const indicators = extractIndicators(text);

    await step(`Foundation parsing: extracting indicators (${indicators.length})`);

    evidence.push({
      type: "json",
      title: "Case description (input)",
      source: "Case Intake",
      content: JSON.stringify({ description: text }, null, 2),
      tags: ["case", "intake"],
      metadata: { confidence: 0.9 },
    });

    evidence.push({
      type: "json",
      title: "Extracted indicators",
      source: "Parser",
      content: JSON.stringify(indicators, null, 2),
      tags: ["case", "indicators"],
      metadata: { confidence: 0.7 },
    });

    // Run limited sub-collections to avoid hammering public sources.
    const maxTotal = depth === "thorough" ? 20 : 8;
    const toRun = indicators.slice(0, maxTotal);
    for (const ind of toRun) {
      if (outOfTime()) {
        await step(`Time budget reached; stopping early with ${evidence.length} evidence items.`);
        break;
      }
      await step(`Collecting (${ind.type}): ${ind.value}`);
      const r = await runSafeOsintCollection(
        { target: ind.value, targetType: ind.type },
        { ...options, depth, timeBudgetMs: budgetMs, _startedAtMs: startedAt },
      );
      evidence.push(...r.evidence);
      entities.push(...r.entities);
      riskDelta += r.riskDelta;
    }

    // Add a lightweight web-search pass using the highest-signal indicators (name/username/email/domain).
    const primary = indicators.filter((i) => ["name", "username", "email", "domain"].includes(i.type)).slice(0, depth === "thorough" ? 4 : 2);
    const q: string[] = [];
    for (const i of primary) {
      if (i.type === "name") q.push(`"${i.value}"`);
      else if (i.type === "email") q.push(`"${i.value}"`);
      else if (i.type === "username") q.push(`"${i.value}"`);
      else if (i.type === "domain") q.push(`site:${i.value}`);
    }
    await maybeWebSearch(q, "case primary leads");

    // De-dup entities at the end (reuse existing logic below)
    const seen = new Set<string>();
    const uniqueEntities = entities.filter((e) => {
      const k = `${e.entityType}:${e.value}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    return { evidence, entities: uniqueEntities, riskDelta, confidence: computeConfidence(evidence) };
  }

  // DNS collection (domain only)
  if (ttype === "domain") {
    if (outOfTime()) return { evidence, entities, riskDelta, confidence: computeConfidence(evidence) };
    await step(`DNS lookup: ${target}`);
    const dnsSummary: Record<string, any> = {};
    try {
      dnsSummary.A = await dns.resolve4(target);
      dnsSummary.A.forEach((ip: string) => addEntity("ip", ip));
    } catch {}
    try {
      dnsSummary.AAAA = await dns.resolve6(target);
      dnsSummary.AAAA.forEach((ip: string) => addEntity("ip", ip));
    } catch {}
    try {
      dnsSummary.NS = await dns.resolveNs(target);
      dnsSummary.NS.forEach((ns: string) => addEntity("domain", ns));
    } catch {}
    try {
      dnsSummary.MX = await dns.resolveMx(target);
    } catch {}

    evidence.push({
      type: "json",
      title: `DNS records for ${target}`,
      source: "DNS",
      content: JSON.stringify(dnsSummary, null, 2),
      tags: ["dns", "enrichment"],
      metadata: { confidence: 0.9 },
    });
  }

  // Address lookup (OpenStreetMap Nominatim) - public, rate-limited
  if (ttype === "address") {
    if (outOfTime()) return { evidence, entities, riskDelta, confidence: computeConfidence(evidence) };
    await step(`Geocode (Nominatim): ${target}`);
    // Nominatim usage: send a clear UA and be gentle (single query)
    const query = target;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
    try {
      await sleep(250); // small courtesy delay
      const results = await fetchJson(url, {
        timeoutMs: 15000,
        headers: { accept: "application/json" },
      });
      evidence.push({
        type: "json",
        title: `Address geocode (Nominatim): ${query}`,
        source: "OpenStreetMap Nominatim",
        content: JSON.stringify(results, null, 2),
        tags: ["address", "geocode"],
        metadata: { confidence: Array.isArray(results) && results.length > 0 ? 0.8 : 0.2 },
      });
      if (Array.isArray(results) && results[0]) {
        const top = results[0];
        if (top?.lat && top?.lon) {
          addEntity("location", `${top.lat},${top.lon}`);
        }
        if (top?.display_name) addEntity("address", String(top.display_name));
      }
    } catch (e: any) {
      evidence.push({
        type: "text",
        title: `Address geocode failed`,
        source: "OpenStreetMap Nominatim",
        content: String(e?.message ?? e),
        tags: ["address", "error"],
        metadata: { confidence: 0.1 },
      });
    }
  }

  // Name lookup (Wikidata) - public entity search
  if (ttype === "name") {
    if (outOfTime()) return { evidence, entities, riskDelta, confidence: computeConfidence(evidence) };
    await step(`Wikidata search: ${target}`);
    const q = target;
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&limit=5`;
    try {
      await sleep(250);
      const search = await fetchJson(searchUrl, { timeoutMs: 15000 });
      evidence.push({
        type: "json",
        title: `Wikidata search: ${q}`,
        source: "Wikidata",
        content: JSON.stringify(search, null, 2),
        tags: ["name", "wikidata"],
        metadata: { confidence: 0.5 },
      });
      const firstId = search?.search?.[0]?.id;
      if (firstId) {
        const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(firstId)}.json`;
        const entity = await fetchJson(entityUrl, { timeoutMs: 15000 });
        evidence.push({
          type: "json",
          title: `Wikidata entity: ${firstId}`,
          source: "Wikidata",
          content: JSON.stringify(entity, null, 2),
          tags: ["name", "wikidata", "entity"],
          metadata: { confidence: 0.6 },
        });
        addEntity("person", q, { wikidataId: firstId });
      } else {
        addEntity("person", q);
      }
    } catch (e: any) {
      evidence.push({
        type: "text",
        title: `Wikidata lookup failed`,
        source: "Wikidata",
        content: String(e?.message ?? e),
        tags: ["name", "error"],
        metadata: { confidence: 0.1 },
      });
      addEntity("person", q);
    }
  }

  // Public web search for name/username/email/phone/domain/ip (safe + verifiable, via API, no scraping)
  if (ttype === "name" || ttype === "username" || ttype === "email" || ttype === "phone" || ttype === "domain" || ttype === "ip") {
    const queries: string[] = [];
    if (ttype === "name") {
      queries.push(`"${target}"`);
      queries.push(`"${target}" profile`);
    } else if (ttype === "username") {
      queries.push(`"${target}"`);
      queries.push(`"${target}" instagram`);
      queries.push(`"${target}" facebook`);
    } else if (ttype === "email") {
      queries.push(`"${target}"`);
    } else if (ttype === "phone") {
      queries.push(`"${normalizePhone(target) || target}"`);
    } else if (ttype === "domain") {
      queries.push(`site:${target}`);
      queries.push(`"${target}" contact`);
    } else if (ttype === "ip") {
      queries.push(`"${target}"`);
    }
    await maybeWebSearch(queries, ttype);
  }

  // Follow leads: enrich a few discovered domains/usernames without triggering more web-search recursion.
  if (!outOfTime()) {
    const followMax = depth === "thorough" ? 4 : 1;
    const seenFollow = new Set<string>();

    const domainsToFollow = uniqueByValue(entities.filter((e) => e.entityType === "domain").map((e) => e.value))
      .filter((d) => d && d.toLowerCase() !== target.toLowerCase())
      .slice(0, followMax);

    for (const d of domainsToFollow) {
      if (outOfTime()) break;
      const key = `domain:${d}`.toLowerCase();
      if (seenFollow.has(key)) continue;
      seenFollow.add(key);
      await step(`Lead follow: domain enrichment for ${d}`);
      const r = await runSafeOsintCollection(
        { target: d, targetType: "domain" },
        { ...options, depth: "normal", skipWebSearch: true, timeBudgetMs: budgetMs, _startedAtMs: startedAt },
      );
      evidence.push(...r.evidence);
      entities.push(...r.entities);
      riskDelta += r.riskDelta;
    }

    const usernamesToFollow = uniqueByValue(entities.filter((e) => e.entityType === "username").map((e) => e.value))
      .filter((u) => u && u.toLowerCase() !== target.toLowerCase())
      .slice(0, followMax);

    for (const u of usernamesToFollow) {
      if (outOfTime()) break;
      const key = `username:${u}`.toLowerCase();
      if (seenFollow.has(key)) continue;
      seenFollow.add(key);
      await step(`Lead follow: username enrichment for ${u} (public APIs only)`);
      const r = await runSafeOsintCollection(
        { target: u, targetType: "username" },
        { ...options, depth: "normal", skipWebSearch: true, timeBudgetMs: budgetMs, _startedAtMs: startedAt },
      );
      evidence.push(...r.evidence);
      entities.push(...r.entities);
      riskDelta += r.riskDelta;
    }
  }

  // Phone normalization (no carrier/breach lookups without explicit API keys)
  if (ttype === "phone") {
    await step(`Normalize phone: ${target}`);
    const normalized = normalizePhone(target);
    evidence.push({
      type: "json",
      title: `Phone normalization`,
      source: "Parser",
      content: JSON.stringify({ input: target, normalized }, null, 2),
      tags: ["phone"],
      metadata: { confidence: normalized ? 0.7 : 0.3 },
    });
    addEntity("phone", normalized || target);
  }

  // RDAP (domain/ip)
  if (ttype === "domain" || ttype === "ip") {
    if (outOfTime()) return { evidence, entities, riskDelta, confidence: computeConfidence(evidence) };
    await step(`RDAP lookup: ${target}`);
    const rdapUrl = ttype === "domain" ? `https://rdap.org/domain/${encodeURIComponent(target)}` : `https://rdap.org/ip/${encodeURIComponent(target)}`;
    try {
      const rdap = await fetchJson(rdapUrl, { timeoutMs: 12000 });
      evidence.push({
        type: "json",
        title: `RDAP lookup for ${target}`,
        source: "RDAP",
        content: JSON.stringify(rdap, null, 2),
        tags: ["rdap", "registration"],
        metadata: { confidence: 0.9 },
      });

      const org = rdap?.name || rdap?.remarks?.[0]?.description?.[0];
      if (typeof org === "string" && org.trim()) addEntity("org", org.trim());
    } catch (e: any) {
      evidence.push({
        type: "text",
        title: `RDAP lookup failed for ${target}`,
        source: "RDAP",
        content: String(e?.message ?? e),
        tags: ["rdap", "error"],
        metadata: { confidence: 0.1 },
      });
    }
  }

  // Certificate Transparency (crt.sh) for domain
  if (ttype === "domain") {
    if (outOfTime()) return { evidence, entities, riskDelta, confidence: computeConfidence(evidence) };
    await step(`Certificate Transparency (crt.sh): *.${target}`);
    const url = `https://crt.sh/?q=%25.${encodeURIComponent(target)}&output=json`;
    try {
      const raw = await fetchJson(url, { timeoutMs: 15000, headers: { accept: "application/json" } });
      // crt.sh can return duplicates; extract unique name_value entries
      const names = new Set<string>();
      if (Array.isArray(raw)) {
        for (const row of raw) {
          const nv = String(row?.name_value ?? "");
          nv.split("\n").forEach((n) => {
            const clean = n.trim().toLowerCase();
            if (clean && clean.includes(".")) names.add(clean);
          });
        }
      }
      const subdomains = Array.from(names).slice(0, 500);
      subdomains.forEach((d) => addEntity("domain", d));
      if (subdomains.length > 50) riskDelta += 5;

      evidence.push({
        type: "json",
        title: `Certificate Transparency (crt.sh) for *.${target}`,
        source: "crt.sh",
        content: JSON.stringify({ count: subdomains.length, subdomains }, null, 2),
        tags: ["ct", "subdomains"],
        metadata: { confidence: 0.7 },
      });
    } catch (e: any) {
      evidence.push({
        type: "text",
        title: `crt.sh query failed for ${target}`,
        source: "crt.sh",
        content: String(e?.message ?? e),
        tags: ["ct", "error"],
        metadata: { confidence: 0.2 },
      });
    }
  }

  // GitHub public profile (username)
  if (ttype === "username") {
    if (outOfTime()) return { evidence, entities, riskDelta, confidence: computeConfidence(evidence) };
    await step(`GitHub user lookup: ${target}`);
    const url = `https://api.github.com/users/${encodeURIComponent(target)}`;
    try {
      const user = await fetchJson(url, { timeoutMs: 12000 });
      evidence.push({
        type: "json",
        title: `GitHub user profile: ${target}`,
        source: "GitHub",
        content: JSON.stringify(user, null, 2),
        tags: ["github", "profile"],
        metadata: { confidence: 0.8 },
      });
      if (user?.company) addEntity("org", String(user.company));
      if (user?.blog) addEntity("url", String(user.blog));
    } catch (e: any) {
      evidence.push({
        type: "text",
        title: `GitHub user lookup failed: ${target}`,
        source: "GitHub",
        content: String(e?.message ?? e),
        tags: ["github", "error"],
        metadata: { confidence: 0.2 },
      });
    }
  }

  // Basic email normalization (no breach checks without explicit API keys)
  if (ttype === "email") {
    await step(`Normalize email: ${target}`);
    const email = target.toLowerCase();
    const domain = email.split("@")[1] || "";
    evidence.push({
      type: "json",
      title: `Email normalization`,
      source: "Parser",
      content: JSON.stringify({ email, domain }, null, 2),
      tags: ["email"],
      metadata: { confidence: 0.7 },
    });
    if (domain) addEntity("domain", domain);
  }

  // De-dup entities
  const seen = new Set<string>();
  const uniqueEntities = entities.filter((e) => {
    const k = `${e.entityType}:${e.value}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { evidence, entities: uniqueEntities, riskDelta, confidence: computeConfidence(evidence) };
}

function uniqueByValue(vals: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of vals) {
    const k = String(v ?? "").trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(String(v).trim());
  }
  return out;
}

function computeConfidence(evidence: OsintEvidenceDraft[]): number {
  const vals = evidence
    .map((e) => Number((e.metadata as any)?.confidence))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 1);
  if (vals.length === 0) return 0.0;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(0, Math.min(1, Number(avg.toFixed(3))));
}

function extractIndicators(text: string): { type: Exclude<TargetType, "case">; value: string }[] {
  const out: { type: Exclude<TargetType, "case">; value: string }[] = [];

  const add = (type: any, value: string) => {
    const v = value.trim();
    if (!v) return;
    out.push({ type, value: v });
  };

  // Emails
  const emails = new Set<string>((text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((s) => s.toLowerCase()));
  for (const e of Array.from(emails).slice(0, 3)) add("email", e);

  // IPv4
  const ips = new Set<string>(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []);
  for (const ip of Array.from(ips).slice(0, 3)) add("ip", ip);

  // Domains (exclude email domains we already captured)
  const domainMatches = text.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi) ?? [];
  const domains = new Set<string>(domainMatches.map((s) => s.toLowerCase()));
  for (const e of Array.from(emails)) {
    const d = e.split("@")[1];
    if (d) domains.add(d.toLowerCase());
  }
  for (const d of Array.from(domains).slice(0, 3)) add("domain", d);

  // Phone (very lightweight)
  const phoneCandidates = text.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) ?? [];
  const phones = new Set<string>(phoneCandidates.map((p) => normalizePhone(p)));
  for (const p of Array.from(phones).filter(Boolean).slice(0, 2)) add("phone", p);

  // Address (heuristic: lines with digits + comma OR a leading street number)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const streetHint = /\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court|way|hwy|highway|pkwy|parkway)\b/i;
  const badPrefix = /^(phone|email|domain|username|user|name)\s*:/i;

  // Prefer explicit "Address:" lines
  const explicitAddress = lines.find((l) => /^address\s*:/i.test(l));
  if (explicitAddress) {
    const v = explicitAddress.replace(/^address\s*:/i, "").trim();
    if (v) add("address", v);
  } else {
    for (const line of lines) {
      if (badPrefix.test(line)) continue;
      const hasStreetNumber = /\d{1,6}\s+\S+/.test(line);
      const hasComma = line.includes(",") && /\d/.test(line);
      const hasStreetWord = streetHint.test(line);
      if ((hasStreetNumber && (hasComma || hasStreetWord)) || (hasComma && line.length > 12)) {
        add("address", line);
        break;
      }
    }
  }

  // Name (heuristic: "name:" or two+ word line)
  const nameLine = lines.find((l) => /^name\s*:/i.test(l))?.replace(/^name\s*:/i, "").trim()
    ?? lines.find((l) => /[a-z]/i.test(l) && l.split(/\s+/).length >= 2 && l.length <= 80);
  if (nameLine) add("name", nameLine);

  // De-dup indicators
  const seen = new Set<string>();
  return out.filter((i) => {
    const k = `${i.type}:${i.value}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}


