'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';
import { BarChart3, CirclePlus, Inbox, PhoneOff } from 'lucide-react';

const links = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/campaigns/new', label: 'New Campaign', icon: CirclePlus },
  { href: '/campaigns', label: 'Campaigns', icon: Inbox },
  { href: '/unsubscribe', label: 'Unsubscribe', icon: PhoneOff },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-surface border-r border-gray-800 hidden md:block">
      <div className="p-4 text-sm uppercase tracking-wide text-gray-400">
        Navigation
      </div>
      <nav className="space-y-1 px-3">
        {links.map((link) => {
          const active =
            pathname === link.href || pathname?.startsWith(link.href + '/');
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-gray-300 hover:bg-gray-800 hover:text-white',
                active && 'bg-gray-800 text-white',
              )}
            >
              <Icon size={18} />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
