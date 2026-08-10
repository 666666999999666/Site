import { oauthProvider } from "@better-auth/oauth-provider"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { jwt } from "better-auth/plugins"
import { prisma } from "../db"
import { hashPassword, verifyPassword } from "./password"
import {
  mcpResourceUrl,
  oauthIssuer,
  oauthSecret,
  oauthSiteOrigin,
  OAUTH_ACCESS_TOKEN_SECONDS,
  OAUTH_CODE_SECONDS,
  OAUTH_REFRESH_TOKEN_SECONDS,
  OAUTH_SCOPES,
  OAUTH_SESSION_SECONDS,
} from "./oauth-config"

const DISABLED_ACCOUNT_PATHS = [
  "/sign-up/email",
  "/forget-password",
  "/request-password-reset",
  "/reset-password",
  "/change-password",
  "/set-password",
  "/change-email",
  "/update-user",
  "/delete-user",
  "/send-verification-email",
  "/verify-email",
]

export const auth = betterAuth({
  appName: "QZ Blog",
  baseURL: oauthSiteOrigin(),
  basePath: "/api/oauth",
  secret: oauthSecret(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [oauthSiteOrigin()],
  disabledPaths: DISABLED_ACCOUNT_PATHS,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 15,
    maxPasswordLength: 128,
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPassword(password, hash),
    },
  },
  user: {
    changeEmail: { enabled: false },
    deleteUser: { enabled: false },
  },
  session: {
    expiresIn: OAUTH_SESSION_SECONDS,
    updateAge: 24 * 60 * 60,
    storeSessionInDatabase: true,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },
  advanced: {
    cookiePrefix: "qz_oauth",
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
    },
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  },
  plugins: [
    jwt({
      disableSettingJwtHeader: true,
      jwt: {
        issuer: oauthIssuer(),
        audience: mcpResourceUrl(),
        expirationTime: OAUTH_ACCESS_TOKEN_SECONDS,
      },
      jwks: {
        keyPairConfig: { alg: "ES256" },
        rotationInterval: 30 * 24 * 60 * 60,
        gracePeriod: OAUTH_REFRESH_TOKEN_SECONDS,
      },
    }),
    oauthProvider({
      loginPage: "/oauth/sign-in",
      consentPage: "/oauth/consent",
      scopes: [...OAUTH_SCOPES],
      validAudiences: [mcpResourceUrl()],
      accessTokenExpiresIn: OAUTH_ACCESS_TOKEN_SECONDS,
      refreshTokenExpiresIn: OAUTH_REFRESH_TOKEN_SECONDS,
      codeExpiresIn: OAUTH_CODE_SECONDS,
      grantTypes: ["authorization_code", "refresh_token"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      allowPublicClientPrelogin: true,
      clientRegistrationDefaultScopes: [...OAUTH_SCOPES],
      clientRegistrationAllowedScopes: [...OAUTH_SCOPES],
      advertisedMetadata: { scopes_supported: [...OAUTH_SCOPES] },
      prefix: { refreshToken: "qzoauth_rt_" },
      silenceWarnings: { oauthAuthServerConfig: true },
    }),
    nextCookies(),
  ],
})

export type BetterAuthSession = typeof auth.$Infer.Session
