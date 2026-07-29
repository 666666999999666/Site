import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ThemeToggle } from "../components/layout/ThemeToggle"
import { ThemeProvider } from "../components/theme/ThemeProvider"

test("shared theme toggle renders without a locale provider", () => {
  const markup = renderToStaticMarkup(
    createElement(
      ThemeProvider,
      null,
      createElement(ThemeToggle)
    )
  )

  assert.match(markup, /aria-label="切换深色模式"/)
})
