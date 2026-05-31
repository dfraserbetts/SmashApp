import { NextResponse } from "next/server";

import { findUserProfileByEmail, normalizeEmail } from "@/lib/auth/profile";
import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";
import { getAppBaseUrl, sendEmail } from "@/lib/email/sendEmail";
import { prisma } from "@/prisma/client";

type JoinUpBody = {
  email?: unknown;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const campaignId = String(id ?? "").trim();
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
    }

    const actorUserId = await requireUserId();
    await requireCampaignGameDirector(campaignId, actorUserId);

    const body = (await req.json().catch(() => ({}))) as JoinUpBody;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const emailNormalized = normalizeEmail(email);
    if (!emailNormalized || !isValidEmail(emailNormalized)) {
      return NextResponse.json({ error: "A valid player email is required" }, { status: 400 });
    }

    const [campaign, existingProfile] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { name: true },
      }),
      findUserProfileByEmail(emailNormalized),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existingProfile) {
      return NextResponse.json(
        { code: "ACCOUNT_EXISTS_USE_INVITE", error: "Account exists; send a campaign invite instead" },
        { status: 409 },
      );
    }

    const signupUrl = `${getAppBaseUrl()}/signup`;
    const emailDeliveryStatus = await sendEmail({
      to: email,
      subject: "Join Incarnate TTRPG",
      text: [
        `A Game Director wants to invite you to ${campaign.name}.`,
        "Create an Incarnate TTRPG account first, then ask them to send the campaign invite again.",
        "",
        `Join up here: ${signupUrl}`,
      ].join("\n"),
    });

    return NextResponse.json({
      ok: true,
      code: "JOIN_UP_EMAIL_SENT_OR_LOGGED",
      emailNormalized,
      emailDeliveryStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (message === "NOT_FOUND") {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    console.error("[CAMPAIGN_JOIN_UP_EMAIL]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
