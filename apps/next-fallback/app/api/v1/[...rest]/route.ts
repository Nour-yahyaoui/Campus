import { notFound, unavailable } from "@campussphere/core";
import { withRead } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Any path not implemented by the read subset: writes are explicitly refused
 * with 503 (never a fake success), and unknown routes get a JSON 404.
 */
async function refuse(request: Request, segments: string[]): Promise<Response> {
  const route = `/api/v1/${segments.join("/")}`;
  return withRead(request, route, async (context) => {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      void context;
      throw unavailable(
        `The fallback API is read-only, so ${method} ${route} was not performed. Send writes to the primary API.`,
      );
    }
    throw notFound("This endpoint is not part of the fallback read contract.");
  });
}

type Context = { params: Promise<{ rest: string[] }> };

export function GET(request: Request, context: Context) {
  return context.params.then((value) => refuse(request, value.rest));
}
export function POST(request: Request, context: Context) {
  return context.params.then((value) => refuse(request, value.rest));
}
export function PUT(request: Request, context: Context) {
  return context.params.then((value) => refuse(request, value.rest));
}
export function PATCH(request: Request, context: Context) {
  return context.params.then((value) => refuse(request, value.rest));
}
export function DELETE(request: Request, context: Context) {
  return context.params.then((value) => refuse(request, value.rest));
}
