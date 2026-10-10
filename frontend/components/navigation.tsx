import Image from "next/image";
import Link from "next/link";
import { sourceUrl } from "@/lib/demo";

export function Navigation() {
  return (
    <header className="site-header container">
      <a className="wordmark" href="#top" aria-label="Mentis home">
        <Image
          src="/images/mentis-logo.png"
          alt=""
          width={32}
          height={32}
          priority
        />
        <span>mentis</span>
      </a>
      <nav className="landing-nav" aria-label="Main navigation">
        <Link href="/sign-in">Sign in</Link>
        <a href={sourceUrl} className="github-link" aria-label="GitHub">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.64.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.58 9.58 0 0 1 12 6.83c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.75c0 .26.18.57.69.48A10 10 0 0 0 12 2Z" />
          </svg>
        </a>
      </nav>
    </header>
  );
}
