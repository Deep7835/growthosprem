"use client";

import { useState, type ReactNode } from "react";
import { PLACEMENTS } from "@/lib/placements";
import { frameRatio, platformOf, tokenize, truncate, TRUNCATION, type PreviewMedia, type PreviewPost } from "@/lib/preview";

// Platform-accurate previews (CT-03): each placement in its app's own chrome, with the app's
// caption cut-off, crops and the parts of the screen its buttons cover (safe zones).

const FONT = { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' };
const LINK = { instagram: "#00376B", facebook: "#0064D1", linkedin: "#0A66C2" } as const;

function Icon({ d, size = 22, fill = "none", className = "" }: { d: string; size?: number; fill?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

const I = {
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z",
  comment: "M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z",
  save: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  like: "M7 10v11H3V10h4zm0 0 4-8a2.5 2.5 0 0 1 2.5 2.5V8h5.6a2 2 0 0 1 2 2.3l-1.4 9a2 2 0 0 1-2 1.7H7",
  share: "M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13",
  repost: "M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20",
  close: "M18 6 6 18M6 6l12 12",
  play: "M6 4l14 8-14 8z",
};

function Avatar({ post, size, ring = false }: { post: PreviewPost; size: number; ring?: boolean }) {
  const inner = (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold"
      style={{ width: size, height: size, background: post.account.color, fontSize: size * 0.42, color: "#17181C" }}
    >
      {post.account.name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
  if (!ring) return inner;
  return <span className="rounded-full p-[2px]" style={{ background: "linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)" }}><span className="block rounded-full bg-white p-[2px]">{inner}</span></span>;
}

/** Caption text with the platform's link colour and its "more" cut-off. */
function Caption({ post, prefix, dark = false }: { post: PreviewPost; prefix?: ReactNode; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const rule = TRUNCATION[post.kind];
  if (!rule || !post.caption) return null;
  const { shown, cut } = open ? { shown: post.caption, cut: false } : truncate(post.caption, rule);
  const color = dark ? "#ffffff" : LINK[platformOf(post.kind)];
  return (
    <p className="whitespace-pre-line break-words">
      {prefix}
      {tokenize(shown).map((t, i) =>
        t.kind === "text" ? (
          <span key={i}>{t.text}</span>
        ) : (
          <span key={i} style={{ color, fontWeight: dark ? 600 : undefined }}>
            {t.text}
          </span>
        ),
      )}
      {cut && (
        <button type="button" onClick={() => setOpen(true)} className={dark ? "font-semibold text-white/80" : "text-[#737373]"}>
          {platformOf(post.kind) === "facebook" ? " … " : "… "}
          {rule.more}
        </button>
      )}
    </p>
  );
}

function Media({ m, fit = "cover", className = "" }: { m: PreviewMedia; fit?: "cover" | "contain"; className?: string }) {
  if (m.type === "video") {
    return <video src={m.src} poster={m.poster ?? undefined} playsInline muted loop controls preload="metadata" className={`h-full w-full bg-black ${fit === "contain" ? "object-contain" : "object-cover"} ${className}`} />;
  }
  if (m.type === "document") {
    return <div className={`grid h-full w-full place-items-center bg-[#efefef] text-sm text-[#737373] ${className}`}>Document</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m.src} alt="" draggable={false} className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${className}`} />;
}

function NoMedia({ label = "No media yet" }: { label?: string }) {
  return <div className="grid h-full w-full place-items-center bg-[#efefef] text-sm text-[#8e8e8e]">{label}</div>;
}

/** Swipeable slides for carousels and multi-image posts. */
function Slides({ media, ratio, dots = true }: { media: PreviewMedia[]; ratio: number; dots?: boolean }) {
  const [i, setI] = useState(0);
  const at = Math.min(i, media.length - 1);
  return (
    <div className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: ratio }}>
      {media.length ? <Media m={media[at]} /> : <NoMedia />}
      {media.length > 1 && (
        <>
          <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">
            {at + 1}/{media.length}
          </span>
          {at > 0 && (
            <button type="button" aria-label="Previous slide" onClick={() => setI(at - 1)} className="absolute left-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow">
              ‹
            </button>
          )}
          {at < media.length - 1 && (
            <button type="button" aria-label="Next slide" onClick={() => setI(at + 1)} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow">
              ›
            </button>
          )}
          {dots && (
            <span className="absolute inset-x-0 -bottom-5 flex justify-center gap-1">
              {media.map((m, n) => (
                <span key={m.id} className={`size-1.5 rounded-full ${n === at ? "bg-[#0095f6]" : "bg-[#c7c7c7]"}`} />
              ))}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function when(post: PreviewPost, fallback = "Just now") {
  return post.when ?? fallback;
}

function InstagramFeed({ post }: { post: PreviewPost }) {
  const ratio = frameRatio(post.kind, post.media);
  const media = post.kind === "ig_post" ? post.media.slice(0, 1) : post.media;
  return (
    <div className="bg-white text-[14px] leading-[18px] text-[#000]" style={FONT}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar post={post} size={32} ring />
        <span className="flex-1 font-semibold">{post.account.handle.replace(/^@/, "")}</span>
        <Icon d={I.more} />
      </div>
      <Slides media={media} ratio={ratio} />
      <div className={`flex items-center gap-4 px-3 ${media.length > 1 ? "pb-2 pt-3" : "py-2.5"}`}>
        <Icon d={I.heart} size={24} />
        <Icon d={I.comment} size={24} />
        <Icon d={I.send} size={24} />
        <span className="flex-1" />
        <Icon d={I.save} size={24} />
      </div>
      <div className="flex flex-col gap-1 px-3 pb-3">
        <Caption post={post} prefix={<strong className="mr-1">{post.account.handle.replace(/^@/, "")}</strong>} />
        {post.firstComment.trim() && (
          <p className="text-[#737373]">
            <strong className="mr-1 text-black">{post.account.handle.replace(/^@/, "")}</strong>
            {post.firstComment.trim().slice(0, 90)}
            {post.firstComment.trim().length > 90 ? "…" : ""}
          </p>
        )}
        <p className="text-[11px] uppercase tracking-wide text-[#737373]">{when(post)}</p>
      </div>
    </div>
  );
}

/** Shaded areas the app's buttons and text cover on a full-screen post. */
function SafeZones({ top, bottom, right = 0 }: { top: number; bottom: number; right?: number }) {
  return (
    <>
      <span className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-end justify-center border-b border-dashed border-white/80 bg-[#ff3b30]/30 text-[10px] font-semibold text-white" style={{ height: `${top}%` }}>
        covered by the app
      </span>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-start justify-center border-t border-dashed border-white/80 bg-[#ff3b30]/30 pt-1 text-[10px] font-semibold text-white" style={{ height: `${bottom}%` }}>
        covered by caption and buttons
      </span>
      {right > 0 && (
        <span className="pointer-events-none absolute right-0 z-10 border-l border-dashed border-white/80 bg-[#ff3b30]/30" style={{ top: `${top}%`, bottom: `${bottom}%`, width: `${right}%` }} />
      )}
    </>
  );
}

function FullScreen({ post, children, safe, zones }: { post: PreviewPost; children: ReactNode; safe: boolean; zones: { top: number; bottom: number; right?: number } }) {
  return (
    <div className="relative w-full overflow-hidden bg-black text-white" style={{ ...FONT, aspectRatio: 9 / 16 }}>
      <div className="absolute inset-0">{post.media[0] ? <Media m={post.media[0]} /> : <NoMedia label="No video yet" />}</div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
      {safe && <SafeZones {...zones} />}
      {children}
    </div>
  );
}

function InstagramReel({ post, safe }: { post: PreviewPost; safe: boolean }) {
  return (
    <FullScreen post={post} safe={safe} zones={{ top: 10, bottom: 22, right: 15 }}>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-[20px] font-bold">
        Reels
        <Icon d={I.camera} size={24} />
      </div>
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5 text-[12px]">
        {[I.heart, I.comment, I.send, I.more].map((d) => (
          <Icon key={d} d={d} size={26} />
        ))}
        <span className="size-7 rounded-md border-2 border-white" style={{ background: post.account.color }} />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 pr-16 text-[13px] leading-[17px]">
        <span className="flex items-center gap-2">
          <Avatar post={post} size={30} />
          <strong>{post.account.handle.replace(/^@/, "")}</strong>
          <span className="rounded-lg border border-white/80 px-2 py-0.5 text-[12px] font-semibold">Follow</span>
        </span>
        <Caption post={post} dark />
        <span className="flex items-center gap-1.5 text-[12px]">
          <Icon d={I.music} size={13} />
          {post.account.handle.replace(/^@/, "")} · Original audio
        </span>
      </div>
    </FullScreen>
  );
}

function Story({ post, safe }: { post: PreviewPost; safe: boolean }) {
  const fb = platformOf(post.kind) === "facebook";
  return (
    <FullScreen post={post} safe={safe} zones={{ top: 14, bottom: 20 }}>
      <div className="absolute inset-x-0 top-0 flex flex-col gap-2 p-2.5">
        <span className="h-0.5 rounded-full bg-white/90" />
        <span className="flex items-center gap-2 text-[13px]">
          <Avatar post={post} size={30} ring={!fb} />
          <strong>{fb ? post.account.name : post.account.handle.replace(/^@/, "")}</strong>
          <span className="text-white/80">{post.when ? "Scheduled" : "1m"}</span>
          <span className="flex-1" />
          <Icon d={I.more} size={20} />
          <Icon d={I.close} size={22} />
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-3">
        <span className="flex-1 rounded-full border border-white/70 px-4 py-2 text-[13px] text-white/90">{fb ? "Reply…" : "Send message"}</span>
        <Icon d={fb ? I.like : I.heart} size={24} />
        <Icon d={I.send} size={24} />
      </div>
    </FullScreen>
  );
}

function FacebookGrid({ media }: { media: PreviewMedia[] }) {
  if (media.length === 0) return null;
  if (media.length === 1) {
    return (
      <div className="w-full bg-black" style={{ aspectRatio: frameRatio("fb_post", media) }}>
        <Media m={media[0]} />
      </div>
    );
  }
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;
  if (media.length === 3) {
    return (
      <div className="grid aspect-square grid-cols-2 grid-rows-[2fr_1fr] gap-0.5 bg-white">
        <div className="col-span-2 overflow-hidden">
          <Media m={media[0]} />
        </div>
        <Media m={media[1]} />
        <Media m={media[2]} />
      </div>
    );
  }
  return (
    <div className={`grid gap-0.5 bg-white ${media.length === 2 ? "aspect-[2/1] grid-cols-2" : "aspect-square grid-cols-2 grid-rows-2"}`}>
      {shown.map((m, i) => (
        <div key={m.id} className="relative overflow-hidden">
          <Media m={m} />
          {extra > 0 && i === 3 && <span className="absolute inset-0 grid place-items-center bg-black/50 text-3xl font-bold text-white">+{extra}</span>}
        </div>
      ))}
    </div>
  );
}

function FacebookPost({ post }: { post: PreviewPost }) {
  return (
    <div className="bg-white text-[15px] leading-[20px] text-[#050505]" style={FONT}>
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <Avatar post={post} size={40} />
        <span className="flex-1 leading-tight">
          <strong className="block text-[15px]">{post.account.name}</strong>
          <span className="flex items-center gap-1 text-[13px] text-[#65676b]">
            {when(post)} · <Icon d={I.globe} size={12} />
          </span>
        </span>
        <Icon d={I.more} />
      </div>
      <div className="px-4 pb-3">
        <Caption post={post} />
      </div>
      <FacebookGrid media={post.media} />
      <div className="mx-4 flex justify-around border-t border-[#ced0d4] py-1.5 text-[14px] font-semibold text-[#65676b]">
        {[
          [I.like, "Like"],
          [I.comment, "Comment"],
          [I.share, "Share"],
        ].map(([d, l]) => (
          <span key={l} className="flex items-center gap-1.5 py-1.5">
            <Icon d={d} size={18} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function FacebookReel({ post, safe }: { post: PreviewPost; safe: boolean }) {
  return (
    <FullScreen post={post} safe={safe} zones={{ top: 9, bottom: 24, right: 15 }}>
      <div className="absolute inset-x-0 top-0 px-4 py-3 text-[18px] font-bold">Reels</div>
      <div className="absolute bottom-28 right-3 flex flex-col items-center gap-5">
        {[I.like, I.comment, I.share].map((d) => (
          <Icon key={d} d={d} size={26} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 pr-16 text-[13px] leading-[17px]">
        <span className="flex items-center gap-2">
          <Avatar post={post} size={30} />
          <strong>{post.account.name}</strong>
          <span className="text-white/90">· Follow</span>
        </span>
        <Caption post={post} dark />
      </div>
    </FullScreen>
  );
}

function LinkedInPost({ post }: { post: PreviewPost }) {
  return (
    <div className="bg-white text-[14px] leading-[20px] text-[rgba(0,0,0,0.9)]" style={FONT}>
      <div className="flex items-start gap-2 px-4 pb-2 pt-3">
        <Avatar post={post} size={48} />
        <span className="flex-1 leading-tight">
          <strong className="block">{post.account.name}</strong>
          <span className="block text-[12px] text-[rgba(0,0,0,0.6)]">Company page</span>
          <span className="flex items-center gap-1 text-[12px] text-[rgba(0,0,0,0.6)]">
            {when(post, "Now")} · <Icon d={I.globe} size={11} />
          </span>
        </span>
        <Icon d={I.more} />
      </div>
      <div className="px-4 pb-2">
        <Caption post={post} />
      </div>
      {post.media[0] && <Slides media={post.media} ratio={frameRatio("li_post", post.media)} dots={false} />}
      <div className="mx-3 flex justify-around border-t border-[#e8e8e8] py-1 text-[13px] font-semibold text-[rgba(0,0,0,0.6)]">
        {[
          [I.like, "Like"],
          [I.comment, "Comment"],
          [I.repost, "Repost"],
          [I.send, "Send"],
        ].map(([d, l]) => (
          <span key={l} className="flex items-center gap-1 py-2">
            <Icon d={d} size={16} />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PostPreview({ post, safeZones = false }: { post: PreviewPost; safeZones?: boolean }) {
  switch (post.kind) {
    case "ig_post":
    case "ig_carousel":
      return <InstagramFeed post={post} />;
    case "ig_reel":
      return <InstagramReel post={post} safe={safeZones} />;
    case "ig_story":
    case "fb_story":
      return <Story post={post} safe={safeZones} />;
    case "fb_post":
      return <FacebookPost post={post} />;
    case "fb_reel":
      return <FacebookReel post={post} safe={safeZones} />;
    case "li_post":
      return <LinkedInPost post={post} />;
  }
}

/** A post's placements, switchable (CT-03), in a phone-width frame with the rule checks below. */
export function PreviewSwitcher({ posts, compact = false, initial }: { posts: PreviewPost[]; compact?: boolean; initial?: string }) {
  const [active, setActive] = useState(initial ?? posts[0]?.placementId);
  const [safe, setSafe] = useState(false);
  const post = posts.find((p) => p.placementId === active) ?? posts[0];
  if (!post) {
    return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Add a platform to see how this post will look.</p>;
  }
  const fullScreen = post.kind.endsWith("reel") || post.kind.endsWith("story");
  return (
    <div className="flex flex-col gap-2.5">
      {(posts.length > 1 || (fullScreen && !compact)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {posts.length > 1 &&
            posts.map((p) => (
              <button
                key={p.placementId}
                type="button"
                aria-pressed={p.placementId === post.placementId}
                onClick={() => setActive(p.placementId)}
                className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${p.placementId === post.placementId ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink-2"}`}
              >
                {PLACEMENTS[p.kind].label}
              </button>
            ))}
          {fullScreen && !compact && (
            <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
              <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} className="accent-ink" />
              Safe zones
            </label>
          )}
        </div>
      )}
      <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-xl border border-line shadow-sm">
        <PostPreview post={post} safeZones={safe} />
      </div>
      {post.kind.endsWith("story") && post.caption && <p className="text-center text-xs text-muted">Stories don’t show captions. Put the words on the image.</p>}
      {post.issues.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg bg-warn-bg px-3 py-2 text-[13px] text-warn-ink">
          {post.issues.map((i) => (
            <li key={i}>⚠ {i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
