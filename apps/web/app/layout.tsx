import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./globals.css";
import { PRODUCT } from "@campussphere/contracts";
import { siteUrl } from "@campussphere/core";
import { currentUser } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { RouteProgress } from "@/components/RouteProgress";
import { OfflineGate } from "@/components/OfflineGate";
import { SITE, jsonLdString, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

const baseUrl = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: `${PRODUCT.name} — ${PRODUCT.tagline}`,
    template: `%s · ${PRODUCT.name}`,
  },
  description: PRODUCT.description,
  applicationName: PRODUCT.name,
  authors: [{ name: PRODUCT.creator, url: PRODUCT.repository }],
  creator: PRODUCT.creator,
  publisher: PRODUCT.name,
  category: "education",
  keywords: [
    "university clubs",
    "student clubs",
    "campus events",
    "student projects",
    "student organizations",
    "club management",
    "event registration",
    "campus community",
    "university platform",
    "student life",
    "open source",
    PRODUCT.name,
  ],
  openGraph: {
    type: "website",
    siteName: PRODUCT.name,
    title: `${PRODUCT.name} — ${PRODUCT.tagline}`,
    description: PRODUCT.description,
    url: baseUrl,
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT.name} — ${PRODUCT.tagline}`,
    description: PRODUCT.description,
    creator: "@nouryahyaoui",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let results show large previews; the default truncates them.
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Google Search Console. The HTML file in public/ proves ownership too; both
  // are harmless and either one is enough.
  verification: { google: "googlee1336cabbd4b0d8b" },
  appleWebApp: { capable: true, title: PRODUCT.name, statusBarStyle: "default" },
  formatDetection: { telephone: false, address: false, email: false },
  other: {
    "theme-color": "#24503c",
    "color-scheme": "light",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#24503c",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser().catch(() => null);
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader
          user={me ? { name: me.name, roles: me.roles, unread: me.unreadNotifications } : null}
        />
        {/* React hoists these into <head>. They cannot live in `metadata`
            because a page that sets its own `alternates` would drop them. */}
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${PRODUCT.name} — upcoming events`}
          href="/rss.xml"
        />
        <link
          rel="alternate"
          type="application/opensearchdescription+xml"
          title={`${PRODUCT.name} search`}
          href="/opensearch.xml"
        />
        <link rel="author" href={PRODUCT.repository} />
        <RouteProgress />
        <main id="main" className="site-main">
          {children}
        </main>
        <SiteFooter />
        <OfflineGate />
        {/* Site-wide structured data: one WebSite node (with the sitelinks
            search box) and one Organization node every page can reference. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString([websiteJsonLd(), organizationJsonLd()]) }}
        />
        <Analytics />
      </body>
    </html>
  );
}
