import Link from "next/link";

export function ChipRow({
  options,
  active,
  basePath,
  params,
}: {
  options: Array<{ value: string; label: string }>;
  active?: string;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const href = (value?: string) => {
    const search = new URLSearchParams();
    for (const [key, raw] of Object.entries(params)) {
      if (key === "category" || key === "cursor") continue;
      if (raw) search.set(key, raw);
    }
    if (value) search.set("category", value);
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };
  return (
    <div className="filter-bar" aria-label="Filter by category">
      <Link className="chip" href={href(undefined)} aria-current={!active ? "true" : undefined}>
        All
      </Link>
      {options.map((option) => (
        <Link
          key={option.value}
          className="chip"
          href={href(option.value)}
          aria-current={active === option.value ? "true" : undefined}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

export function SearchBox({
  action,
  defaultValue,
  placeholder = "Search…",
  label = "Search",
  hidden,
}: {
  action: string;
  defaultValue?: string;
  placeholder?: string;
  label?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form className="search-form" action={action} method="get" role="search">
      <label className="sr-only" htmlFor={`q-${action}`}>
        {label}
      </label>
      <input
        className="input"
        id={`q-${action}`}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={120}
      />
      {hidden
        ? Object.entries(hidden).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )
        : null}
      <button className="btn btn-secondary" type="submit">
        Search
      </button>
    </form>
  );
}
