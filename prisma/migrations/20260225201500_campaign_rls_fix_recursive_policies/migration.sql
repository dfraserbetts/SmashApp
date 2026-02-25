-- Fix recursive Campaign/CampaignUser policy evaluation by using
-- SECURITY DEFINER helper functions.

CREATE OR REPLACE FUNCTION public.is_campaign_owner(p_campaign_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."Campaign" c
    WHERE c."id" = p_campaign_id
      AND c."ownerUserId" = auth.uid()::text
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_campaign_member(p_campaign_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."CampaignUser" cu
    WHERE cu."campaignId" = p_campaign_id
      AND cu."userId" = auth.uid()::text
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_access_campaign(p_campaign_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_campaign_owner(p_campaign_id)
      OR public.is_campaign_member(p_campaign_id);
$function$;

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
USING (public.can_access_campaign(id));

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

DROP POLICY IF EXISTS "campaignuser_insert_owner_only" ON public."CampaignUser";
DROP POLICY IF EXISTS "campaignuser_select_self_or_owner" ON public."CampaignUser";
DROP POLICY IF EXISTS "campaignuser_update_owner_only" ON public."CampaignUser";
DROP POLICY IF EXISTS "campaignuser_delete_owner_only" ON public."CampaignUser";

CREATE POLICY "campaignuser_insert_owner_only"
ON public."CampaignUser"
FOR INSERT
TO authenticated
WITH CHECK (public.is_campaign_owner("campaignId"));

CREATE POLICY "campaignuser_select_self_or_owner"
ON public."CampaignUser"
FOR SELECT
TO authenticated
USING ("userId" = (auth.uid())::text OR public.is_campaign_owner("campaignId"));

CREATE POLICY "campaignuser_update_owner_only"
ON public."CampaignUser"
FOR UPDATE
TO authenticated
USING (public.is_campaign_owner("campaignId"))
WITH CHECK (public.is_campaign_owner("campaignId"));

CREATE POLICY "campaignuser_delete_owner_only"
ON public."CampaignUser"
FOR DELETE
TO authenticated
USING (public.is_campaign_owner("campaignId"));
