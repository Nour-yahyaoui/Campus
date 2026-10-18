import { beforeEach, describe, expect, it } from "vitest";
import { closePool, createSession, query } from "@campussphere/core";
import { GET as index } from "../app/route";
import { GET as live } from "../app/health/live/route";
import { GET as ready } from "../app/health/ready/route";
import { GET as clubs, POST as createClub } from "../app/api/v1/clubs/route";
import { GET as clubDetail } from "../app/api/v1/clubs/[slug]/route";
import { GET as me } from "../app/api/v1/me/route";
import { GET as unknown, POST as unsupported } from "../app/api/v1/[...rest]/route";

async function reset() {
  await query(`truncate table api_metrics, rate_limit_counters, sessions, users, club_memberships, clubs restart identity cascade`);
}

async function seedClub() {
  const user = await query<{ id: string }>(
    `insert into users (email, email_verified, name) values ('fallback@example.edu', true, 'Fallback Tester') returning id`,
  );
  const club = await query<{ id: string }>(
    `insert into clubs (slug, name, description, category, membership_policy, created_by)
     values ('robotics-society', 'Robotics Society', 'A student-run workshop for anyone curious about machines, building things weekly.', 'technology', 'open', $1)
     returning id`,
    [user.rows[0]!.id],
  );
  return { userId: user.rows[0]!.id, clubId: club.rows[0]!.id };
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });

beforeEach(async () => {
  await reset();
});

describe("fallback surface", () => {
  it("serves a service index that states the read-only contract", async () => {
    const response = await index();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ service: "campussphere-fallback-api", mode: "read-only" });
    expect(body.endpoints).toContain("GET /api/v1/clubs");
  });

  it("keeps liveness independent from the database", async () => {
    const response = await live(new Request("http://localhost:4000/health/live"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("reports readiness with a database check", async () => {
    const response = await ready(new Request("http://localhost:4000/health/ready"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });

  it("lists public clubs and a single club", async () => {
    await seedClub();
    const list = await clubs(new Request("http://localhost:4000/api/v1/clubs"));
    const listBody = await list.json();
    expect(list.status).toBe(200);
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0]).toMatchObject({ slug: "robotics-society", memberCount: 0 });
    expect(list.headers.get("x-fallback-service")).toBe("campussphere-next-fallback");

    const detail = await clubDetail(
      new Request("http://localhost:4000/api/v1/clubs/robotics-society"),
      ctx({ slug: "robotics-society" }),
    );
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({ data: { slug: "robotics-society" } });
  });

  it("returns 404 for an unknown club", async () => {
    const response = await clubDetail(
      new Request("http://localhost:4000/api/v1/clubs/nope"),
      ctx({ slug: "nope" }),
    );
    expect(response.status).toBe(404);
  });

  it("refuses writes with 503 and does not create anything", async () => {
    const before = await query<{ n: number }>("select count(*)::int as n from clubs");
    const response = await createClub(
      new Request("http://localhost:4000/api/v1/clubs", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("unavailable");
    expect(body.error.message).toContain("read-only");
    // Clients quote this when reporting a problem; it must match the header
    // and the metrics row, otherwise support cannot trace the request.
    expect(body.error.correlationId).toBe(response.headers.get("x-correlation-id"));
    expect(typeof body.error.correlationId).toBe("string");
    expect(body.error.correlationId.length).toBeGreaterThanOrEqual(8);
    const after = await query<{ n: number }>("select count(*)::int as n from clubs");
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });

  it("returns JSON 404 for an unknown read and 503 for an unknown write", async () => {
    const request = new Request("http://localhost:4000/api/v1/not-a-route");
    const read = await unknown(request, ({ params: Promise.resolve({ rest: ["not-a-route"] }) }));
    expect(read.status).toBe(404);

    const write = await unsupported(
      new Request("http://localhost:4000/api/v1/not-a-route", { method: "POST" }),
      ({ params: Promise.resolve({ rest: ["not-a-route"] }) }),
    );
    expect(write.status).toBe(503);
    expect((await write.json()).error.message).toContain("not performed");
  });

  it("requires a session for /api/v1/me and accepts a bearer token otherwise", async () => {
    const anonymous = await me(new Request("http://localhost:4000/api/v1/me"));
    expect(anonymous.status).toBe(401);

    const user = await query<{ id: string }>(
      `insert into users (email, email_verified, name) values ('me@example.edu', true, 'Me Tester') returning id`,
    );
    const session = await createSession(user.rows[0]!.id);
    const response = await me(
      new Request("http://localhost:4000/api/v1/me", {
        headers: { authorization: `Bearer ${session.token}` },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { email: "me@example.edu" } });

    await closePool();
  });
});
