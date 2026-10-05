import { describe, expect, it, vi } from "vitest";
import { createGraph, GraphError, facebookFormat, instagramFormat } from "./graph";

function fakeFetch(routes: Record<string, unknown | ((url: URL) => unknown)>) {
  const calls: URL[] = [];
  const fn = vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.pathname.endsWith(k) || url.toString().includes(k));
    const route = key ? routes[key] : { error: { message: "not found", code: 803 } };
    const body = typeof route === "function" ? (route as (u: URL) => unknown)(url) : route;
    const status = (body as { error?: unknown }).error ? 400 : 200;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const config = { appId: "123", appSecret: "shh" };

describe("Meta Graph client", () => {
  it("builds the login URL with state and the publishing scopes", () => {
    const url = new URL(createGraph(config).loginUrl("abc", "https://app.test/api/meta/callback"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("scope")).toContain("instagram_content_publish");
  });

  it("swaps the code for a long-lived token", async () => {
    const { fn, calls } = fakeFetch({
      "oauth/access_token": (u: URL) => ({ access_token: u.searchParams.get("grant_type") ? "long" : "short" }),
    });
    expect(await createGraph(config, fn).exchangeCode("c0de", "https://app.test/cb")).toEqual({ userToken: "long" });
    expect(calls[1].searchParams.get("fb_exchange_token")).toBe("short");
  });

  it("lists Pages with their linked Instagram account", async () => {
    const { fn } = fakeFetch({
      "me/accounts": {
        data: [
          { id: "p1", name: "Cafe", access_token: "pt1", followers_count: 10, instagram_business_account: { id: "ig1", username: "cafe", followers_count: 99 } },
          { id: "p2", name: "Realty", access_token: "pt2" },
        ],
      },
    });
    const pages = await createGraph(config, fn).listPages("user");
    expect(pages[0]).toMatchObject({ pageId: "p1", pageToken: "pt1", instagram: { id: "ig1", username: "cafe", followers: 99 } });
    expect(pages[1].instagram).toBeNull();
  });

  it("pages through Instagram media and stops at the start date", async () => {
    const since = new Date("2026-07-01T00:00:00Z");
    const { fn, calls } = fakeFetch({
      "page=2": { data: [{ id: "m3", media_type: "IMAGE", timestamp: "2026-06-20T10:00:00+0000" }], paging: { next: "https://graph.facebook.com/v26.0/x?page=3" } },
      "ig1/media": {
        data: [
          { id: "m1", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-09-01T10:00:00+0000", caption: "Hi" },
          { id: "m2", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", timestamp: "2026-08-01T10:00:00+0000" },
        ],
        paging: { next: "https://graph.facebook.com/v26.0/ig1/media?page=2" },
      },
    });
    const posts = await createGraph(config, fn).listPosts("instagram", "ig1", "tok", since);
    expect(posts.map((p) => [p.externalId, p.format])).toEqual([
      ["m1", "reel"],
      ["m2", "carousel"],
    ]);
    expect(calls).toHaveLength(2);
  });

  it("falls back to fewer insight metrics when a media type lacks some", async () => {
    const { fn } = fakeFetch({
      "m1/insights": (u: URL) =>
        u.searchParams.get("metric")!.includes("views")
          ? { error: { message: "metric not supported", code: 100 } }
          : { data: [{ name: "reach", values: [{ value: 400 }] }, { name: "saved", values: [{ value: 9 }] }, { name: "likes", values: [{ value: 30 }] }] },
    });
    const n = await createGraph(config, fn).postNumbers("instagram", { externalId: "m1", publishedAt: new Date(), format: "post", caption: "", permalink: null, raw: { comments_count: 4 } }, "tok");
    expect(n).toEqual({ reach: 400, views: 0, likes: 30, comments: 4, saves: 9, shares: 0 });
  });

  it("reads Facebook numbers from the post list", async () => {
    const raw = {
      shares: { count: 3 },
      reactions: { summary: { total_count: 50 } },
      comments: { summary: { total_count: 7 } },
      insights: { data: [{ name: "post_total_media_view_unique", values: [{ value: 900 }] }, { name: "post_media_view", values: [{ value: 1200 }] }] },
    };
    const n = await createGraph(config, fakeFetch({}).fn).postNumbers("facebook", { externalId: "p_1", publishedAt: new Date(), format: "post", caption: "", permalink: null, raw }, "tok");
    expect(n).toEqual({ reach: 900, views: 1200, likes: 50, comments: 7, saves: 0, shares: 3 });
  });

  it("tells a revoked token apart from a rate limit", async () => {
    const { fn } = fakeFetch({ ig1: { error: { message: "Error validating access token", code: 190 } } });
    const err = await createGraph(config, fn).profile("instagram", "ig1", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err.needsReconnect).toBe(true);
    expect(new GraphError("slow down", 4, 400).temporary).toBe(true);
    expect(new GraphError("slow down", 4, 400).needsReconnect).toBe(false);
  });

  it("uses the earlier of token and data-access expiry", async () => {
    const { fn } = fakeFetch({ debug_token: { data: { is_valid: true, expires_at: 0, data_access_expires_at: 1_800_000_000, scopes: ["pages_show_list"] } } });
    const info = await createGraph(config, fn).inspectToken("tok");
    expect(info.expiresAt?.getTime()).toBe(1_800_000_000_000);
  });

  it("maps formats", () => {
    expect(instagramFormat("VIDEO", "REELS")).toBe("reel");
    expect(instagramFormat("IMAGE", "FEED")).toBe("post");
    expect(facebookFormat("video_inline")).toBe("reel");
    expect(facebookFormat("album")).toBe("carousel");
  });
});
