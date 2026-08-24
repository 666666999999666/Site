import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CatButton } from "@/components/auth/CatButton";
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

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="min-h-screen flex flex-col">
        <Header siteName={settings.owner_name} githubUrl={settings.about_github} />
        <main className="flex-1 pb-20 sm:pb-0">{children}</main>
        <Footer ownerName={settings.owner_name} />
        <CatButton />
      </div>
    </NextIntlClientProvider>
  );
}
