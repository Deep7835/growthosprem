import { BrandBrainForm } from "@/components/ai/BrandBrainForm";
import { getBrandBrain } from "@/server/ai/service";
import { getSpaceContext } from "@/server/tenancy";
import { draftBrandBrainAction, saveBrandBrain } from "./actions";

export const metadata = { title: "Brand Brain" };

export default async function BrandBrainPage({ params }: PageProps<"/o/[org]/s/[space]/brand">) {
  const { org, space } = await params;
  const ctx = await getSpaceContext(org, space);
  const brain = await getBrandBrain(ctx.org.id, ctx.space.id);
  const initial = {
    website: brain?.website ?? "",
    description: brain?.description ?? "",
    audience: brain?.audience ?? "",
    voice: brain?.voice ?? "",
    dos: brain?.dos ?? "",
    donts: brain?.donts ?? "",
    offers: brain?.offers ?? "",
    usps: brain?.usps ?? "",
    faqs: brain?.faqs ?? "",
    competitors: brain?.competitors ?? "",
    captionLanguage: (brain?.captionLanguage ?? "en") as "en" | "hi" | "hinglish",
  };
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6 pb-14">
      <div>
        <h1 className="font-display text-2xl font-bold">Brand Brain</h1>
        <p className="mt-1 text-muted">What the AI knows about {ctx.space.name}. It writes captions and plans in this voice and follows these rules.</p>
      </div>
      <BrandBrainForm
        initial={initial}
        canEdit={ctx.can("space.settings")}
        save={saveBrandBrain.bind(null, org, space)}
        draft={draftBrandBrainAction.bind(null, org, space)}
      />
    </div>
  );
}
