import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@campussphere/contracts";
import {
  assertSameOrigin,
  enforceRateLimit,
  handleApi,
  jsonResponse,
  receiveLocalUpload,
  resolveSession,
  storageDriver,
} from "@campussphere/core";

export const dynamic = "force-dynamic";

/**
 * Development/preview only: the local storage driver has no external endpoint,
 * so the browser uploads to this route instead of a presigned S3 URL. It is
 * unreachable whenever object storage is configured, and refuses bodies larger
 * than the image budget.
 */
export async function PUT(request: Request) {
  return handleApi(request, "/api/uploads/body", async () => {
    if (storageDriver() !== "local") return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    assertSameOrigin(request);
    const store = await cookies();
    const me = await resolveSession(store.get(SESSION_COOKIE)?.value);
    if (!me) {
      return jsonResponse({ error: { code: "unauthorized", message: "Sign in to upload images." } }, 401);
    }
    await enforceRateLimit(request, "media.body", 30, 3600, me.id);
    const key = new URL(request.url).searchParams.get("key") ?? "";
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > 8 * 1024 * 1024) {
      return jsonResponse({ error: { code: "invalid_request", message: "That image is too large." } }, 413);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 8 * 1024 * 1024) {
      return jsonResponse({ error: { code: "invalid_request", message: "That image is too large." } }, 413);
    }
    await receiveLocalUpload(me, key, bytes);
    return new Response(null, { status: 204 });
  });
}
