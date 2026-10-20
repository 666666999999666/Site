import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { routing } from '@/i18n/routing';
import { getPublicSettings } from "@/lib/settings";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== routing.defaultLocale) notFound();

  const messages = await getMessages();
  const settings = await getPublicSettings();
  const t = await getTranslations("nav");

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="min-h-screen flex flex-col">
        <a href="#main-content" className="skip-link">{t("skipToContent")}</a>
        <Header siteName={settings.owner_name} githubUrl={settings.about_github} />
        <main id="main-content" tabIndex={-1} className="flex-1 scroll-mt-20 focus:outline-none">{children}</main>
        <Footer ownerName={settings.owner_name} />
      </div>
    </NextIntlClientProvider>
  );
}
