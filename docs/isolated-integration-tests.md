# Disposable PostgreSQL integration tests

These helpers require PostgreSQL 16 binaries and installed Node dependencies.
They do not install PostgreSQL, read production credentials, reuse a database
cluster, or depend on a database server from another terminal/session.

```sh
npm ci
npx prisma generate
PG_BIN_DIR=/path/to/postgres16/bin \
  bash scripts/with-isolated-postgres.sh \
  node scripts/run-isolated-integrations.mjs
```

If PostgreSQL 16 is already in `PATH`, `PG_BIN_DIR` is optional.
Use a non-root operating-system user, as required by `initdb`.
The wrapper initializes a new temporary cluster, binds only `127.0.0.1` on a
dynamically selected port, verifies the server identity, and creates separate
test databases. It clears inherited PostgreSQL connection environment variables.
The server and tests run in one shell lifecycle, which also works in execution
environments where each command gets a separate network namespace.
An exit trap stops the server and removes only this newly created cluster.
The local disposable server uses trust authentication; never expose its port
outside the loopback interface.

Choose a subset by adding suite names:

```sh
PG_BIN_DIR=/path/to/postgres16/bin \
  bash scripts/with-isolated-postgres.sh \
  node scripts/run-isolated-integrations.mjs daily questions gateway oauth
```

Available suites: `daily`, `questions`, `inbox`, `blog`, `gateway`, `oauth`, `domain`.
Each suite applies current migrations before running. OAuth instead validates
historical upgrades and then applies all later migrations itself.
The runner attempts all selected suites and exits nonzero if any fails.

The wrapper can also run browser workflows in the same isolated lifecycle:

```sh
PG_BIN_DIR=/path/to/postgres16/bin \
  bash scripts/with-isolated-postgres.sh npm run test:documents
```

It exports `DOCUMENT_TEST_DATABASE_URL`, `QUESTION_TEST_DATABASE_URL`, and
`DAILY_TEST_DATABASE_URL` with separate disposable schemas. Questions and Daily
browser workflows require migration deployment against their respective URL
before Playwright starts. Browser installation is a separate prerequisite.
Do not substitute a production URL to work around a missing prerequisite.

Run full-app browser suites sequentially to avoid competing compilation and
development-server reloads. These fixtures use loopback HTTP, not a production
deployment: production's HTTPS requirement must not be weakened for tests.
`PLAYWRIGHT_EXECUTABLE_PATH` optionally selects an installed
Chromium executable for Documents and Questions without requiring branded Chrome.

If the execution environment does not support Unix-domain sockets, run TypeScript
entrypoints with `node --import tsx` rather than the `tsx` CLI (which creates an
IPC socket). For example, the Documents command can be expanded as:

```sh
PG_BIN_DIR=/path/to/postgres16/bin \
  bash scripts/with-isolated-postgres.sh bash -c \
  'node --import tsx tests/prepare-document-workflow.ts &&
   node node_modules/@playwright/test/cli.js test --config=playwright.documents.config.ts'
```
