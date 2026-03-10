import { NextResponse } from "next/server";
import { getProtectionTuning } from "@/lib/config/combatTuning";
import {
  DEFAULT_PROTECTION_K,
  DEFAULT_PROTECTION_S,
} from "@/lib/config/combatTuningShared";

export async function GET() {
  try {
    const { protectionK, protectionS } = await getProtectionTuning();
    return NextResponse.json({ protectionK, protectionS });
  } catch {
    return NextResponse.json({
      protectionK: DEFAULT_PROTECTION_K,
      protectionS: DEFAULT_PROTECTION_S,
    });
  }
}
