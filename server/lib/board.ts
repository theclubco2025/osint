import type { Evidence, Entity, Investigation } from "@shared/schema";

function safeParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function topN<T>(arr: T[], n: number) {
  return arr.slice(0, n);
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "Dpt-of-Karma-OSINT/1.0 (+local)",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(t);
  }
}

function extractRelationshipQuery(q: string): "mother" | "father" | null {
  if (/\b(mom|mother)\b/i.test(q)) return "mother";
  if (/\b(dad|father)\b/i.test(q)) return "father";
  return null;
}

function parseProvidedFact(e: Evidence): { relation?: string; name?: string; authorized?: boolean } | null {
  if (e.source !== "User Provided") return null;
  const json = safeParseJson<any>(e.content);
  if (json && typeof json === "object") return json;
  return null;
}

async function wikidataResolveLabels(qids: string[]): Promise<Record<string, string>> {
  if (!qids.length) return {};
  const ids = qids.join("|");
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(ids)}&props=labels&languages=en&format=json`;
  const data = await fetchJson(url, 15000);
  const out: Record<string, string> = {};
  const entities = data?.entities ?? {};
  for (const [id, ent] of Object.entries<any>(entities)) {
    out[id] = ent?.labels?.en?.value ?? id;
  }
  return out;
}

function extractWikidataRelationQids(entityJson: any, relation: "mother" | "father"): string[] {
  const prop = relation === "mother" ? "P25" : "P22";
  const claims = entityJson?.entities ? Object.values<any>(entityJson.entities)[0]?.claims : entityJson?.claims;
  const arr = claims?.[prop];
  if (!Array.isArray(arr)) return [];
  const ids: string[] = [];
  for (const st of arr) {
    const id = st?.mainsnak?.datavalue?.value?.id;
    if (typeof id === "string" && id.startsWith("Q")) ids.push(id);
  }
  return Array.from(new Set(ids)).slice(0, 5);
}

export function buildIntelligenceBoardMarkdown(args: {
  investigation: Investigation;
  evidence: Evidence[];
  entities: Entity[];
}): string {
  const { investigation, evidence, entities } = args;
  const confidence = investigation.confidence ?? 0;

  const bySource = new Map<string, Evidence[]>();
  for (const e of evidence) {
    const key = e.source || "Unknown";
    const list = bySource.get(key) ?? [];
    list.push(e);
    bySource.set(key, list);
  }

  const indicatorsEv = evidence.find((e) => e.title === "Extracted indicators" && e.source === "Parser");
  const indicators = indicatorsEv ? safeParseJson<Array<{ type: string; value: string }>>(indicatorsEv.content) : null;

  const dnsEv = evidence.find((e) => e.source === "DNS" && e.title.startsWith("DNS records for"));
  const dns = dnsEv ? safeParseJson<any>(dnsEv.content) : null;

  const rdapEv = evidence.find((e) => e.source === "RDAP" && e.title.startsWith("RDAP lookup for"));
  const rdap = rdapEv ? safeParseJson<any>(rdapEv.content) : null;

  const ctEv = evidence.find((e) => e.source === "crt.sh" && e.title.startsWith("Certificate Transparency"));
  const ct = ctEv ? safeParseJson<any>(ctEv.content) : null;

  const nominatimEv = evidence.find((e) => e.source === "OpenStreetMap Nominatim" && e.title.startsWith("Address geocode"));
  const nominatim = nominatimEv ? safeParseJson<any[]>(nominatimEv.content) : null;

  const wikidataSearchEv = evidence.find((e) => e.source === "Wikidata" && e.title.startsWith("Wikidata search:"));
  const wikidataSearch = wikidataSearchEv ? safeParseJson<any>(wikidataSearchEv.content) : null;

  const webSearchEvidence = evidence
    .filter((e) => (e.source || "").startsWith("Web Search") && e.title.startsWith("Web search results:"))
    .slice(0, 6);

  const webSearchSkipped = evidence.find((e) => e.source === "Web Search" && e.title.startsWith("Web search skipped (no provider configured):"));

  // Lightweight “security analyst” pivots from indicators/entities
  const pivots: string[] = [];
  const addPivot = (s: string) => {
    const v = s.trim();
    if (!v) return;
    if (!pivots.includes(v)) pivots.push(v);
  };
  const entityVals = (type: string) => entities.filter((e) => (e as any).entityType === type).map((e) => String((e as any).value ?? "").trim()).filter(Boolean);
  const usernames = Array.from(new Set(entityVals("username"))).slice(0, 8);
  const domains = Array.from(new Set(entityVals("domain"))).slice(0, 8);
  const emails = Array.from(new Set(entityVals("email"))).slice(0, 5);
  const phones = Array.from(new Set(entityVals("phone"))).slice(0, 5);
  const names = Array.from(new Set(entityVals("name").concat(entityVals("person")))).slice(0, 5);

  for (const u of usernames) {
    addPivot(`Search: site:instagram.com "${u}"`);
    addPivot(`Search: site:facebook.com "${u}"`);
    addPivot(`Search: site:github.com "${u}" OR site:gitlab.com "${u}"`);
  }
  for (const d of domains) {
    addPivot(`Search: site:${d} contact OR privacy OR terms`);
    addPivot(`Check: https://${d}/.well-known/security.txt`);
  }
  for (const e of emails) addPivot(`Search: "${e}"`);
  for (const p of phones) addPivot(`Search: "${p}"`);
  for (const n of names) addPivot(`Search: "${n}" profile OR linkedin`);

  const lines: string[] = [];
  lines.push(`**Intelligence Board**`);
  lines.push(`- **Case**: ${investigation.title}`);
  lines.push(`- **Status**: ${investigation.status}`);
  lines.push(`- **Phase**: ${investigation.phase}`);
  lines.push(`- **Confidence**: **${confidence}%**`);

  lines.push(`\n**Indicators (extracted from intake)**`);
  if (indicators && indicators.length) {
    for (const it of indicators) {
      lines.push(`- **${it.type}**: ${it.value}`);
    }
  } else {
    lines.push(`- **none detected**`);
  }

  lines.push(`\n**Evidence sources collected**`);
  const sources = Array.from(bySource.entries()).sort((a, b) => b[1].length - a[1].length);
  for (const [src, list] of sources) {
    lines.push(`- **${src}**: ${list.length} item(s)`);
  }

  if (webSearchEvidence.length) {
    lines.push(`\n**Top public web leads (search results)**`);
    for (const ev of webSearchEvidence) {
      const json = safeParseJson<any>(ev.content);
      const results = Array.isArray(json?.results) ? json.results : [];
      for (const r of results.slice(0, 5)) {
        const title = String(r?.title ?? "").trim() || "(untitled)";
        const url = String(r?.url ?? "").trim();
        const snip = String(r?.snippet ?? r?.description ?? "").trim();
        if (!url) continue;
        lines.push(`- **${title}** — ${url}${snip ? `\n  - ${snip}` : ""}`);
      }
      break; // show only the first batch (avoid spamming)
    }
  }

  if (entities?.length) {
    lines.push(`\n**Entities / indicators (collected + extracted)**`);
    const byType = new Map<string, string[]>();
    for (const e of entities) {
      const t = String((e as any).entityType ?? "unknown");
      const v = String((e as any).value ?? "").trim();
      if (!v) continue;
      byType.set(t, [...(byType.get(t) ?? []), v]);
    }
    for (const [t, vals] of Array.from(byType.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`- **${t}**: ${topN(Array.from(new Set(vals)), 8).join(", ")}`);
    }
  }

  if (pivots.length) {
    lines.push(`\n**Actionable pivots (next best moves)**`);
    for (const p of pivots.slice(0, 10)) {
      lines.push(`- ${p}`);
    }
  }

  // DNS summary
  if (dns) {
    lines.push(`\n**DNS summary**`);
    const A = Array.isArray(dns.A) ? dns.A : [];
    const AAAA = Array.isArray(dns.AAAA) ? dns.AAAA : [];
    const NS = Array.isArray(dns.NS) ? dns.NS : [];
    lines.push(`- **A**: ${A.length}${A.length ? ` (e.g., ${topN(A, 3).join(", ")})` : ""}`);
    lines.push(`- **AAAA**: ${AAAA.length}${AAAA.length ? ` (e.g., ${topN(AAAA, 2).join(", ")})` : ""}`);
    lines.push(`- **NS**: ${NS.length}${NS.length ? ` (${topN(NS, 3).join(", ")})` : ""}`);
  }

  // RDAP summary
  if (rdap) {
    lines.push(`\n**RDAP / registration summary**`);
    const statuses = Array.isArray(rdap.status) ? rdap.status : [];
    if (statuses.length) lines.push(`- **Status**: ${topN(statuses, 5).join(", ")}`);
    const events = Array.isArray(rdap.events) ? rdap.events : [];
    const reg = events.find((e: any) => e.eventAction === "registration")?.eventDate;
    const exp = events.find((e: any) => e.eventAction === "expiration")?.eventDate;
    if (reg) lines.push(`- **Registered**: ${reg}`);
    if (exp) lines.push(`- **Expires**: ${exp}`);
  }

  // CT summary
  if (ct) {
    lines.push(`\n**Certificate Transparency (crt.sh)**`);
    const count = Number(ct.count ?? 0);
    const subs = Array.isArray(ct.subdomains) ? ct.subdomains : [];
    lines.push(`- **Subdomains observed**: ${count || subs.length}`);
    if (subs.length) lines.push(`- **Sample**: ${topN(subs, 10).join(", ")}`);
  }

  // Geocode summary
  if (Array.isArray(nominatim)) {
    lines.push(`\n**Location (Nominatim)**`);
    if (nominatim[0]) {
      lines.push(`- **Top match**: ${nominatim[0].display_name ?? "(unknown)"}`);
      if (nominatim[0].lat && nominatim[0].lon) lines.push(`- **Coordinates**: ${nominatim[0].lat}, ${nominatim[0].lon}`);
    } else {
      lines.push(`- **No matches returned**`);
    }
  }

  // Wikidata summary
  if (wikidataSearch?.search) {
    lines.push(`\n**Wikidata candidates**`);
    for (const item of topN(wikidataSearch.search, 5)) {
      const label = item.label || item.title;
      const desc = item.description ? ` — ${item.description}` : "";
      lines.push(`- **${label}**${desc}`);
    }
  }

  lines.push(`\n**What is NOT verified**`);
  lines.push(`- **Relationships (e.g., family members)** are not present in collected evidence unless the subject is a public figure in a reliable public dataset.`);

  lines.push(`\n**Next steps (safe + verifiable)**`);
  lines.push(`- **Add more identifiers** (usernames, exact address, known orgs, known domains) to improve matching confidence.`);
  lines.push(`- **Run Investigation (thorough)** if you want a longer cross-check pass (up to 5 minutes).`);
  if (webSearchSkipped) {
    lines.push(`- **Enable public web search** to get real-world leads: set \`OSINT_SEARCH_PROVIDER=brave\` and \`BRAVE_SEARCH_API_KEY\` (see \`config/env.example\`).`);
  }

  return lines.join("\n");
}

