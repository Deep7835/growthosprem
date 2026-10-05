import { OverviewTabs } from "@/components/shell/OverviewTabs";

export default async function OverviewLayout({ children, params }: LayoutProps<"/o/[org]/overview">) {
  const { org } = await params;
  return (
    <div className="flex min-h-full flex-col">
      <OverviewTabs base={`/o/${org}`} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
