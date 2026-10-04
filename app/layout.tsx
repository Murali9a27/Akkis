import type { Metadata } from "next";
import type { ReactNode } from "react";
import { publicEnv } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_SITE_URL),
  title: {
    default: "Akki's Healthy Baking – Guilt-Free Goodness | Hinjawadi Pune",
    template: "%s | Akki's Healthy Baking",
  },
  description:
    "Akkis Healthy Baking offers guilt-free cakes, pastries, loaves and desserts made with whole wheat, ragi and jaggery. No maida, no refined sugar. Home delivery in Hinjawadi, Wakad, Baner, Pune.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
