import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { QuestionMarkdown } from "../components/questions/QuestionMarkdown"

test("rendered question answers use one typography scale", () => {
  const attempts = readFileSync("components/questions/QuestionAttemptList.tsx", "utf8")
  const markdown = readFileSync("components/questions/QuestionMarkdown.tsx", "utf8")
  assert.doesNotMatch(attempts, /QuestionMarkdown[^\n]*prose-sm/)
  assert.match(markdown, /remarkPreserveSoftBreaks/)
  const rendered = renderToStaticMarkup(createElement(QuestionMarkdown, { markdown: "首行\n第二行" }))
  assert.match(rendered, /首行<br\/>\n?第二行/)
})

test("multiline text fields preserve line breaks in their full displays", () => {
  for (const file of [
    "components/home/HomeAboutContact.tsx",
    "app/[locale]/blog/series/[slug]/page.tsx",
    "components/admin/DailyTopThree.tsx",
    "app/admin/daily/history/page.tsx",
  ]) {
    assert.match(readFileSync(file, "utf8"), /whitespace-pre-line/, file)
  }
})

test("the article form includes the public renderer preview", () => {
  const form = readFileSync("components/admin/PostForm.tsx", "utf8")
  const preview = readFileSync("components/admin/ArticlePublicationPreview.tsx", "utf8")
  assert.match(form, /<ArticlePublicationPreview content=/)
  assert.match(preview, /<PostContent content=\{content\}/)
})

test("the shared stylesheet includes KaTeX presentation styles", () => {
  assert.match(readFileSync("app/globals.css", "utf8"), /@import "katex\/dist\/katex\.min\.css"/)
})
