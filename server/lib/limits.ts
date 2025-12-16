import type { Request, Response, NextFunction } from "express";

// Lightweight, in-memory rate limit (portable, no Redis required).
// This is NOT bulletproof, but it prevents accidental hammering of public sources.
export function simpleRateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = req.ip || "unknown";
    const now = Date.now();
    const cur = hits.get(key);

    if (!cur || cur.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    cur.count += 1;
    if (cur.count > opts.max) {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: "Too many requests. Slow down to avoid hammering public OSINT sources.",
      });
      return;
    }

    next();
  };
}




