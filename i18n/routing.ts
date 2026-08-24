import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['zh'],
  defaultLocale: 'zh',
  localePrefix: 'always',
  localeCookie: false,
  localeDetection: false,
  alternateLinks: false,
});
