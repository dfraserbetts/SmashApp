import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import {
  requestPlayerRestrictionChanges,
  RestrictionGovernanceServiceError,
} from "@/lib/restrictions/governanceServer";

type RequestChangesPayload = {
  expectedSubmissionRevision?: unknown;
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
  console.error("[RESTRICTION_GOVERNANCE_REQUEST_CHANGES]", error);
  return NextResponse.json({ error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
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
    const body = await request.json().catch(() => null) as RequestChangesPayload | null;
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
    if (typeof body.notes !== "string" || !body.notes.trim()) {
      return NextResponse.json(
        {
          error: "Request Changes requires a nonblank player-facing note.",
          code: "CHANGES_REQUESTED_NOTE_REQUIRED",
        },
        { status: 400 },
      );
    }
    const actorUserId = await requireUserId();
    const governance = await requestPlayerRestrictionChanges({
      campaignId,
      governanceId: targetGovernanceId,
      expectedSubmissionRevision: body.expectedSubmissionRevision as number,
      notes: body.notes,
      actorUserId,
    });
    return NextResponse.json({ ok: true, governance });
  } catch (error) {
    return errorResponse(error);
  }
}
