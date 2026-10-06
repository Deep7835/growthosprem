"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

/** AI Copilot's own navigation: tools first, then conversations and Brand Brain. */
export function AiNav({ org, conversations, spaces }: { org: string; conversations: { id: string; title: string }[]; spaces: { slug: string; name: string }[] }) {
  const pathname = usePathname();
  const base = `/o/${org}/ai`;
  const item = (href: string, icon: IconName, label: string, exact = false) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex h-8 items-center gap-2.5 rounded-md px-2 ${active ? "bg-select font-medium text-ink" : "text-ink-2 hover:bg-subtle"}`}>
        <Icon name={icon} /> {label}
      </Link>
    );
  };
  return (
    <nav aria-label="AI Copilot" className="flex w-full shrink-0 flex-col gap-px border-line bg-surface p-3 text-sm md:w-60 md:border-r">
      <Link href={base} className="mb-2 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line font-semibold hover:bg-subtle">
        <Icon name="plus" size={15} /> New conversation
      </Link>
      {item(`${base}/prompts`, "clipboard", "Prompts")}
      {item(`${base}/workflows`, "trending", "Workflows")}
      {item(`${base}/runs`, "check", "Runs")}
      {item(`${base}/persona`, "users", "Your persona")}
      <p className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-faint">Conversations</p>
      {conversations.length === 0 && <p className="px-2 py-1 text-muted">None yet.</p>}
      {conversations.map((c) => {
        const href = `${base}/c/${c.id}`;
        return (
          <Link key={c.id} href={href} aria-current={pathname === href ? "page" : undefined} className={`truncate rounded-md px-2 py-1.5 ${pathname === href ? "bg-select font-medium" : "text-ink-2 hover:bg-subtle"}`}>
            {c.title}
          </Link>
        );
      })}
      <p className="px-2 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-faint">Brand Brain</p>
      {spaces.map((s) => (
        <Link key={s.slug} href={`/o/${org}/s/${s.slug}/brand`} className="truncate rounded-md px-2 py-1.5 text-ink-2 hover:bg-subtle">
          {s.name}
        </Link>
      ))}
      <Link href={`/o/${org}/settings/ai`} className="mt-4 flex h-8 items-center gap-2.5 rounded-md px-2 text-ink-2 hover:bg-subtle">
        <Icon name="gear" /> AI usage and budget
      </Link>
    </nav>
  );
}
