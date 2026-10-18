export function SignOutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button className="btn btn-secondary btn-sm" type="submit">
        Sign out
      </button>
    </form>
  );
}
