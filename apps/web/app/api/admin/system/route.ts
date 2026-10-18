import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@campussphere/contracts";
import { enforceRateLimit, handleApi, jsonResponse, resolveSession, systemSnapshot } from "@campussphere/core";

export const dynamic = "force-dynamic";

/**
 * Live server health for the admin console.
 *
 * Super-admin only: the payload includes process memory, host load and the
 * primary API's address. It is polled by the dashboard, so it is rate-limited
 * per account as well as authenticated.
 */
export async function GET(request: Request) {
  return handleApi(request, "/api/admin/system", async () => {
    const store = await cookies();
    const me = await resolveSession(store.get(SESSION_COOKIE)?.value);
    if (!me) {
      return jsonResponse(
        { error: { code: "unauthorized", message: "Sign in to read server health." } },
        401,
      );
    }
    if (!me.roles.includes("super_admin")) {
      return jsonResponse(
        { error: { code: "forbidden", message: "Server health is restricted to super-admins." } },
        403,
      );
    }
    await enforceRateLimit(request, "admin.system", 60, 60, me.id);
    return jsonResponse(await systemSnapshot());
  });
}
