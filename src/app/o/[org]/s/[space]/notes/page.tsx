import { EmptyState } from "@/components/ui";

export default function Page() {
  return (
    <div className="p-6">
      <EmptyState title="Notes are next" body="Briefs and meeting notes with / commands and @mentions arrive in a later milestone." />
    </div>
  );
}
