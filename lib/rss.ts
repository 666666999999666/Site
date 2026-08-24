export interface RssItem {
  title: string
  url: string
  description: string
  publishedAt: Date
  tags: string[]
}

export interface RssFeedInput {
  title: string
  description: string
  siteUrl: string
  feedUrl: string
  items: RssItem[]
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export function buildRssFeed(input: RssFeedInput): string {
  const items = input.items.map((item) => [
    "    <item>",
    `      <title>${escapeXml(item.title)}</title>`,
    `      <link>${escapeXml(item.url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(item.url)}</guid>`,
    `      <pubDate>${item.publishedAt.toUTCString()}</pubDate>`,
    `      <description>${escapeXml(item.description)}</description>`,
    ...item.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
    "    </item>",
  ].join("\n")).join("\n")

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(input.title)}</title>`,
    `    <link>${escapeXml(input.siteUrl)}</link>`,
    `    <description>${escapeXml(input.description)}</description>`,
    '    <language>zh-CN</language>',
    `    <atom:link href="${escapeXml(input.feedUrl)}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n")
}
