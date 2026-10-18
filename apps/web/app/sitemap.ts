import type { MetadataRoute } from "next";
import { listClubs, listEvents, listProjects } from "@campussphere/core";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/clubs`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/events`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/projects`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.4 },
  ];

  const [clubs, projects, events] = await Promise.all([
    listClubs({ limit: 48 }).catch(() => ({ items: [], nextCursor: null })),
    listProjects({ limit: 48 }).catch(() => ({ items: [], nextCursor: null })),
    listEvents({ limit: 48, when: "upcoming" }).catch(() => ({ items: [], nextCursor: null })),
  ]);

  for (const club of clubs.items) {
    entries.push({ url: `${base}/clubs/${club.slug}`, changeFrequency: "weekly", priority: 0.7 });
  }
  for (const project of projects.items) {
    entries.push({ url: `${base}/projects/${project.slug}`, changeFrequency: "weekly", priority: 0.7 });
  }
  for (const event of events.items) {
    entries.push({ url: `${base}/events/${event.slug}`, changeFrequency: "weekly", priority: 0.7 });
  }
  return entries;
}
