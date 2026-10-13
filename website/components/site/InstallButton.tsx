import Link from 'next/link';
import { CHROME_WEB_STORE_URL } from '@/lib/distribution';

/**
 * The site's one install call-to-action. Before the Chrome Web Store listing is
 * live it leads to the install guide; afterwards it goes straight to the store.
 */
export function InstallButton({ className = 'btn btn-primary', label }: { className?: string; label?: string }) {
  if (CHROME_WEB_STORE_URL) {
    return (
      <a href={CHROME_WEB_STORE_URL} target="_blank" rel="noopener noreferrer" className={className}>
        {label ?? 'Add to Chrome — free'}
      </a>
    );
  }
  return (
    <Link href="/docs/getting-started" className={className}>
      {label ?? 'Install for Chrome — free'}
    </Link>
  );
}
