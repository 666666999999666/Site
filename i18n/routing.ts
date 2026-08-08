import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh', 'en'],
  defaultLocale: 'zh',
  localeCookie: {
    name: 'NEXT_LOCALE',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
});
