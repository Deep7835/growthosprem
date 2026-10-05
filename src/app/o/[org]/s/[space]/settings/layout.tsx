import Link from "next/link";

// Space settings tabs (SP-02). Accounts is built; the others arrive with their milestones.
const TABS = [
  ["Space", null],
  ["Accounts", "settings/accounts"],
  ["Autopost", null],
  ["Projects", null],
  ["Members", null],
  ["Statuses", null],
  ["Brand Brain", "brand"],
] as const;

export default async function SpaceSettingsLayout({ children, params }: LayoutProps<"/o/[org]/s/[space]/settings">) {
  const { org, space } = await params;
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5 p-6 pb-14">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold">Space settings</h1>
        <nav aria-label="Settings" className="flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map(([label, path]) =>
            path ? (
              <Link
                key={label}
                href={`/o/${org}/s/${space}/${path}`}
                aria-current={path === "settings/accounts" ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${path === "settings/accounts" ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
              >
                {label}
              </Link>
            ) : (
              <span key={label} title="Coming soon" className="cursor-default whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-faint">
                {label}
              </span>
            ),
          )}
        </nav>
      </div>
      {children}
    </div>
  );
}
