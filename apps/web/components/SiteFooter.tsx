import Link from "next/link";
import { PRODUCT } from "@campussphere/contracts";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <h2 className="serif" style={{ fontSize: "1.35rem" }}>
            {PRODUCT.name}
          </h2>
          <p className="small muted" style={{ maxWidth: "38ch" }}>
            A free, open-source university community platform. Browse without an account; sign in only
            when you want to take part.
          </p>
          <p className="tiny muted">
            Built by {PRODUCT.creator} · {PRODUCT.license} licensed
          </p>
          <p className="tiny muted" style={{ maxWidth: "42ch" }}>
            Pilot software. CampusSphere is not officially endorsed or operated by any university, and
            every number shown on this site is measured from this deployment.
          </p>
        </div>
        <div>
          <h2>Explore</h2>
          <ul className="footer-links">
            <li><Link href="/clubs">Clubs</Link></li>
            <li><Link href="/events">Events</Link></li>
            <li><Link href="/projects">Projects</Link></li>
            <li><Link href="/search">Search</Link></li>
            <li><Link href="/about">About &amp; status</Link></li>
          </ul>
        </div>
        <div>
          <h2>Project</h2>
          <ul className="footer-links">
            <li>
              <a href={PRODUCT.repository} rel="noreferrer noopener" target="_blank">
                Source code
              </a>
            </li>
            <li><Link href="/about#privacy">Privacy</Link></li>
            <li><Link href="/about#accessibility">Accessibility</Link></li>
            <li><Link href="/about#security">Security</Link></li>
            <li>
              <a href={`${PRODUCT.repository}/blob/main/LICENSE`} rel="noreferrer noopener" target="_blank">
                MIT license
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
