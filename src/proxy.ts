import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { authMode } from "@/lib/auth-config";

// Makes the Clerk session available to pages and Server Actions. Access is checked
// where the data is read (src/server/tenancy.ts), not by matching paths here, so the
// public review page stays public and no route is protected by accident of its URL.
export default authMode() === "clerk" ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Everything except Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
