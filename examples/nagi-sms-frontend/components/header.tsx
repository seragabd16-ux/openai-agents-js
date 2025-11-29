'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';

export function Header() {
  const pathname = usePathname();
  const isUnsubscribe = pathname?.startsWith('/unsubscribe');

  return (
    <header className="border-b border-gray-800 bg-surface/70 backdrop-blur">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-semibold text-primary">
          NAGI-SMS
        </Link>
        <nav className="space-x-4 text-sm text-gray-400">
          <Link
            className={cn(
              'hover:text-white',
              isUnsubscribe && 'text-white font-medium',
            )}
            href="/unsubscribe"
          >
            Unsubscribe
          </Link>
          <a
            className="hover:text-white"
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </a>
        </nav>
      </div>
    </header>
  );
}
