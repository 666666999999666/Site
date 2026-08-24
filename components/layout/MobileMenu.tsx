'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('nav');
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

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    menu?.querySelector<HTMLElement>('a')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !menu) return;
      const links = [...menu.querySelectorAll<HTMLElement>('a')];
      if (links.length === 0) return;
      const first = links[0];
      const last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        aria-expanded={open}
        aria-controls="mobile-site-navigation"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {open && (
        <div
          ref={menuRef}
          id="mobile-site-navigation"
          className="absolute left-0 right-0 top-14 space-y-1 border-t border-border/50 bg-background/95 p-4 backdrop-blur-md"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
