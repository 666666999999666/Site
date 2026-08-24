import { headers } from "next/headers"

export async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined
  const json = JSON.stringify(data).replace(/</g, "\\u003c")

  return (
    <script
      nonce={nonce}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}
