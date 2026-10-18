import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

/**
 * A deliberately small S3-compatible stub, for tests only.
 *
 * It exists so the production storage path can be exercised without real
 * credentials: presigned PUT/GET URLs, path-style addressing, `HeadObject`,
 * ranged `GetObject`, `DeleteObject` and `Put/GetBucketCors`. It does **not**
 * verify signatures — that is the one thing only a real provider can prove.
 */
export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface CorsRule {
  allowedOrigins: string[];
  allowedMethods: string[];
}

export interface S3Stub {
  endpoint: string;
  objects: Map<string, StoredObject>;
  requests: Array<{ method: string; path: string; range?: string }>;
  cors: CorsRule[];
  close: () => Promise<void>;
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function startS3Stub(): Promise<S3Stub> {
  const objects = new Map<string, StoredObject>();
  const requests: Array<{ method: string; path: string; range?: string }> = [];
  const cors: CorsRule[] = [];

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://stub");
    // Path-style: /<bucket>/<key…>?<query>
    const segments = url.pathname.replace(/^\//, "").split("/");
    const bucket = segments.shift() ?? "";
    const key = segments.join("/");
    requests.push({ method: request.method ?? "GET", path: url.pathname, range: request.headers.range });

    const isCors = url.searchParams.has("cors");

    if (bucket !== "campus") {
      response.writeHead(404).end();
      return;
    }

    if (isCors && request.method === "PUT") {
      const body = (await readBody(request)).toString("utf8");
      // Tiny parse of the XML the SDK sends — enough to assert round-tripping.
      const rule: CorsRule = {
        allowedOrigins: [...body.matchAll(/<AllowedOrigin>([^<]*)<\/AllowedOrigin>/g)].map((m) => m[1]!),
        allowedMethods: [...body.matchAll(/<AllowedMethod>([^<]*)<\/AllowedMethod>/g)].map((m) => m[1]!),
      };
      cors.length = 0;
      cors.push(rule);
      response.writeHead(200, { "content-type": "application/xml" }).end();
      return;
    }

    if (isCors && request.method === "GET") {
      if (cors.length === 0) {
        response
          .writeHead(404, { "content-type": "application/xml" })
          .end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchCORSConfiguration</Code></Error>');
        return;
      }
      const rules = cors
        .map(
          (rule) =>
            `<CORSRule>${rule.allowedOrigins.map((origin) => `<AllowedOrigin>${xml(origin)}</AllowedOrigin>`).join("")}${rule.allowedMethods
              .map((method) => `<AllowedMethod>${xml(method)}</AllowedMethod>`)
              .join("")}</CORSRule>`,
        )
        .join("");
      response
        .writeHead(200, { "content-type": "application/xml" })
        .end(`<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration>${rules}</CORSConfiguration>`);
      return;
    }

    if (!key) {
      // ListBuckets / HeadBucket
      response.writeHead(200, { "content-type": "application/xml" }).end();
      return;
    }

    if (request.method === "PUT") {
      const body = await readBody(request);
      const contentType = String(request.headers["content-type"] ?? "application/octet-stream");
      objects.set(key, { body, contentType });
      response.writeHead(200, { etag: `"${randomUUID()}"` }).end();
      return;
    }

    const stored = objects.get(key);
    if (request.method === "DELETE") {
      objects.delete(key);
      response.writeHead(204).end();
      return;
    }
    if (!stored) {
      response
        .writeHead(404, { "content-type": "application/xml" })
        .end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code></Error>');
      return;
    }

    if (request.method === "HEAD") {
      response
        .writeHead(200, { "content-length": String(stored.body.length), "content-type": stored.contentType })
        .end();
      return;
    }

    if (request.method === "GET") {
      const range = /^bytes=(\d+)-(\d+)$/.exec(String(request.headers.range ?? ""));
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(Number(range[2]), stored.body.length - 1);
        const slice = stored.body.subarray(start, end + 1);
        response
          .writeHead(206, {
            "content-range": `bytes ${start}-${end}/${stored.body.length}`,
            "content-length": String(slice.length),
            "content-type": stored.contentType,
          })
          .end(slice);
        return;
      }
      response
        .writeHead(200, { "content-length": String(stored.body.length), "content-type": stored.contentType })
        .end(stored.body);
      return;
    }

    response.writeHead(405).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("s3 stub did not bind a port");

  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    objects,
    requests,
    cors,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
