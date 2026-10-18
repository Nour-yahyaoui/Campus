import { SITE, absolute } from "@/lib/seo";

/**
 * OpenSearch description document: lets browsers and search toolbars add
 * CampusSphere as a search provider, dispatching to `/search?q=`.
 *
 * Linked from the layout's `alternates.types`, which is what browsers read.
 */
export async function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>${SITE.name}</ShortName>
  <Description>Search clubs, projects and events on ${SITE.name}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="32" height="32" type="image/svg+xml">${absolute("/icon.svg")}</Image>
  <Url type="text/html" method="get" template="${absolute("/search")}?q={searchTerms}" />
  <Url type="application/opensearchdescription+xml" rel="self" template="${absolute("/opensearch.xml")}" />
  <Contact>${SITE.repository}/issues</Contact>
</OpenSearchDescription>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/opensearchdescription+xml; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
