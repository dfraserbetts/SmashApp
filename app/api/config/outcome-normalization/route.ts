import { NextResponse } from "next/server";
import { ensureSeedOutcomeNormalizationSet } from "@/lib/config/outcomeNormalization";
import { DEFAULT_OUTCOME_NORMALIZATION_VALUES } from "@/lib/config/outcomeNormalizationShared";

export async function GET() {
  try {
    const snapshot = await ensureSeedOutcomeNormalizationSet();
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({
      setId: "",
      name: "Outcome Normalization Default v1",
      slug: "outcome-normalization-default-v1",
      status: "ACTIVE" as const,
      updatedAt: new Date(0).toISOString(),
      values: DEFAULT_OUTCOME_NORMALIZATION_VALUES,
    });
  }
}
