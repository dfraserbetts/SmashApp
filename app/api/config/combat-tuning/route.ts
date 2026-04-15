import { NextResponse } from "next/server";
import { getProtectionTuning } from "@/lib/config/combatTuning";
import { DEFAULT_COMBAT_TUNING_VALUES } from "@/lib/config/combatTuningShared";

export async function GET() {
  try {
    const tuning = await getProtectionTuning();
    return NextResponse.json(tuning);
  } catch {
    return NextResponse.json(DEFAULT_COMBAT_TUNING_VALUES);
  }
}
