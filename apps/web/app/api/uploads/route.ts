import { cookies } from "next/headers";
import { z } from "zod";
import { SESSION_COOKIE } from "@campussphere/contracts";
import {
  enforceRateLimit,
  handleApi,
  jsonResponse,
  readJson,
  requestUpload,
  resolveSession,
  uploadLimits,
} from "@campussphere/core";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["avatar", "club_logo", "club_cover", "project_cover", "event_cover"]),
  scopeId: z.string().uuid().nullish(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  byteSize: z.number().int().positive().max(20 * 1024 * 1024),
});

/**
 * Step 1 of an upload: authorize it and return a short-lived presigned PUT.
 * The bytes never pass through this server in production; the browser sends
 * them straight to object storage.
 */
export async function POST(request: Request) {
  return handleApi(request, "/api/uploads", async () => {
    const store = await cookies();
    const me = await resolveSession(store.get(SESSION_COOKIE)?.value);
    if (!me) {
      return jsonResponse({ error: { code: "unauthorized", message: "Sign in to upload images." } }, 401);
    }
    await enforceRateLimit(request, "media.presign", 30, 3600, me.id);
    const input = await readJson(request, schema);
    const result = await requestUpload(me, {
      kind: input.kind,
      scopeId: input.scopeId ?? null,
      contentType: input.contentType,
      byteSize: input.byteSize,
    });
    return jsonResponse({ ...result, limits: uploadLimits() }, 201);
  });
}
