import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDueScheduledRules } from "../../../../server/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Cron calls this with `Authorization: Bearer ${CRON_SECRET}`.
 * Without CRON_SECRET it only runs in local development.
 */
function authorize(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === "development"
      ? null
      : NextResponse.json(
          { error: "CRON_SECRET is not configured" },
          { status: 503 },
        );
  }
  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Runs every scheduled automation rule that is due. */
export async function GET(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;

  const now = new Date();
  try {
    const rules = await runDueScheduledRules(now);
    const summary = {
      ranAt: now.toISOString(),
      rules: rules.map((rule) => ({
        ruleId: rule.ruleId,
        name: rule.name,
        results: rule.results.length,
        statuses: rule.results.map((result) => result.status),
      })),
    };
    console.info("[cron:automation]", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Automation cron failed", error);
    return NextResponse.json(
      { error: "Automation cron failed" },
      { status: 500 },
    );
  }
}
