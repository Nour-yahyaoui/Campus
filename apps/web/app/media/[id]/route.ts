import { getServableMedia, readLocalObject } from "@campussphere/core";

export const dynamic = "force-dynamic";

/**
 * Stable image URL stored in the database (`/media/<id>`). Redirects to the
 * object in storage — the public URL for a `public_read` bucket, or a
 * short-lived presigned URL for a private one. Keeping the app URL stable means
 * the storage host or bucket can change without rewriting every row.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const asset = await getServableMedia(id);
  if (!asset) return new Response("Not found", { status: 404 });

  if (asset.publicUrl) {
    return new Response(null, {
      status: 302,
      headers: {
        location: asset.publicUrl,
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }
  if (asset.signedUrl) {
    return new Response(null, {
      status: 302,
      headers: { location: asset.signedUrl, "cache-control": "private, max-age=240" },
    });
  }
  if (asset.local) {
    const bytes = await readLocalObject(asset.objectKey);
    if (!bytes) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": asset.contentType,
        "content-length": String(bytes.byteLength),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  }
  return new Response("Not found", { status: 404 });
}
