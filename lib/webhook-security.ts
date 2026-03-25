import { BillingError } from "@/lib/errors";
import ipaddr from "ipaddr.js";
import { checkRateLimit } from "@/lib/rate-limit";

const YOOKASSA_DEFAULT_ALLOWLIST = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.156.11",
  "77.75.156.35",
  "77.75.154.128/25",
  "2a02:5180::/32"
];

function matchesEntry(ip: string, entry: string) {
  const normalizedEntry = entry.trim();
  if (!normalizedEntry) {
    return false;
  }

  try {
    const sourceIp = ipaddr.parse(ip);

    if (normalizedEntry.includes("/")) {
      const [range, bits] = ipaddr.parseCIDR(normalizedEntry);
      return sourceIp.match(range, bits);
    }

    const targetIp = ipaddr.parse(normalizedEntry);
    return sourceIp.kind() === targetIp.kind() && sourceIp.toNormalizedString() === targetIp.toNormalizedString();
  } catch {
    return false;
  }
}

export function getRequestIp(headers: Headers) {
  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0]?.trim().replace(/:\d+$/, "") ?? "";
  }

  const xRealIp = headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp.trim().replace(/:\d+$/, "");
  }

  return "";
}

export function assertIpAllowed(params: { ip: string; allowedRaw: string }) {
  const ip = params.ip;
  const allowedRaw = params.allowedRaw.trim();

  if (!ip) {
    throw new BillingError("Cannot resolve webhook source IP", 400);
  }

  const allowed = allowedRaw
    ? allowedRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : YOOKASSA_DEFAULT_ALLOWLIST;

  const match = allowed.some((entry) => matchesEntry(ip, entry));

  if (!match) {
    throw new BillingError("Webhook source IP is not allowed", 403);
  }
}

export async function assertRateLimit(params: { key: string; limitPerMinute: number }) {
  const ok = await checkRateLimit(params);
  if (!ok) {
    throw new BillingError("Too many webhook requests", 429);
  }
}
