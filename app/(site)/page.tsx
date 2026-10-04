import type { Metadata } from "next";
import styles from "./page.module.css";

// Placeholder until Phase 5 ports the real home page. Kept out of search indexes
// so a preview (or an accidental merge) can never replace the live listing.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function HomePage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Akki&apos;s Healthy Baking</h1>
      <p>The new site is being built. The current site remains live until cutover.</p>
    </main>
  );
}
