/** The organisation's mark on client-facing pages: its logo, or its initial in its colour (Settings › Branding). */
export function BrandMark({ name, color, logo, enabled = true, size = 30 }: { name: string; color: string | null; logo?: string | null; enabled?: boolean; size?: number }) {
  if (enabled && logo)
    // eslint-disable-next-line @next/next/no-img-element -- a small data URL, nothing to optimise
    return <img src={logo} alt="" width={size} height={size} className="shrink-0 rounded-lg object-contain" style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-lg font-bold text-white" style={{ width: size, height: size, background: (enabled && color) || "#17181C", fontSize: size * 0.45 }}>
      {name[0]}
    </span>
  );
}
