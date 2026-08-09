"use client"

import { useState } from "react"
import { KeyRound } from "lucide-react"
import { authClient } from "@/lib/auth/client"
import { apiRequest, jsonRequest } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function OAuthSignInForm({ oauthQuery }: { oauthQuery: string }) {
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    try {
      await apiRequest("/api/auth/login", jsonRequest("POST", { password }))
      const result = await authClient.oauth2.continue({
        postLogin: true,
        oauth_query: oauthQuery,
      })
      if (result.error) throw new Error(result.error.message || "授权流程无法继续")
      if (result.data?.url) window.location.assign(result.data.url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败")
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <input
        type="text"
        name="username"
        value="admin"
        autoComplete="username"
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
      <div className="space-y-2">
        <Label htmlFor="oauth-admin-password">管理员密码</Label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="oauth-admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="pl-10"
            autoFocus
            required
          />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending || !password}>
        {pending ? "验证中..." : "继续授权"}
      </Button>
    </form>
  )
}
