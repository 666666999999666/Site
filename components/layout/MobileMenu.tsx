'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();

  const links = [
    { href: '/', label: t('home') },
    { href: '/blog', label: t('blog') },
    { href: '/projects', label: t('projects') },
    { href: '/about', label: t('about') },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '';
    return pathname.startsWith(href);
  };

  return (
    <div className="sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-14 border-t border-border/50 bg-background/95 backdrop-blur-md p-4 space-y-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              locale={locale}
              onClick={() => setOpen(false)}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
