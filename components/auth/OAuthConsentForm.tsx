"use client"

import { useState } from "react"
import { Check, X } from "lucide-react"
import { authClient } from "@/lib/auth/client"
import { Button } from "@/components/ui/button"

export function OAuthConsentForm({ oauthQuery }: { oauthQuery: string }) {
  const [pending, setPending] = useState<"approve" | "reject" | null>(null)
  const [error, setError] = useState("")

  async function decide(accept: boolean) {
    setPending(accept ? "approve" : "reject")
    setError("")
    try {
      const result = await authClient.oauth2.consent({ accept, oauth_query: oauthQuery })
      if (result.error) throw new Error(result.error.message || "授权请求处理失败")
      if (result.data?.url) window.location.assign(result.data.url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "授权请求处理失败")
      setPending(null)
    }
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => decide(false)}
          disabled={pending !== null}
        >
          <X />
          拒绝
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={() => decide(true)}
          disabled={pending !== null}
        >
          <Check />
          {pending === "approve" ? "授权中..." : "允许连接"}
        </Button>
      </div>
    </div>
  )
}
