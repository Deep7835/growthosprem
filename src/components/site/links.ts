// The site is also published on its own as static pages (site/), where the app isn't on the
// same domain; site/next.config.ts points these at it, or at /start until the app is hosted.
export const SIGN_IN = process.env.SITE_SIGN_IN_URL ?? "/sign-in";
export const SIGN_UP = process.env.SITE_SIGN_UP_URL ?? "/sign-up";
