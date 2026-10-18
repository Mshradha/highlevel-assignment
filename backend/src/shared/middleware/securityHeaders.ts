import type { RequestHandler } from "express";

/**
 * A few headers that matter for a JSON API holding personal data (no helmet
 * dependency needed for this short list):
 *   - nosniff: browsers must not guess a different content type;
 *   - no-store: contact data must not be kept by shared caches or proxies;
 *   - no-referrer: don't leak URLs (which may contain search terms) to other sites.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
};
