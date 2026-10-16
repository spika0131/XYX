import http from "node:http";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { config } from "./config";
import { parseHttpUrl, validatePublicHost } from "./security";

export interface ProxyResponse { status: number; headers: IncomingHttpHeaders; body: Buffer; finalUrl: URL; }

/** Make one request using an already checked address, preventing DNS rebinding. */
function requestOnce(url: URL, address: string, family: number): Promise<ProxyResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const timer = setTimeout(() => req.destroy(new Error("Target request timed out.")), config.timeoutMs);
    const req = transport.request(url, {
      method: "GET", headers: { "user-agent": "SafeWebProxy/1.0", accept: "*/*" },
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, (res) => {
      const chunks: Buffer[] = [];
      let total = 0;
      res.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > config.maxResponseBytes) req.destroy(new Error("The target response exceeds the configured size limit."));
        else chunks.push(chunk);
      });
      res.on("end", () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 502, headers: res.headers, body: Buffer.concat(chunks), finalUrl: url });
      });
      res.on("error", (error) => { clearTimeout(timer); reject(error); });
    });
    req.on("error", (error) => { clearTimeout(timer); reject(error); });
    req.end();
  });
}

/** Follow redirects manually, validating and pinning every destination. */
export async function fetchTarget(rawUrl: string): Promise<ProxyResponse> {
  let target = parseHttpUrl(rawUrl);
  for (let redirects = 0; ; redirects++) {
    await validatePublicHost(target);
    const { address, family } = await import("node:dns/promises").then(({ lookup }) => lookup(target.hostname.replace(/^\[|\]$/g, "")));
    const response = await requestOnce(target, address, family);
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      if (redirects >= config.maxRedirects) throw new Error("The target exceeded the redirect limit.");
      target = parseHttpUrl(new URL(response.headers.location, target).href);
      continue;
    }
    response.finalUrl = target;
    return response;
  }
}
