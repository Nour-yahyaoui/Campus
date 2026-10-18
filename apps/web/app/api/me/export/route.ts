import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@campussphere/contracts";
import { enforceRateLimit, exportMyData, handleApi, resolveSession } from "@campussphere/core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleApi(request, "/api/me/export", async () => {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    const me = await resolveSession(token);
    if (!me) {
      return Response.json({ error: { code: "unauthorized", message: "Sign in first." } }, { status: 401 });
    }
    await enforceRateLimit(request, "me.export", 3, 3600, me.id);
    const data = await exportMyData(me);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="campussphere-export-${me.id}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
