import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import {
  loadCampaignRestrictionGovernanceQueue,
  loadCampaignRestrictionGovernanceSummary,
} from "@/lib/restrictions/governanceQueueServer";
import { RestrictionGovernanceServiceError } from "@/lib/restrictions/governanceServer";

function errorResponse(error: unknown) {
  if (error instanceof RestrictionGovernanceServiceError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
  }
  if (message === "NOT_FOUND") {
    return NextResponse.json({ error: "Campaign not found", code: "CAMPAIGN_NOT_FOUND" }, { status: 404 });
  }
  console.error("[CAMPAIGN_RESTRICTION_GOVERNANCE_QUEUE]", error);
  return NextResponse.json({ error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const campaignId = String(id ?? "").trim();
    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign id is required.", code: "INVALID_ROUTE_IDENTIFIERS" },
        { status: 400 },
      );
    }
    const actorUserId = await requireUserId();
    const summary = new URL(request.url).searchParams.get("summary") === "1";
    const result = summary
      ? await loadCampaignRestrictionGovernanceSummary({ campaignId, actorUserId })
      : await loadCampaignRestrictionGovernanceQueue({ campaignId, actorUserId });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
