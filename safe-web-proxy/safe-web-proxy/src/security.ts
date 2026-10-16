import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

/** Parse and constrain user supplied URLs to web protocols and public hosts. */
export function parseHttpUrl(raw: string): URL {
  if (raw.length > 4096) throw new Error("URL is too long.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid absolute URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
  if (!url.hostname || url.hostname.endsWith(".")) url.hostname = url.hostname.replace(/\.$/, "");
  return url;
}

/** Reject special-use IP ranges, including IPv4-mapped IPv6 addresses. */
export function isPublicAddress(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try { parsed = ipaddr.parse(address); } catch { return false; }
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    return isPublicAddress((parsed as ipaddr.IPv6).toIPv4Address().toString());
  }
  return parsed.range() === "unicast";
}

/** Resolve every address and reject the hostname if any answer is non-public. */
export async function validatePublicHost(url: URL): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Local hostnames are not allowed.");
  }
  if (ipaddr.isValid(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error("Private or reserved IP addresses are not allowed.");
    return;
  }
  let answers: Array<{ address: string }>;
  try { answers = await dns.lookup(hostname, { all: true, verbatim: true }); }
  catch { throw new Error("The target hostname could not be resolved."); }
  if (!answers.length || answers.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("The target resolves to a private or reserved IP address.");
  }
}
