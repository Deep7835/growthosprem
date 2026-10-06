import path from "node:path";
import type { NextConfig } from "next";

// The marketing site on its own, as static pages for Cloudflare (wrangler.jsonc at the repo
// root builds and uploads site/out). It reuses src/components/site; the app itself needs a
// Node server and isn't part of this build. Set PLOTLINE_APP_URL in the Cloudflare build
// variables once the app is hosted, and Sign in / Start free go there instead of /start.
const app = process.env.PLOTLINE_APP_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  output: "export",
  turbopack: { root: path.join(__dirname, "..") },
  env: {
    SITE_SIGN_IN_URL: app ? `${app}/sign-in` : "/start",
    SITE_SIGN_UP_URL: app ? `${app}/sign-up` : "/start",
  },
};

export default nextConfig;
