import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getPublicSettings } from "@/lib/settings";

export default async function LocaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  const settings = await getPublicSettings();

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="min-h-screen flex flex-col">
        <Header siteName={settings.owner_name} githubUrl={settings.about_github} />
        <main className="flex-1">{children}</main>
        <Footer ownerName={settings.owner_name} />
      </div>
    </NextIntlClientProvider>
  );
}
