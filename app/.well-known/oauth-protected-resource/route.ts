import { metadataResponse, protectedResourceMetadata } from "@/lib/auth/oauth-metadata"

export function GET() {
  return metadataResponse(protectedResourceMetadata())
}
