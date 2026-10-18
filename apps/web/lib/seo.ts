import { PRODUCT } from "@campussphere/contracts";
import type { ClubDetail, EventDetail, ProjectSummary } from "@campussphere/contracts";
import { siteUrl } from "@campussphere/core";

/**
 * SEO and structured-data helpers.
 *
 * One place decides what a canonical URL looks like and how an entity is
 * described to search engines, so a club page, the sitemap and `llms.txt` cannot
 * disagree about it.
 */

export const SITE = {
  name: PRODUCT.name,
  tagline: PRODUCT.tagline,
  description: PRODUCT.description,
  creator: PRODUCT.creator,
  repository: PRODUCT.repository,
  license: PRODUCT.license,
  language: "en",
  locale: "en_US",
} as const;

/** Absolute URL for a path, never with a double slash. */
export function absolute(path: string): string {
  const base = siteUrl().replace(/\/+$/, "");
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Trim to a meta-description length without cutting a word in half. */
export function clampDescription(text: string, limit = 158): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : limit).replace(/[.,;:—–-]$/, "")}…`;
}

/**
 * JSON-LD is embedded in a <script> tag, so a value containing `</script>`
 * would end the tag early. Escaping `<` is the standard mitigation.
 */
export function jsonLdString(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    url: siteUrl(),
    name: SITE.name,
    description: SITE.description,
    inLanguage: SITE.language,
    publisher: { "@id": `${siteUrl()}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${siteUrl()}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: SITE.name,
    url: siteUrl(),
    logo: { "@type": "ImageObject", url: absolute("/icon.svg") },
    description: SITE.description,
    founder: { "@type": "Person", name: SITE.creator },
    sameAs: [SITE.repository],
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path),
    })),
  };
}

export function clubJsonLd(club: ClubDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": absolute(`/clubs/${club.slug}#organization`),
    name: club.name,
    url: absolute(`/clubs/${club.slug}`),
    description: clampDescription(club.tagline ?? club.description, 300),
    ...(club.logoUrl ? { logo: club.logoUrl, image: club.logoUrl } : {}),
    ...(club.websiteUrl ? { sameAs: [club.websiteUrl] } : {}),
    ...(club.instagramUrl ? { sameAs: [club.instagramUrl, club.websiteUrl].filter(Boolean) } : {}),
    foundingDate: club.createdAt,
    parentOrganization: { "@id": `${siteUrl()}/#organization` },
    knowsAbout: club.category,
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/JoinAction",
      userInteractionCount: club.memberCount,
    },
  };
}

export function projectJsonLd(project: ProjectSummary) {
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": absolute(`/projects/${project.slug}#creative-work`),
    name: project.title,
    headline: project.title,
    description: clampDescription(project.summary, 300),
    url: absolute(`/projects/${project.slug}`),
    ...(project.coverUrl ? { image: project.coverUrl } : {}),
    genre: project.category,
    dateCreated: project.createdAt,
    creator: { "@type": "Person", name: project.lead.name },
    ...(project.club
      ? {
          sourceOrganization: {
            "@type": "Organization",
            name: project.club.name,
            url: absolute(`/clubs/${project.club.slug}`),
          },
        }
      : {}),
    isPartOf: { "@id": `${siteUrl()}/#website` },
  };
}

export function eventJsonLd(event: EventDetail) {
  const cancelled = event.status === "cancelled";
  const soldOut = event.capacity !== null && event.registeredCount >= event.capacity;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": absolute(`/events/${event.slug}#event`),
    name: event.title,
    description: clampDescription(event.description || event.summary, 300),
    url: absolute(`/events/${event.slug}`),
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: cancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: event.isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    ...(event.coverUrl ? { image: [event.coverUrl] } : {}),
    location: event.isOnline
      ? { "@type": "VirtualLocation", url: event.onlineUrl ?? absolute(`/events/${event.slug}`) }
      : {
          "@type": "Place",
          name: event.venueName ?? "Campus venue",
          ...(event.venueAddress ? { address: event.venueAddress } : {}),
        },
    organizer: event.club
      ? {
          "@type": "Organization",
          name: event.club.name,
          url: absolute(`/clubs/${event.club.slug}`),
        }
      : { "@id": `${siteUrl()}/#organization` },
    // Registration is free and capacity is public, so the offer is honest.
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: cancelled || soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: absolute(`/events/${event.slug}`),
    },
    maximumAttendeeCapacity: event.capacity ?? undefined,
    ...(event.accessibilityNotes
      ? { accessibilityFeature: clampDescription(event.accessibilityNotes, 200) }
      : {}),
  };
}

/** ItemList for a listing page, so engines see what the page contains. */
export function itemListJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absolute(item.path),
    })),
  };
}
