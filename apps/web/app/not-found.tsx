import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell" style={{ maxWidth: 620, paddingTop: 64 }}>
      <p className="eyebrow">404</p>
      <h1>That page isn&apos;t here.</h1>
      <p className="lede">
        It may have been renamed, removed, or never existed. Club and event links use stable slugs, and
        private pages never render for people who are not allowed to see them.
      </p>
      <div className="row mt-2">
        <Link className="btn btn-primary" href="/">Go home</Link>
        <Link className="btn btn-secondary" href="/search">Search campus</Link>
      </div>
    </div>
  );
}
