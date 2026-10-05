// Facebook Pages and Instagram (Instagram API with Facebook Login) over the Graph API.
// No Next.js imports and an injectable fetch, so the worker and tests can use it directly.
import type { Format } from "@/lib/analytics/audit";

export const GRAPH_VERSION = "v26.0";

/** Facebook Login scopes for reading history and insights, and for publishing (next milestone). */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
  "instagram_content_publish",
  "business_management",
];

export class GraphError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly status: number,
    readonly subcode: number | null = null,
  ) {
    super(message);
    this.name = "GraphError";
  }

  /** The token was revoked, expired or lost a permission: only the person can fix it. */
  get needsReconnect() {
    return this.code === 190 || this.code === 102 || this.code === 10 || (this.code !== null && this.code >= 200 && this.code < 300);
  }

  /** Worth retrying later: rate limits, temporary outages. */
  get temporary() {
    return this.status >= 500 || [1, 2, 4, 17, 32, 341, 613].includes(this.code ?? -1);
  }
}

export interface PageCandidate {
  pageId: string;
  pageName: string;
  pageToken: string;
  picture: string | null;
  followers: number | null;
  instagram: { id: string; username: string; picture: string | null; followers: number | null } | null;
}

export interface TokenInfo {
  valid: boolean;
  /** The earlier of the token's own expiry and Meta's 90-day data-access expiry; null if neither. */
  expiresAt: Date | null;
  scopes: string[];
}

export interface ImportedPost {
  externalId: string;
  publishedAt: Date;
  format: Format;
  caption: string;
  permalink: string | null;
}

export interface PostNumbers {
  reach: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export interface Graph {
  readonly fake: boolean;
  loginUrl(state: string, redirectUri: string): string;
  /** Code → long-lived user token. */
  exchangeCode(code: string, redirectUri: string): Promise<{ userToken: string }>;
  listPages(userToken: string): Promise<PageCandidate[]>;
  inspectToken(token: string): Promise<TokenInfo>;
  profile(platform: "instagram" | "facebook", id: string, token: string): Promise<{ handle: string; name: string; followers: number | null }>;
  /** Posts published since `since`, newest first. */
  listPosts(platform: "instagram" | "facebook", id: string, token: string, since: Date): Promise<(ImportedPost & { raw?: unknown })[]>;
  postNumbers(platform: "instagram" | "facebook", post: ImportedPost & { raw?: unknown }, token: string): Promise<PostNumbers>;
  /**
   * Daily follower totals before the account was connected. Facebook Pages report them;
   * Instagram only reports new followers per day, so its history starts at connection.
   */
  followerHistory(platform: "instagram" | "facebook", id: string, token: string, since: Date): Promise<{ at: Date; followers: number }[]>;
}

type Fetch = typeof fetch;

interface Paged<T> {
  data: T[];
  paging?: { next?: string };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function instagramFormat(mediaType: string, productType?: string): Format {
  if (productType === "REELS") return "reel";
  if (productType === "STORY") return "story";
  if (mediaType === "CAROUSEL_ALBUM") return "carousel";
  return "post";
}

export function facebookFormat(attachmentType?: string): Format {
  if (!attachmentType) return "post";
  if (attachmentType.includes("video") || attachmentType === "reel") return "reel";
  if (attachmentType === "album") return "carousel";
  return "post";
}

/** Insight values come as [{ name, values: [{ value }] }] or [{ name, total_value: { value } }]. */
export function insightValues(data: { name: string; values?: { value: unknown }[]; total_value?: { value: unknown } }[] | undefined) {
  const out: Record<string, number> = {};
  for (const m of data ?? []) out[m.name] = num(m.total_value?.value ?? m.values?.[0]?.value);
  return out;
}

export function createGraph(config: { appId: string; appSecret: string }, fetchImpl: Fetch = fetch): Graph {
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`;

  async function get<T>(pathOrUrl: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(pathOrUrl.startsWith("https://") ? pathOrUrl : `${base}/${pathOrUrl.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } } & T;
    if (!res.ok || body.error) {
      const e = body.error ?? {};
      throw new GraphError(e.message ?? `Meta returned ${res.status}.`, e.code ?? null, res.status, e.error_subcode ?? null);
    }
    return body;
  }

  async function all<T>(path: string, params: Record<string, string>, keepGoing: (page: T[]) => boolean, maxPages = 20): Promise<T[]> {
    const out: T[] = [];
    let page = await get<Paged<T>>(path, params);
    for (let i = 0; ; i++) {
      out.push(...page.data);
      if (!page.paging?.next || i + 1 >= maxPages || !keepGoing(page.data)) break;
      page = await get<Paged<T>>(page.paging.next);
    }
    return out;
  }

