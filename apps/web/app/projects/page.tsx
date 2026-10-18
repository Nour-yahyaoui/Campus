import type { Metadata } from "next";
import { PROJECT_CATEGORIES } from "@campussphere/contracts";
import { categoryLabel } from "@/lib/format";
import { readProjects } from "@/lib/reads";
import { EmptyState, Pager, ProjectCard } from "@/components/Pieces";
import { ChipRow, SearchBox } from "@/components/Filters";
import { absolute, itemListJsonLd, jsonLdString } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Student projects that passed review: software, robotics, research, volunteering, campus improvements and more. Find a team to join.",
  alternates: { canonical: "/projects" },
  openGraph: { url: absolute("/projects"), title: "Student projects" },
};


export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const projects = await readProjects({ category: params.category, q: params.q, cursor: params.cursor, limit: 12 });

  const itemList = itemListJsonLd(
    projects.items.map((project) => ({ name: project.title, path: `/projects/${project.slug}` })),
  );

  return (
    <div className="shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(itemList) }} />
      <div className="page-head">
        <p className="eyebrow">Make something</p>
        <h1>Student projects</h1>
        <p className="lede">
          Every project below was reviewed by a super-admin before it went public. Apply to a role and
          the lead decides — no automatic joins.
        </p>
        <div className="mt-2">
          <SearchBox action="/projects" defaultValue={params.q} placeholder="Search projects by topic" />
        </div>
      </div>

      <ChipRow
        basePath="/projects"
        params={{ q: params.q }}
        active={params.category}
        options={PROJECT_CATEGORIES.map((category) => ({ value: category, label: categoryLabel(category) }))}
      />

      {projects.items.length === 0 ? (
        <EmptyState
          title="No approved projects yet"
          action={<a className="btn btn-secondary" href="/dashboard/projects/new">Propose a project</a>}
        >
          Proposals go through a review queue, then appear here once approved.
        </EmptyState>
      ) : (
        <div className="grid-3">
          {projects.items.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
      <Pager nextCursor={projects.nextCursor} basePath="/projects" params={{ category: params.category, q: params.q }} />
    </div>
  );
}
