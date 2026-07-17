import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import { RESTRICTION_TIERS, type RestrictionTier } from "@/lib/restrictions/governance";
import {
  approvePlayerRestriction,
  RestrictionGovernanceServiceError,
} from "@/lib/restrictions/governanceServer";

type ApprovePayload = {
  expectedSubmissionRevision?: unknown;
  selectedTier?: unknown;
  notes?: unknown;
};

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
  console.error("[RESTRICTION_GOVERNANCE_APPROVE]", error);
  return NextResponse.json({ error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
}

function isTier(value: unknown): value is RestrictionTier {
  return typeof value === "string" &&
    (RESTRICTION_TIERS as readonly string[]).includes(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; governanceId: string }> },
) {
  try {
    const { id, governanceId } = await context.params;
    const campaignId = String(id ?? "").trim();
    const targetGovernanceId = String(governanceId ?? "").trim();
    if (!campaignId || !targetGovernanceId) {
      return NextResponse.json(
        { error: "Campaign id and governance id are required.", code: "INVALID_ROUTE_IDENTIFIERS" },
        { status: 400 },
      );
    }
    const body = await request.json().catch(() => null) as ApprovePayload | null;
    if (!body) {
      return NextResponse.json(
        { error: "A JSON request body is required.", code: "MALFORMED_JSON_BODY" },
        { status: 400 },
      );
    }
    if (
      !Number.isInteger(body.expectedSubmissionRevision) ||
      Number(body.expectedSubmissionRevision) < 0
    ) {
      return NextResponse.json(
        {
          error: "expectedSubmissionRevision must be a nonnegative integer.",
          code: "EXPECTED_SUBMISSION_REVISION_REQUIRED",
        },
        { status: 400 },
      );
    }
    if (!isTier(body.selectedTier)) {
      return NextResponse.json(
        { error: "A valid selected Restriction tier is required.", code: "APPROVAL_TIER_REQUIRED" },
        { status: 400 },
      );
    }
    if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json(
        { error: "notes must be text when supplied.", code: "INVALID_REVIEW_NOTES" },
        { status: 400 },
      );
    }
    const actorUserId = await requireUserId();
    const governance = await approvePlayerRestriction({
      campaignId,
      governanceId: targetGovernanceId,
      expectedSubmissionRevision: body.expectedSubmissionRevision as number,
      selectedTier: body.selectedTier,
      notes: body.notes as string | null | undefined,
      actorUserId,
    });
    return NextResponse.json({ ok: true, governance });
  } catch (error) {
    return errorResponse(error);
  }
}
