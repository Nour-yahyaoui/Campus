import { API_VERSION, PRODUCT } from "@campussphere/contracts";
import { jsonResponse } from "@campussphere/core";

export const dynamic = "force-dynamic";

/** Service index: says plainly which subset this deployment serves. */
export function GET() {
  return jsonResponse({
    service: "campussphere-fallback-api",
    product: PRODUCT.name,
    apiVersion: API_VERSION,
    mode: "read-only",
    note:
      "This is the fallback API. It serves the contract-compatible read subset and refuses writes with 503 instead of pretending to succeed. The primary API owns mutations.",
    endpoints: [
      "GET /health/live",
      "GET /health/ready",
      "GET /api/v1/clubs",
      "GET /api/v1/clubs/{slug}",
      "GET /api/v1/projects",
      "GET /api/v1/projects/{slug}",
      "GET /api/v1/events",
      "GET /api/v1/events/{slug}",
      "GET /api/v1/search?q=",
      "GET /api/v1/me",
    ],
  });
}
