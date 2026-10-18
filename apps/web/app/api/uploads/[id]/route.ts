import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@campussphere/contracts";
import {
  assertSameOrigin,
  deleteMedia,
  enforceRateLimit,
  handleApi,
  jsonResponse,
  resolveSession,
} from "@campussphere/core";

export const dynamic = "force-dynamic";

/**
 * Removes an uploaded image: the attachment on the page, the media row, and the
 * object. Allowed for the person who uploaded it and for super-admins; anyone
 * else gets `403` (the same code path that moderates a bad club logo).
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return handleApi(request, "/api/uploads/:id", async () => {
    assertSameOrigin(request);
    const store = await cookies();
    const me = await resolveSession(store.get(SESSION_COOKIE)?.value);
    if (!me) {
      return jsonResponse({ error: { code: "unauthorized", message: "Sign in to remove images." } }, 401);
    }
    await enforceRateLimit(request, "media.delete", 60, 3600, me.id);
    await deleteMedia(me, id);
    return jsonResponse({ ok: true }, 200);
  });
}
