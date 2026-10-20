# Editor and public-reader browser acceptance

Run from the repository root:

```sh
npm ci
npx prisma generate
npx playwright install --with-deps chromium webkit
npm run test:editor
```

The Playwright web server builds this isolated Next application with the production
compiler, then runs `next start`. All routes are compiled before the browser suite
begins. Do not use a cold development server for acceptance: development HMR can
reload a page during navigation and confound the behavior under test.

Both desktop Chromium and WebKit are included. The touch-panning regression uses
Chromium's CDP input protocol and therefore reports an explicit capability skip
under WebKit. It must execute under Chromium. No other test is excluded by engine.

For a supported custom Chromium installation, `PLAYWRIGHT_EXECUTABLE_PATH` selects
its executable. The default uses the Chromium bundled for the installed Playwright
version. `PLAYWRIGHT_REUSE_SERVER=1` is only for an already-built production server;
never point it at a development server for acceptance. Rebuild after source changes.

This harness uses synthetic fixtures and mocked APIs. Passing here does not replace
the real-database Documents, Questions, or Daily workflow suites.
