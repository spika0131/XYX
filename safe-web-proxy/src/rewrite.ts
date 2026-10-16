import * as cheerio from "cheerio";
import iconv from "iconv-lite";

const proxyPath = (url: URL): string => `/proxy?url=${encodeURIComponent(url.href)}`;

/** Resolve relative, absolute, and protocol-relative references against the page. */
export function rewriteUrl(value: string, base: URL): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || /^(?:data|blob|javascript|mailto|tel):/i.test(trimmed)) return value;
  try {
    const resolved = new URL(trimmed, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return value;
    return proxyPath(resolved);
  } catch { return value; }
}

/** Rewrite CSS url() and @import targets while leaving data URLs intact. */
export function rewriteCss(css: string, base: URL): string {
  let output = css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_all, _quote: string, value: string) =>
    `url("${rewriteUrl(value, base).replace(/["\\]/g, "\\$&")}")`);
  output = output.replace(/(@import\s+)(['"])(.*?)\2/gi, (_all, lead: string, quote: string, value: string) =>
    `${lead}${quote}${rewriteUrl(value, base)}${quote}`);
  return output;
}

/** Decode a bounded response body using its declared charset, with safe fallback. */
export function decodeBody(body: Buffer, contentType: string): string {
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType)?.[1] ?? "utf-8";
  try { return iconv.decode(body, charset); } catch { return body.toString("utf8"); }
}

/** Rewrite navigation, resource, and form destinations in an HTML document. */
export function rewriteHtml(html: string, base: URL): string {
  const $ = cheerio.load(html);
  $("base").remove();
  const attrs = ["href", "src", "action", "poster", "data", "formaction", "xlink:href"];
  $("*").each((_index, element) => {
    for (const attr of attrs) {
      const value = $(element).attr(attr);
      if (value !== undefined) $(element).attr(attr, rewriteUrl(value, base));
    }
    const srcset = $(element).attr("srcset");
    if (srcset) $(element).attr("srcset", srcset.split(",").map((entry) => {
      const [url, ...descriptor] = entry.trim().split(/\s+/);
      return [rewriteUrl(url, base), ...descriptor].join(" ");
    }).join(", "));
    const style = $(element).attr("style");
    if (style) $(element).attr("style", rewriteCss(style, base));
  });
  $("style").each((_index, element) => $(element).text(rewriteCss($(element).text(), base)));
  return $.html();
}
