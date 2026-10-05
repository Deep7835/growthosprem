// A stand-in for Meta used in development until META_APP_ID is set (or with META_FAKE=1).
// The whole flow runs — login, page picker, history import, syncs, token health — on
// generated data. Accounts connected this way are marked as sample data.
import { randomUUID } from "node:crypto";
import { generateDemoHistory } from "@/db/demo-history";
import { GraphError, type Graph, type ImportedPost, type PageCandidate } from "./graph";

const DAY = 864e5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAGES: PageCandidate[] = [
  {
    pageId: "fake_fb_cafe",
    pageName: "Cafe Delhi",
    pageToken: "fake-token:fake_fb_cafe",
    picture: null,
    followers: 3632,
    instagram: { id: "fake_ig_cafe", username: "cafe.delhi", picture: null, followers: 9820 },
  },
  {
    pageId: "fake_fb_greenleaf",
    pageName: "Green Leaf Realty",
    pageToken: "fake-token:fake_fb_greenleaf",
    picture: null,
    followers: 1240,
    instagram: null,
  },
];

const REALTY = ["3BHK walkthrough in Sector 62", "Home loan basics", "Site visit this Saturday", "Before and after: lobby", "Why buy before Diwali", "Client keys handover"];

// Posts published in sample mode, so later syncs find them like real ones. Kept per process.
type FakePost = ImportedPost & { numbers: Record<string, number> };
const globalForFake = globalThis as unknown as { __fakePublished?: Map<string, FakePost[]>; __fakeFlaky?: Set<string> };
const published: Map<string, FakePost[]> = (globalForFake.__fakePublished ??= new Map());
const flaky: Set<string> = (globalForFake.__fakeFlaky ??= new Set());

const KIND_FORMAT = { ig_post: "post", ig_reel: "reel", ig_story: "story", ig_carousel: "carousel", fb_post: "post", fb_reel: "reel", fb_story: "story", li_post: "post" } as const;

function postsFor(id: string, now: Date) {
  return [...(published.get(id) ?? []), ...historyFor(id, now)];
}

function historyFor(id: string, now: Date) {
  if (id === "fake_fb_greenleaf") {
    return REALTY.map((title, i) => {
      const reach = 600 + i * 90;
      return {
        externalId: `${id}_${i + 1}`,
        publishedAt: new Date(now.getTime() - (8 + i * 13) * DAY),
        format: (i % 2 ? "post" : "reel") as ImportedPost["format"],
        caption: title,
        numbers: { reach, views: Math.round(reach * 1.2), likes: 20 + i * 4, comments: 2 + i, saves: 3, shares: 1 + (i % 3) },
      };
    });
  }
  const platform = id.startsWith("fake_ig") ? "instagram" : "facebook";
  return generateDemoHistory(now)
    .posts.filter((p) => p.platform === platform)
    .map((p) => ({
      externalId: `${id}_${p.externalId}`,
      publishedAt: p.publishedAt,
      format: p.format,
      caption: `${p.title}\n\n#cafedelhi #${p.pillar.replace(/\s/g, "")}`,
      numbers: { reach: p.reach, views: p.views, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares },
    }));
}

/** Numbers keep growing for a post's first three days, like the real thing. */
function grown(n: number, publishedAt: Date, now: Date) {
  const age = Math.max(0, now.getTime() - publishedAt.getTime());
  return Math.round(n * Math.min(1, Math.sqrt(age / (3 * DAY))));
}

export function createFakeGraph(opts: { delayMs?: number; now?: () => Date } = {}): Graph {
  const delay = opts.delayMs ?? 120;
  const now = opts.now ?? (() => new Date());
  return {
    fake: true,
    // No Facebook dialog: straight back to the callback, as if the person had approved.
    loginUrl: (state, redirectUri) => `${redirectUri}?code=fake-code&state=${encodeURIComponent(state)}`,
    exchangeCode: async () => ({ userToken: "fake-user-token" }),
    listPages: async () => PAGES,
    inspectToken: async (token) => ({
      valid: true,
      // Green Leaf's access runs out soon, to show the "Expires in N days" state.
      expiresAt: new Date(now().getTime() + (token.includes("greenleaf") ? 5 : 60) * DAY),
      scopes: [],
    }),
    async profile(platform, id) {
      const page = PAGES.find((p) => p.pageId === id || p.instagram?.id === id);
      if (!page) throw new Error(`Unknown sample account ${id}`);
      return platform === "instagram" && page.instagram
        ? { handle: `@${page.instagram.username}`, name: page.pageName, followers: page.instagram.followers }
        : { handle: page.pageName, name: page.pageName, followers: page.followers };
    },
    async listPosts(_platform, id, _token, since) {
      await sleep(delay * 3);
      return postsFor(id, now())
        .filter((p) => p.publishedAt >= since && p.publishedAt <= now())
        .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        .map(({ numbers, ...p }) => ({ ...p, permalink: null, raw: numbers }));
    },
    async postNumbers(_platform, post) {
      await sleep(delay);
      const n = post.raw as Record<string, number>;
      const at = now();
      return {
        reach: grown(n.reach, post.publishedAt, at),
        views: grown(n.views, post.publishedAt, at),
        likes: grown(n.likes, post.publishedAt, at),
        comments: grown(n.comments, post.publishedAt, at),
        saves: grown(n.saves, post.publishedAt, at),
        shares: grown(n.shares, post.publishedAt, at),
      };
    },
    async followerHistory(platform, id, _token, since) {
      if (platform !== "facebook") return [];
      const page = PAGES.find((p) => p.pageId === id);
      const end = page?.followers ?? 0;
      const days = Math.floor((now().getTime() - since.getTime()) / DAY);
      return Array.from({ length: days }, (_, i) => ({
        at: new Date(since.getTime() + (i + 1) * DAY),
        followers: Math.round(end * (0.925 + (0.075 * (i + 1)) / days)),
      }));
    },

    /**
     * Pretends to publish. Put #samplefail in a caption to see a failure, or #sampleflaky
     * for a temporary error that succeeds on the automatic retry.
     */
    async publish(req, step) {
      await sleep(delay * 2);
      if (/#samplefail\b/i.test(req.caption)) {
        throw new GraphError("Sample mode: this post was set to fail (#samplefail is in the caption).", 100, 400);
      }
      const key = `${req.targetId}:${req.caption}`;
      if (/#sampleflaky\b/i.test(req.caption) && !flaky.has(key)) {
        flaky.add(key);
        throw new GraphError("Sample mode: a temporary Meta error (#sampleflaky). It is retried automatically.", 2, 503);
      }
      await step("container", req.containerId ?? `fake_container_${randomUUID().slice(0, 8)}`);
      await step("publish_sent");
      const externalId = `${req.targetId}_pub_${randomUUID().slice(0, 8)}`;
      const list = published.get(req.targetId) ?? [];
      list.unshift({
        externalId,
        publishedAt: now(),
        format: KIND_FORMAT[req.kind] === "post" && req.media.length > 1 ? "carousel" : KIND_FORMAT[req.kind],
        caption: req.caption,
        permalink: null,
        numbers: { reach: 2400, views: 3100, likes: 160, comments: 14, saves: 30, shares: 9 },
      });
      published.set(req.targetId, list);
      return { externalId, permalink: null };
    },
  };
}
