import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { organization, twoFactor } from "better-auth/plugins";
import prisma from "../../prisma/client";
import { sendEmail } from "../server/email";
import { renderBrandedEmail } from "../server/emailTemplates";
import { loadServerEnvironment } from "../server/env";
import {
  clearLoginAttempts,
  getLoginLockout,
  recordFailedLogin,
} from "../server/loginThrottle";
import { organizationOnboardingSchema } from "../server/organizationSchemas";
import {
  recordSecurityEvent,
  type SecurityEventType,
} from "../server/securityEvents";

const environment = loadServerEnvironment();
const vercelDeploymentUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : null;
const applicationUrl =
  environment.NEXT_PUBLIC_APP_URL ??
  vercelDeploymentUrl ??
  "http://localhost:3000";
const trustedOrigins = [
  applicationUrl,
  environment.NEXT_PUBLIC_APP_URL,
  vercelDeploymentUrl,
].filter((origin): origin is string => Boolean(origin));
const passkeyRpId = new URL(applicationUrl).hostname;

export const auth = betterAuth({
  appName: "AMR Hub",
  telemetry: {
    enabled: false,
  },
  baseURL: applicationUrl,
  secret: environment.BETTER_AUTH_SECRET,
  trustedOrigins,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    autoSignIn: false,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const { html, text } = renderBrandedEmail({
        heading: "Reset your password",
        intro: "We received a request to reset your AMR Hub password.",
        ctaLabel: "Reset password",
        url,
        note: "This link expires in 1 hour. If you didn't request this, you can ignore this email - your password will not change.",
      });
      await sendEmail({
        to: user.email,
        subject: "Reset your AMR Hub password",
        html,
        text,
      });
    },
    onPasswordReset: async ({ user }) => {
      await recordSecurityEvent({ type: "password_reset", userId: user.id });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      const { html, text } = renderBrandedEmail({
        heading: "Verify your email",
        intro:
          "Confirm your email address to finish setting up your AMR Hub account.",
        ctaLabel: "Verify email",
        url,
        note: "This link expires in 24 hours. If you didn't create this account, you can ignore this email.",
      });
      await sendEmail({
        to: user.email,
        subject: "Verify your email for AMR Hub",
        html,
        text,
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "OWNER",
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 15,
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const membership = await prisma.member.findFirst({
            where: { userId: session.userId },
            orderBy: { createdAt: "asc" },
            select: { organizationId: true },
          });

          return {
            data: {
              ...session,
              activeOrganizationId: membership?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = ctx.body?.email;
      if (typeof email !== "string") return;

      const lockedUntil = await getLoginLockout(email);
      if (!lockedUntil) return;

      const minutes = Math.max(
        1,
        Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000),
      );
      throw new APIError("FORBIDDEN", {
        message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        code: "ACCOUNT_LOCKED",
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      const isError = ctx.context.returned instanceof APIError;

      if (ctx.path === "/sign-in/email") {
        const email = ctx.body?.email;
        if (typeof email === "string") {
          const failedWithCredentials =
            isError &&
            (ctx.context.returned as InstanceType<typeof APIError>).body
              ?.code === "INVALID_EMAIL_OR_PASSWORD";

          if (failedWithCredentials) {
            await recordFailedLogin(email);
          } else if (!isError) {
            await clearLoginAttempts(email);
          }
        }
      }

      if (isError) return;

      const eventByPath: Partial<Record<string, SecurityEventType>> = {
        "/change-password": "password_changed",
        "/two-factor/enable": "two_factor_enabled",
        "/two-factor/disable": "two_factor_disabled",
        "/passkey/verify-registration": "passkey_added",
        "/passkey/delete-passkey": "passkey_removed",
        "/revoke-session": "session_revoked",
        "/revoke-sessions": "sessions_revoked",
        "/revoke-other-sessions": "sessions_revoked",
      };

      const type = eventByPath[ctx.path];
      const userId = ctx.context.session?.user?.id;
      if (!type || !userId) return;

      await recordSecurityEvent({ type, userId });
    }),
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      // Every page load reads the session, workspace and membership, so the
      // general limit is too tight for normal navigation; a 429 here makes the
      // app look signed out of its workspace.
      "/get-session": { window: 60, max: 600 },
      "/organization/get-full-organization": { window: 60, max: 600 },
      "/organization/get-active-member": { window: 60, max: 600 },
      "/sign-in/email": {
        window: 60,
        max: 5,
      },
      "/sign-up/email": {
        window: 60,
        max: 3,
      },
      "/two-factor/verify-totp": {
        window: 60,
        max: 6,
      },
      "/two-factor/verify-backup-code": {
        window: 60,
        max: 6,
      },
    },
  },
  plugins: [
    organization({
      organizationLimit: 1,
      membershipLimit: 100,
      schema: {
        organization: {
          additionalFields: {
            key: {
              type: "string",
              required: true,
              input: true,
            },
          },
        },
        invitation: {
          modelName: "organizationInvitation",
        },
      },
      allowUserToCreateOrganization: async (user) =>
        (await prisma.member.count({ where: { userId: user.id } })) === 0,
      organizationHooks: {
        beforeCreateOrganization: async ({ organization }) => {
          const validation = organizationOnboardingSchema.safeParse(
            organization,
          );

          if (!validation.success) {
            throw new APIError("BAD_REQUEST", {
              message:
                validation.error.issues[0]?.message ??
                "Organization details are invalid",
            });
          }

          return {
            data: {
              ...organization,
              ...validation.data,
            },
          };
        },
      },
    }),
    twoFactor({
      issuer: "AMR Hub",
      twoFactorCookieMaxAge: 60 * 10,
      trustDeviceMaxAge: 60 * 60 * 24 * 30,
      backupCodeOptions: {
        amount: 10,
        length: 12,
      },
      accountLockout: {
        enabled: true,
        maxFailedAttempts: 5,
        durationSeconds: 60 * 15,
      },
    }),
    passkey({
      rpID: passkeyRpId,
      rpName: "AMR Hub",
    }),
  ],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});

export type AuthSession = typeof auth.$Infer.Session;
