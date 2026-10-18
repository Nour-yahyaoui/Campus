import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@campussphere/contracts";
import {
  assertSameOrigin,
  completeUpload,
  enforceRateLimit,
  handleApi,
  jsonResponse,
  resolveSession,
} from "@campussphere/core";

export const dynamic = "force-dynamic";

/**
 * Step 3: verify the object in storage (size, type, magic bytes) and attach it
 * to the user/club/project/event. Nothing is attached until this succeeds.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(request, "/api/uploads/:id/complete", async () => {
    const store = await cookies();
    const me = await resolveSession(store.get(SESSION_COOKIE)?.value);
    if (!me) {
      return jsonResponse({ error: { code: "unauthorized", message: "Sign in to upload images." } }, 401);
    }
    assertSameOrigin(request);
    await enforceRateLimit(request, "media.complete", 60, 3600, me.id);
    const asset = await completeUpload(me, id);
    return jsonResponse({ url: asset.url, media: asset });
  });
}
