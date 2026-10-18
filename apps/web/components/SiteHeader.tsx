"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface HeaderUser {
  name: string;
  roles: string[];
  unread: number;
}

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const links = [
    { href: "/clubs", label: "Clubs" },
    { href: "/events", label: "Events" },
    { href: "/projects", label: "Projects" },
    { href: "/search", label: "Search" },
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          CampusSphere
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>

        <nav
          id="site-nav"
          className={`site-nav${open ? " is-open" : ""}`}
          aria-label="Main navigation"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              className="nav-link"
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
          <div className="nav-actions">
            {user ? (
              <>
                <Link className="nav-link" href="/dashboard/notifications" aria-current={isActive("/dashboard/notifications") ? "page" : undefined}>
                  Inbox{user.unread > 0 ? ` (${user.unread})` : ""}
                </Link>
                {user.roles.includes("super_admin") ? (
                  <Link className="nav-link" href="/admin" aria-current={isActive("/admin") ? "page" : undefined}>
                    Admin
                  </Link>
                ) : null}
                <Link className="btn btn-secondary btn-sm" href="/dashboard">
                  {user.name.split(" ")[0]}
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button className="btn btn-ghost btn-sm" type="submit">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link className="btn btn-primary btn-sm" href="/login">
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
