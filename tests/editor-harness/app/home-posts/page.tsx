import { NextIntlClientProvider } from "next-intl"
import { RecentPosts } from "@/components/home/RecentPosts"
import { toHomePost } from "@/lib/home-posts"
import { homePostRenderingFixtures } from "@/tests/fixtures/home-posts"
import zh from "@/messages/zh.json"

export default async function HomePostsHarness({ searchParams }: { searchParams: Promise<{ empty?: string }> }) {
  const { empty } = await searchParams
  return <NextIntlClientProvider locale="zh" timeZone="Asia/Shanghai" messages={zh} formats={{}} now={new Date("2026-10-01T00:00:00Z")}>
    <main><RecentPosts posts={empty ? [] : homePostRenderingFixtures.map(toHomePost)} /></main>
  </NextIntlClientProvider>
}
