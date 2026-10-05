import { describe, expect, it } from "vitest";
import { createGraph, GraphError, type PublishRequest } from "./graph";

interface Call {
  method: string;
  url: URL;
  body: URLSearchParams;
  headers: Record<string, string>;
}

/** Answers Graph calls from a list of [method, path fragment, response] in order of matching. */
function scripted(routes: [string, string, unknown][]) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: new URLSearchParams(String(init?.body ?? "")), headers: (init?.headers ?? {}) as Record<string, string> });
    const i = routes.findIndex(([m, frag]) => m === method && (url.pathname + url.search).includes(frag));
    if (i < 0) return new Response(JSON.stringify({ error: { message: `unexpected ${method} ${url.pathname}`, code: 1 } }), { status: 500 });
    const [, , body] = routes.splice(i, 1)[0];
    const status = (body as { error?: unknown }).error ? 400 : 200;
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const base: PublishRequest = {
  kind: "ig_post",
  targetId: "ig1",
  token: "tok",
  caption: "Hello",
  firstComment: "",
  shareToFeed: true,
  media: [{ type: "image", url: "https://app.test/m/1.jpg" }],
  containerId: null,
};

const steps = () => {
  const log: string[] = [];
  return { log, step: async (s: string, id?: string) => void log.push(id ? `${s}:${id}` : s) };
};

describe("publishing through the Graph API", () => {
  it("Instagram image: container, publish, link, first comment", async () => {
    const { fetchImpl, calls } = scripted([
      ["POST", "/ig1/media_publish", { id: "m1" }],
      ["POST", "/ig1/media", { id: "c1" }],
      ["GET", "/c1", { status_code: "FINISHED" }],
      ["GET", "/m1", { permalink: "https://www.instagram.com/p/abc/" }],
      ["POST", "/m1/comments", { id: "cm1" }],
    ]);
    const { log, step } = steps();
    const r = await createGraph({ appId: "a", appSecret: "b" }, fetchImpl).publish({ ...base, firstComment: "#cafe #delhi" }, step);
    expect(r).toEqual({ externalId: "m1", permalink: "https://www.instagram.com/p/abc/", firstCommentFailed: false });
    expect(log).toEqual(["container:c1", "publish_sent"]);
    expect(calls[0].body.get("image_url")).toBe("https://app.test/m/1.jpg");
    expect(calls[0].body.get("caption")).toBe("Hello");
    expect(calls.find((c) => c.url.pathname.endsWith("media_publish"))!.body.get("creation_id")).toBe("c1");
  });

  it("Instagram Reel waits for processing and reuses an earlier container", async () => {
    const { fetchImpl, calls } = scripted([
      ["GET", "/c9", { status_code: "IN_PROGRESS" }],
      ["GET", "/c9", { status_code: "FINISHED" }],
      ["POST", "/ig1/media_publish", { id: "m9" }],
      ["GET", "/m9", { permalink: "https://www.instagram.com/reel/x/" }],
    ]);
    const r = await createGraph({ appId: "a", appSecret: "b" }, fetchImpl, { sleep: async () => {} }).publish(
      { ...base, kind: "ig_reel", media: [{ type: "video", url: "https://app.test/v.mp4" }], containerId: "c9" },
      steps().step,
    );
    expect(r.externalId).toBe("m9");
    expect(calls.some((c) => c.method === "POST" && c.url.pathname.endsWith("/ig1/media"))).toBe(false);
  });

  it("reports Instagram's processing error as permanent", async () => {
    const { fetchImpl } = scripted([
      ["POST", "/ig1/media", { id: "c2" }],
      ["GET", "/c2", { status_code: "ERROR", status: "Unsupported aspect ratio" }],
    ]);
    const err = await createGraph({ appId: "a", appSecret: "b" }, fetchImpl).publish(base, steps().step).catch((e) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect(err.message).toMatch(/Unsupported aspect ratio/);
    expect(err.temporary).toBe(false);
  });

  it("Facebook post with several photos uploads them unpublished, then posts once", async () => {
    const { fetchImpl, calls } = scripted([
      ["POST", "/p1/photos", { id: "ph1" }],
      ["POST", "/p1/photos", { id: "ph2" }],
      ["POST", "/p1/feed", { id: "p1_99" }],
      ["GET", "/p1_99", { permalink_url: "https://www.facebook.com/cafe/posts/99" }],
    ]);
    const { log, step } = steps();
    const r = await createGraph({ appId: "a", appSecret: "b" }, fetchImpl).publish(
      { ...base, kind: "fb_post", targetId: "p1", media: [{ type: "image", url: "https://app.test/1.jpg" }, { type: "image", url: "https://app.test/2.jpg" }] },
      step,
    );
    expect(r).toEqual({ externalId: "p1_99", permalink: "https://www.facebook.com/cafe/posts/99" });
    expect(calls[0].body.get("published")).toBe("false");
    const feed = calls.find((c) => c.url.pathname.endsWith("/feed"))!;
    expect(feed.body.get("attached_media[1]")).toBe('{"media_fbid":"ph2"}');
    expect(log).toEqual(["publish_sent"]);
  });

  it("Facebook Reel: start, upload from our URL, finish", async () => {
    const { fetchImpl, calls } = scripted([
      ["POST", "/p1/video_reels", { video_id: "v1", upload_url: "https://rupload.facebook.com/video-upload/v26.0/v1" }],
      ["POST", "/video-upload/", { success: true }],
      ["POST", "/p1/video_reels", { success: true }],
      ["GET", "/v1", { permalink_url: "/reel/v1" }],
    ]);
    const r = await createGraph({ appId: "a", appSecret: "b" }, fetchImpl).publish(
      { ...base, kind: "fb_reel", targetId: "p1", media: [{ type: "video", url: "https://app.test/v.mp4" }] },
      steps().step,
    );
    expect(r).toEqual({ externalId: "v1", permalink: "https://www.facebook.com/reel/v1" });
    expect(calls[1].headers.file_url).toBe("https://app.test/v.mp4");
    expect(calls[2].body.get("video_state")).toBe("PUBLISHED");
  });
});
