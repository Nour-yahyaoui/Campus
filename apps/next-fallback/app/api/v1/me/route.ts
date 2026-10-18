import { jsonResponse, unauthorized } from "@campussphere/core";
import { currentUser, withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withRead(request, "/api/v1/me", async () => {
    const me = await currentUser(request);
    if (!me) throw unauthorized();
    return jsonResponse({
      data: { id: me.id, name: me.name, email: me.email, roles: me.roles, avatarUrl: me.avatarUrl },
    });
  });
}
