import { lookup } from "dns/promises";
import net from "net";

const MAX_HTML_BYTES = 1024 * 1024;
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 6000;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface IconCandidate {
  href: string;
  size: number;
}

/** Normalise user input ("github.com", "https://x.y/z") into an absolute http(s) URL. */
export function normalizeSiteUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const attr = (tag: string, name: string) => {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? "") : null;
};

/**
 * Pull icon links out of a page's HTML, best first: SVG, then the largest declared size.
 * apple-touch-icons without a size are assumed 180px (the iOS default).
 */
export function extractIconCandidates(html: string, pageUrl: string): IconCandidate[] {
  const candidates: IconCandidate[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    const relTokens = rel.split(/\s+/);
    const isTouch = relTokens.some((t) => t.startsWith("apple-touch-icon"));
    if (!isTouch && !relTokens.includes("icon")) continue;

    const href = attr(tag, "href");
    if (!href) continue;
    let resolved: string;
    try {
      resolved = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/.test(resolved)) continue;

    const sizes = attr(tag, "sizes")?.toLowerCase() ?? "";
    const type = attr(tag, "type")?.toLowerCase() ?? "";
    let size = 0;
    if (sizes === "any" || type === "image/svg+xml" || /\.svg(\?|$)/i.test(resolved)) {
      size = 10000;
    } else {
      for (const s of sizes.split(/\s+/)) {
        const n = parseInt(s.split("x")[0], 10);
        if (n > size) size = n;
      }
      if (!size) size = isTouch ? 180 : 16;
    }
    candidates.push({ href: resolved, size });
  }
  return candidates.sort((a, b) => b.size - a.size);
}

const isPrivateAddress = (address: string) => {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return (
    lower === "::1" ||
    lower === "::" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80")
  );
};

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("Refusing to fetch a private address");
  }
}

async function fetchLimited(url: string, maxBytes: number) {
  // Follow redirects by hand so every hop gets the private-address check.
  let current = new URL(url);
  let response: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicHost(current);
    response = await fetch(current, {
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) break;
    current = new URL(location, current);
    if (current.protocol !== "http:" && current.protocol !== "https:") return null;
    response = null;
  }
  if (!response || !response.ok || !response.body) return null;
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return {
    buffer: Buffer.concat(chunks),
    contentType: (response.headers.get("content-type") || "").toLowerCase(),
    finalUrl: current.toString(),
  };
}

const looksLikeImage = (buffer: Buffer, contentType: string) => {
  if (buffer.length < 4) return false;
  if (contentType.startsWith("image/")) return true;
  const head = buffer.subarray(0, 256).toString("latin1").trimStart();
  return (
    buffer.readUInt32BE(0) === 0x00000100 || // ICO
    buffer.readUInt32BE(0) === 0x89504e47 || // PNG
    head.startsWith("<svg") ||
    (head.startsWith("<?xml") && head.includes("<svg"))
  );
};

const sniffType = (buffer: Buffer, contentType: string) => {
  if (contentType.startsWith("image/")) return contentType.split(";")[0];
  if (buffer.readUInt32BE(0) === 0x00000100) return "image/x-icon";
  if (buffer.readUInt32BE(0) === 0x89504e47) return "image/png";
  return "image/svg+xml";
};

/** Find and download the best icon for a site. Returns null if nothing usable was found. */
export async function fetchFavicon(siteUrl: URL) {
  const tried = new Set<string>();
  const tryIcon = async (href: string) => {
    if (tried.has(href)) return null;
    tried.add(href);
    try {
      const result = await fetchLimited(href, MAX_ICON_BYTES);
      if (!result || !looksLikeImage(result.buffer, result.contentType)) return null;
      return {
        buffer: result.buffer,
        contentType: sniffType(result.buffer, result.contentType),
      };
    } catch {
      return null;
    }
  };

  let pageUrl = siteUrl.toString();
  try {
    const page = await fetchLimited(pageUrl, MAX_HTML_BYTES);
    if (page) {
      pageUrl = page.finalUrl;
      // Cap the attempts so a page full of broken icon links can't stall the request.
      const candidates = extractIconCandidates(page.buffer.toString("utf8"), pageUrl);
      for (const candidate of candidates.slice(0, 4)) {
        const icon = await tryIcon(candidate.href);
        if (icon) return icon;
      }
    }
  } catch {
    // Page unreachable or blocked — fall through to the conventional locations.
  }

  const origin = new URL(pageUrl).origin;
  return (
    (await tryIcon(`${origin}/apple-touch-icon.png`)) ??
    (await tryIcon(`${origin}/favicon.ico`)) ??
    (await tryIcon(
      `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(new URL(pageUrl).hostname)}`,
    ))
  );
}
