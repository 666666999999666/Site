import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { OAuthSignInForm } from "@/components/auth/OAuthSignInForm"
import { validateOAuthPageRequest, type OAuthPageSearchParams } from "@/lib/auth/oauth-request"

export const metadata: Metadata = { title: "Agent 授权登录" }

export default async function OAuthSignInPage({
  searchParams,
}: {
  searchParams: Promise<OAuthPageSearchParams>
}) {
  const request = await validateOAuthPageRequest(await searchParams)
  if (!request) notFound()

  return (
    <main className="min-h-screen bg-background px-5 py-12 sm:py-20">
      <section className="mx-auto w-full max-w-md border-t-4 border-foreground pt-8">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">QZ Blog OAuth</p>
            <h1 className="mt-1 text-2xl font-semibold">验证管理员身份</h1>
          </div>
        </div>
        <p className="mb-7 text-sm leading-6 text-muted-foreground">
          登录后将显示 Agent 名称、回调地址和申请权限，确认后才会建立连接。
        </p>
        <OAuthSignInForm oauthQuery={request.oauthQuery} />
      </section>
    </main>
  )
}
