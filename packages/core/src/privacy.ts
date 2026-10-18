import { createHmac } from "node:crypto";
import { getEnv } from "./env";

/**
 * Pseudonymising an IP address for storage and rate limiting.
 *
 * A truncated SHA-256 of an IPv4 address is not anonymous: the whole address
 * space is 2^32, so anyone holding the table can recover the address by
 * enumeration in minutes. An HMAC keyed with a server secret cannot be
 * enumerated without the key, which is what "we only store a hash" is supposed
 * to mean. The secret is `IP_HASH_SECRET`; when it is unset the value is
 * deterministic per deployment (rate-limit buckets stay stable) but is not a
 * privacy guarantee — `.env.example` and OPERATIONS say to set it.
 */
export function hashIp(ip: string): string {
  const secret = getEnv().IP_HASH_SECRET ?? "campussphere-ip-hash-v1";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