export async function localAnswerFromEvidence(args: {
  question: string;
  investigation: Investigation;
  evidence: Evidence[];
  entities?: Entity[];
}): Promise<{ answerMarkdown: string; confidence: number; citations: string[] }> {
  const q = args.question.trim().toLowerCase();

  // Evidence-gated relationship answers:
  // - If asked for mother/father, we answer ONLY if present in evidence (User Provided or Wikidata).
  const rel = extractRelationshipQuery(q);
  if (rel) {
    const citations: string[] = [];

    // 1) Investigator-provided facts (must be marked authorized in metadata/content)
    const provided = args.evidence
      .filter((e) => e.source === "User Provided")
      .map((e) => ({ e, fact: parseProvidedFact(e) }))
      .filter((x) => x.fact && (x.fact.authorized === true))
      .filter((x) => String(x.fact?.relation || "").toLowerCase() === rel);

    if (provided.length) {
      const fact = provided[0].fact!;
      citations.push(provided[0].e.id);
      const name = fact.name || "(unknown)";
      const confidence = 85;
      return {
        answerMarkdown: `**${rel === "mother" ? "Mother" : "Father"}**: ${name}\n\n**Confidence**: ${confidence}%\n\n*Cited evidence:* ${citations.join(", ")}`,
        confidence,
        citations,
      };
    }

    // 2) Wikidata entity evidence (public figure / public dataset)
    const wikidataEntities = args.evidence.filter((e) => e.source === "Wikidata" && e.title.startsWith("Wikidata entity:"));
    for (const ev of wikidataEntities) {
      const json = safeParseJson<any>(ev.content);
      if (!json) continue;
      const qids = extractWikidataRelationQids(json, rel);
      if (!qids.length) continue;
      const labels = await wikidataResolveLabels(qids);
      citations.push(ev.id);
      const names = qids.map((id) => labels[id] ?? id);
      const confidence = 70;
      return {
        answerMarkdown: `**${rel === "mother" ? "Mother" : "Father"} (Wikidata)**: ${names.join(", ")}\n\n**Confidence**: ${confidence}%\n\n*Cited evidence:* ${citations.join(", ")}`,
        confidence,
        citations,
      };
    }

    return {
      answerMarkdown:
        `I don’t have evidence in this case that supports a ${rel} identity yet.\n\n` +
        `To proceed, add an **investigator-provided fact** (authorized) or collect a reliable public dataset entry that includes this relationship.\n\n` +
        `**Confidence**: 0%`,
      confidence: 0,
      citations: [],
    };
  }

  // Otherwise: default to board summary as best-effort local output.
  return {
    answerMarkdown: buildIntelligenceBoardMarkdown({
      investigation: args.investigation,
      evidence: args.evidence,
      entities: args.entities ?? [],
    }),
    confidence: args.investigation.confidence ?? 0,
    citations: [],
  };
}


