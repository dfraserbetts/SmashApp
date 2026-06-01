import { CampaignToolAccessDenied } from "@/app/campaign/[id]/CampaignToolAccessDenied";
import { requireUserId } from "@/lib/auth/server";
import { requireCampaignGameDirector } from "@/lib/campaign/access";

import CampaignForgeLibraryClient from "./CampaignForgeLibraryClient";

type CampaignForgeLibraryPageProps = {
  params: { id: string };
};

export default async function CampaignForgeLibraryPage({
  params,
}: CampaignForgeLibraryPageProps) {
  const { id } = await Promise.resolve(params);

  try {
    const userId = await requireUserId();
    await requireCampaignGameDirector(id, userId);
  } catch {
    return <CampaignToolAccessDenied campaignId={id} />;
  }

  return <CampaignForgeLibraryClient campaignId={id} />;
}
