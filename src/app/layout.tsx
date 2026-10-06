import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { authMode } from "@/lib/auth-config";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: { default: "Plotline", template: "%s · Plotline" },
  description: "Plan, create, approve, publish and grow social media from one workspace.",
};

// Clerk's components in the app's look: ink primary, warm surfaces, DM Sans.
const clerkAppearance = {
  variables: {
    colorPrimary: "#17181C",
    colorText: "#17181C",
    colorTextSecondary: "#5B5E66",
    colorBackground: "#FFFFFF",
    colorInputBackground: "#FFFFFF",
    borderRadius: "10px",
    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const page = (
    <html lang="en-IN" className={`${dmSans.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
  if (authMode() !== "clerk") return page;
  return (
    <ClerkProvider appearance={clerkAppearance} signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/sign-in">
      {page}
    </ClerkProvider>
  );
}
