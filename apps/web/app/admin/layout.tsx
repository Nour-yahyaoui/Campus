import Link from "next/link";
import { requireSuperAdmin } from "@/lib/session";
import { Notice } from "@/components/Pieces";

const tabs = [
  { href: "/admin", label: "Overview & queue" },
  { href: "/admin/users", label: "People" },
  { href: "/admin/clubs", label: "Clubs" },
  { href: "/admin/reports", label: "Moderation" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/observatory", label: "Observatory" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireSuperAdmin("/admin");
  return (
    <div className="shell">
      <div className="page-head" style={{ paddingBottom: 0 }}>
        <p className="eyebrow">Operations</p>
        <div className="spread">
          <h1 style={{ marginBottom: 4 }}>Admin console</h1>
          <span className="tag tag-forest">super-admin · {me.name}</span>
        </div>
        <nav className="filter-bar" aria-label="Admin sections" style={{ marginBottom: 8 }}>
          {tabs.map((tab) => (
            <Link key={tab.href} className="chip" href={tab.href}>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      <Notice tone="neutral">
        Every action here is written to an append-only audit log. Decisions store who decided, when and
        why. Nothing on these pages is simulated.
      </Notice>
      {children}
    </div>
  );
}
