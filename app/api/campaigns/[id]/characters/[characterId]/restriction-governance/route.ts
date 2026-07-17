import { NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth/server";
import {
  isPlayerRestrictionConsumerInput,
  loadCharacterRestrictionGovernance,
  RestrictionGovernanceServiceError,
  submitCurrentPlayerRestriction,
} from "@/lib/restrictions/governanceServer";

type SubmitPayload = {
  consumerType?: unknown;
  consumerId?: unknown;
  expectedSubmissionRevision?: unknown;
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
  console.error("[RESTRICTION_GOVERNANCE]", error);
  return NextResponse.json({ error: "Server error", code: "SERVER_ERROR" }, { status: 500 });
}

async function routeIds(
  context: { params: Promise<{ id: string; characterId: string }> },
) {
  const { id, characterId } = await context.params;
  return {
    campaignId: String(id ?? "").trim(),
    characterId: String(characterId ?? "").trim(),
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; characterId: string }> },
) {
  try {
    const { campaignId, characterId } = await routeIds(context);
    if (!campaignId || !characterId) {
      return NextResponse.json(
        {
          error: "Campaign id and character id are required.",
          code: "INVALID_ROUTE_IDENTIFIERS",
        },
        { status: 400 },
      );
    }
    const actorUserId = await requireUserId();
    const result = await loadCharacterRestrictionGovernance({
      campaignId,
      characterId,
      actorUserId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; characterId: string }> },
) {
  try {
    const { campaignId, characterId } = await routeIds(context);
    if (!campaignId || !characterId) {
      return NextResponse.json(
        {
          error: "Campaign id and character id are required.",
          code: "INVALID_ROUTE_IDENTIFIERS",
        },
        { status: 400 },
      );
    }
    const body = await request.json().catch(() => null) as SubmitPayload | null;
    if (!body) {
      return NextResponse.json(
        { error: "A JSON request body is required.", code: "MALFORMED_JSON_BODY" },
        { status: 400 },
      );
    }
    const consumerId = typeof body.consumerId === "string"
      ? body.consumerId.trim()
      : "";
    if (!isPlayerRestrictionConsumerInput(body.consumerType) || !consumerId) {
      return NextResponse.json(
        {
          error: "A valid Player Restriction consumer type and stable consumer id are required.",
          code: "INVALID_CONSUMER_LOCATOR",
        },
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
    const actorUserId = await requireUserId();
    const governance = await submitCurrentPlayerRestriction({
      campaignId,
      characterId,
      consumerType: body.consumerType,
      consumerId,
      expectedSubmissionRevision: body.expectedSubmissionRevision as number,
      actorUserId,
    });
    return NextResponse.json({ ok: true, governance });
  } catch (error) {
    return errorResponse(error);
  }
}
