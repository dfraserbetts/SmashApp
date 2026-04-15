import { NextResponse } from "next/server";
import { ensureSeedPowerTuningSet } from "@/lib/config/powerTuning";
import { DEFAULT_POWER_TUNING_VALUES } from "@/lib/config/powerTuningShared";

export async function GET() {
  try {
    const snapshot = await ensureSeedPowerTuningSet();
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({
      setId: "",
      name: "Phase 6 Default v1",
      slug: "phase6-default-v1",
      status: "ACTIVE" as const,
      updatedAt: new Date(0).toISOString(),
      values: DEFAULT_POWER_TUNING_VALUES,
    });
  }
}
