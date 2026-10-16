import express from "express";
import path from "node:path";
import { config } from "./config";
import { fetchTarget } from "./proxy";
import { decodeBody, rewriteCss, rewriteHtml } from "./rewrite";

const app = express();
app.disable("x-powered-by");

// Simple per-IP fixed-window limiter. Deploy behind a trusted proxy only with
// Express trust proxy configured explicitly for that environment.
const buckets = new Map<string, { count: number; resetAt: number }>();
app.use((req, res, next) => {
  const now = Date.now();
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) { bucket = { count: 0, resetAt: now + config.rateWindowMs }; buckets.set(key, bucket); }
  bucket.count++;
  if (bucket.count > config.rateLimitMax) { res.status(429).type("text").send("Rate limit exceeded. Try again later."); return; }
  next();
});
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, Math.max(config.rateWindowMs, 30_000)).unref();

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));
app.get("/proxy", async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
  if (!rawUrl) { res.status(400).type("html").send(errorPage("URLを入力してください。")); return; }
  try {
    const result = await fetchTarget(rawUrl);
    const contentType = String(result.headers["content-type"] ?? "application/octet-stream");
    if (result.status >= 400) {
      res.status(result.status).type("html").send(errorPage(`対象サイトが HTTP ${result.status} を返しました。`));
      console.log(`${req.path} ${result.status}`);
      return;
    }
    res.status(result.status);
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    // Opaque-origin sandbox limits script access to this proxy's origin.
    res.set("Content-Security-Policy", "sandbox allow-scripts allow-forms; default-src * data: blob:; connect-src *; form-action *; base-uri 'none'; frame-ancestors 'none'");
    for (const name of ["content-language", "last-modified", "etag"]) {
      const value = result.headers[name]; if (value) res.set(name, value);
    }
    if (/^text\/html\b/i.test(contentType)) {
      res.type("html").send(rewriteHtml(decodeBody(result.body, contentType), result.finalUrl));
    } else if (/^text\/css\b/i.test(contentType)) {
      res.type("text/css").send(rewriteCss(decodeBody(result.body, contentType), result.finalUrl));
    } else {
      res.set("Content-Type", contentType);
      res.set("Content-Length", String(result.body.length));
      res.send(result.body);
    }
    console.log(`${req.path} ${result.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retrieve the target page.";
    const status = /URL|allowed|private|reserved|resolve|scheme|protocol/i.test(message) ? 400 : 502;
    res.status(status).type("html").send(errorPage(message));
    console.log(`${req.path} ${status}`);
  }
});

function errorPage(message: string): string {
  const escaped = message.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Proxy error</title><body><main><h1>ページを取得できません</h1><p>${escaped}</p><p><a href="/">トップへ戻る</a></p></main></body></html>`;
}

app.listen(config.port, config.host, () => console.log(`Safe Web Proxy listening on http://${config.host}:${config.port}`));
