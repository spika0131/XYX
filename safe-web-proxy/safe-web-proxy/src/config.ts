/** Centralized environment configuration with conservative defaults. */
function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export const config = {
  port: positiveInt("PORT", 3000),
  host: process.env.HOST || "0.0.0.0",
  timeoutMs: positiveInt("REQUEST_TIMEOUT_MS", 10_000),
  maxResponseBytes: positiveInt("MAX_RESPONSE_BYTES", 10 * 1024 * 1024),
  maxRedirects: positiveInt("MAX_REDIRECTS", 5),
  rateWindowMs: positiveInt("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMax: positiveInt("RATE_LIMIT_MAX", 30),
};
