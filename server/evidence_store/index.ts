import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import sanitizeHtml from "sanitize-html";

export type EvidenceBlobType = "text" | "html" | "json" | "network" | "image";

const DEFAULT_EVIDENCE_DIR = path.resolve(process.cwd(), "server", "evidence_store", "data");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export function sha256Hex(input: string | Buffer) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sanitizeHtmlSnapshot(unsafeHtml: string) {
  // Keep a conservative subset for safe viewing.
  return sanitizeHtml(unsafeHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.filter((t) => t !== "img"),
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
  });
}

export async function storeEvidenceText(opts: {
  investigationId: string;
  type: EvidenceBlobType;
  content: string;
  filenameHint?: string;
}) {
  const evidenceDir = process.env.EVIDENCE_STORE_DIR
    ? path.resolve(process.env.EVIDENCE_STORE_DIR)
    : DEFAULT_EVIDENCE_DIR;

  await ensureDir(evidenceDir);

  let normalized = opts.content;
  if (opts.type === "html") normalized = sanitizeHtmlSnapshot(normalized);

  const hash = sha256Hex(normalized);
  const safeName = (opts.filenameHint ?? opts.type).replace(/[^a-zA-Z0-9._-]+/g, "_");

  // Partition by investigation for privacy and management.
  const invDir = path.join(evidenceDir, opts.investigationId);
  await ensureDir(invDir);

  const ext = opts.type === "json" ? "json" : opts.type === "html" ? "html" : "txt";
  const filename = `${safeName}.${hash.slice(0, 12)}.${ext}`;
  const fullPath = path.join(invDir, filename);

  // Write once; if already exists, that's fine.
  try {
    await fs.writeFile(fullPath, normalized, { encoding: "utf-8", flag: "wx" });
  } catch (err: any) {
    if (err?.code !== "EEXIST") throw err;
  }

  return {
    storedPath: fullPath,
    hash,
    sizeBytes: Buffer.byteLength(normalized, "utf-8"),
    sanitized: opts.type === "html",
  };
}
