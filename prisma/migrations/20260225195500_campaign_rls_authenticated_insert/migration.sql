-- Campaign / CampaignUser RLS hardening
-- Uses actual schema columns:
--   Campaign.ownerUserId
--   CampaignUser.campaignId
--   CampaignUser.userId

ALTER TABLE public."Campaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Campaign" FORCE ROW LEVEL SECURITY;

ALTER TABLE public."CampaignUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CampaignUser" FORCE ROW LEVEL SECURITY;

-- Recreate Campaign policies with explicit, self-contained expressions.
DROP POLICY IF EXISTS "campaign_insert_owner_only" ON public."Campaign";
DROP POLICY IF EXISTS "campaign_select_member_or_owner" ON public."Campaign";
DROP POLICY IF EXISTS "campaign_update_owner_only" ON public."Campaign";
DROP POLICY IF EXISTS "campaign_delete_owner_only" ON public."Campaign";

CREATE POLICY "campaign_insert_owner_only"
ON public."Campaign"
FOR INSERT
TO authenticated
WITH CHECK ("ownerUserId" = (auth.uid())::text);

CREATE POLICY "campaign_select_member_or_owner"
ON public."Campaign"
FOR SELECT
TO authenticated
USING (
  "ownerUserId" = (auth.uid())::text
  OR EXISTS (
    SELECT 1
    FROM public."CampaignUser" cu
    WHERE cu."campaignId" = "Campaign"."id"
      AND cu."userId" = (auth.uid())::text
  )
);

CREATE POLICY "campaign_update_owner_only"
ON public."Campaign"
FOR UPDATE
TO authenticated
USING ("ownerUserId" = (auth.uid())::text)
WITH CHECK ("ownerUserId" = (auth.uid())::text);

CREATE POLICY "campaign_delete_owner_only"
ON public."Campaign"
FOR DELETE
TO authenticated
USING ("ownerUserId" = (auth.uid())::text);

-- Recreate CampaignUser policies with explicit owner/self checks.
DROP POLICY IF EXISTS "campaignuser_insert_owner_only" ON public."CampaignUser";
DROP POLICY IF EXISTS "campaignuser_select_self_or_owner" ON public."CampaignUser";
DROP POLICY IF EXISTS "campaignuser_update_owner_only" ON public."CampaignUser";
DROP POLICY IF EXISTS "campaignuser_delete_owner_only" ON public."CampaignUser";

CREATE POLICY "campaignuser_insert_owner_only"
ON public."CampaignUser"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."Campaign" c
    WHERE c."id" = "CampaignUser"."campaignId"
      AND c."ownerUserId" = (auth.uid())::text
  )
);

CREATE POLICY "campaignuser_select_self_or_owner"
ON public."CampaignUser"
FOR SELECT
TO authenticated
USING (
  "userId" = (auth.uid())::text
  OR EXISTS (
    SELECT 1
    FROM public."Campaign" c
    WHERE c."id" = "CampaignUser"."campaignId"
      AND c."ownerUserId" = (auth.uid())::text
  )
);

CREATE POLICY "campaignuser_update_owner_only"
ON public."CampaignUser"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Campaign" c
    WHERE c."id" = "CampaignUser"."campaignId"
      AND c."ownerUserId" = (auth.uid())::text
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public."Campaign" c
    WHERE c."id" = "CampaignUser"."campaignId"
      AND c."ownerUserId" = (auth.uid())::text
  )
);

CREATE POLICY "campaignuser_delete_owner_only"
ON public."CampaignUser"
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public."Campaign" c
    WHERE c."id" = "CampaignUser"."campaignId"
      AND c."ownerUserId" = (auth.uid())::text
  )
);
