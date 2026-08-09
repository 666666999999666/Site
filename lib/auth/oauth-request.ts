import { auth } from "./better-auth"
import { oauthIssuer, oauthSiteOrigin } from "./oauth-config"

export type OAuthPageSearchParams = Record<string, string | string[] | undefined>

export function serializeOAuthSearchParams(values: OAuthPageSearchParams): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
    else if (value !== undefined) params.set(key, value)
  }
  return params.toString()
}

export function firstOAuthParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export async function validateOAuthPageRequest(values: OAuthPageSearchParams) {
  const oauthQuery = serializeOAuthSearchParams(values)
  const clientId = firstOAuthParam(values.client_id)
  if (!oauthQuery || !clientId) return null
  try {
    const response = await auth.handler(new Request(`${oauthIssuer()}/oauth2/public-client-prelogin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: oauthSiteOrigin(),
      },
      body: JSON.stringify({ client_id: clientId, oauth_query: oauthQuery }),
    }))
    if (!response.ok) return null
    const client = await response.json() as {
      client_id?: string
      clientId?: string
      client_name?: string
      name?: string
    }
    return { oauthQuery, client }
  } catch {
    return null
  }
}
