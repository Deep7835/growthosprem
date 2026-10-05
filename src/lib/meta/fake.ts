// A stand-in for Meta used in development until META_APP_ID is set (or with META_FAKE=1).
// The whole flow runs — login, page picker, history import, syncs, token health — on
// generated data. Accounts connected this way are marked as sample data.
import { generateDemoHistory } from "@/db/demo-history";
import type { Graph, ImportedPost, PageCandidate } from "./graph";

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

function postsFor(id: string, now: Date) {
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
  };
}