  return {
    fake: false,

    loginUrl(state, redirectUri) {
      const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
      url.searchParams.set("client_id", config.appId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", META_SCOPES.join(","));
      return url.toString();
    },

    async exchangeCode(code, redirectUri) {
      const short = await get<{ access_token: string }>("oauth/access_token", {
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: redirectUri,
        code,
      });
      // Page tokens fetched with a long-lived user token do not expire on their own.
      const long = await get<{ access_token: string }>("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: short.access_token,
      });
      return { userToken: long.access_token };
    },

    async listPages(userToken) {
      type Row = {
        id: string;
        name: string;
        access_token: string;
        followers_count?: number;
        picture?: { data?: { url?: string } };
        instagram_business_account?: { id: string; username?: string; profile_picture_url?: string; followers_count?: number };
      };
      const rows = await all<Row>(
        "me/accounts",
        {
          access_token: userToken,
          fields: "id,name,access_token,followers_count,picture{url},instagram_business_account{id,username,profile_picture_url,followers_count}",
          limit: "100",
        },
        () => true,
        5,
      );
      return rows.map((r) => ({
        pageId: r.id,
        pageName: r.name,
        pageToken: r.access_token,
        picture: r.picture?.data?.url ?? null,
        followers: r.followers_count ?? null,
        instagram: r.instagram_business_account
          ? {
              id: r.instagram_business_account.id,
              username: r.instagram_business_account.username ?? r.instagram_business_account.id,
              picture: r.instagram_business_account.profile_picture_url ?? null,
              followers: r.instagram_business_account.followers_count ?? null,
            }
          : null,
      }));
    },

    async inspectToken(token) {
      const { data } = await get<{ data: { is_valid: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[] } }>("debug_token", {
        input_token: token,
        access_token: `${config.appId}|${config.appSecret}`,
      });
      const times = [data.expires_at, data.data_access_expires_at].filter((t): t is number => Boolean(t)).map((t) => t * 1000);
      return { valid: data.is_valid, expiresAt: times.length ? new Date(Math.min(...times)) : null, scopes: data.scopes ?? [] };
    },

    async profile(platform, id, token) {
      if (platform === "instagram") {
        const r = await get<{ username: string; name?: string; followers_count?: number }>(id, { access_token: token, fields: "username,name,followers_count" });
        return { handle: `@${r.username}`, name: r.name ?? r.username, followers: r.followers_count ?? null };
      }
      const r = await get<{ name: string; followers_count?: number; fan_count?: number }>(id, { access_token: token, fields: "name,followers_count,fan_count" });
      return { handle: r.name, name: r.name, followers: r.followers_count ?? r.fan_count ?? null };
    },

    async listPosts(platform, id, token, since) {
      const older = (t: string) => new Date(t) < since;
      if (platform === "instagram") {
        type Media = { id: string; caption?: string; media_type: string; media_product_type?: string; timestamp: string; permalink?: string; like_count?: number; comments_count?: number };
        const rows = await all<Media>(
          `${id}/media`,
          { access_token: token, fields: "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count", limit: "50" },
          (page) => !page.some((m) => older(m.timestamp)),
        );
        return rows
          .filter((m) => !older(m.timestamp))
          .map((m) => ({
            externalId: m.id,
            publishedAt: new Date(m.timestamp),
            format: instagramFormat(m.media_type, m.media_product_type),
            caption: m.caption ?? "",
            permalink: m.permalink ?? null,
            raw: m,
          }));
      }
      type Post = {
        id: string;
        message?: string;
        created_time: string;
        permalink_url?: string;
        attachments?: { data?: { type?: string }[] };
        shares?: { count?: number };
        reactions?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
        insights?: { data: { name: string; values?: { value: unknown }[] }[] };
      };
      const rows = await all<Post>(
        `${id}/posts`,
        {
          access_token: token,
          since: String(Math.floor(since.getTime() / 1000)),
          fields:
            "id,message,created_time,permalink_url,attachments{type},shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),insights.metric(post_total_media_view_unique,post_media_view)",
          limit: "50",
        },
        (page) => !page.some((p) => older(p.created_time)),
      );
      return rows
        .filter((p) => !older(p.created_time))
        .map((p) => ({
          externalId: p.id,
          publishedAt: new Date(p.created_time),
          format: facebookFormat(p.attachments?.data?.[0]?.type),
          caption: p.message ?? "",
          permalink: p.permalink_url ?? null,
          raw: p,
        }));
    },

    async postNumbers(platform, post, token) {
      if (platform === "facebook") {
        // Facebook returns engagement and insights with the post list, so no extra call.
        const p = post.raw as {
          shares?: { count?: number };
          reactions?: { summary?: { total_count?: number } };
          comments?: { summary?: { total_count?: number } };
          insights?: { data: { name: string; values?: { value: unknown }[] }[] };
        };
        const ins = insightValues(p?.insights?.data);
        return {
          reach: ins.post_total_media_view_unique ?? 0,
          views: ins.post_media_view ?? 0,
          likes: num(p?.reactions?.summary?.total_count),
          comments: num(p?.comments?.summary?.total_count),
          saves: 0,
          shares: num(p?.shares?.count),
        };
      }
      const m = post.raw as { like_count?: number; comments_count?: number } | undefined;
      // Not every metric exists for every media type; fall back to the ones that do.
      let ins: Record<string, number> = {};
      for (const metrics of ["reach,views,saved,shares,likes,comments", "reach,saved,likes,comments", "reach"]) {
        try {
          const r = await get<{ data: { name: string; values?: { value: unknown }[]; total_value?: { value: unknown } }[] }>(`${post.externalId}/insights`, {
            access_token: token,
            metric: metrics,
          });
          ins = insightValues(r.data);
          break;
        } catch (e) {
          if (!(e instanceof GraphError) || e.code !== 100) throw e;
        }
      }
      return {
        reach: ins.reach ?? 0,
        views: ins.views ?? 0,
        likes: ins.likes ?? num(m?.like_count),
        comments: ins.comments ?? num(m?.comments_count),
        saves: ins.saved ?? 0,
        shares: ins.shares ?? 0,
      };
    },

    async followerHistory(platform, id, token, since) {
      if (platform !== "facebook") return [];
      const r = await get<{ data: { name: string; values?: { value: unknown; end_time: string }[] }[] }>(`${id}/insights`, {
        access_token: token,
        metric: "page_follows",
        period: "day",
        since: String(Math.floor(since.getTime() / 1000)),
        until: String(Math.floor(Date.now() / 1000)),
      });
      return (r.data[0]?.values ?? []).map((v) => ({ at: new Date(v.end_time), followers: num(v.value) }));
    },
  };
}
