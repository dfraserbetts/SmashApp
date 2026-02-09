-- AlterTable
ALTER TABLE "ItemTemplate" ADD COLUMN     "MythicLbBreakTemplateID" TEXT,
ADD COLUMN     "MythicLbPushTemplateID" TEXT,
ADD COLUMN     "MythicLbTranscendTemplateID" TEXT;

-- AddForeignKey
ALTER TABLE "ItemTemplate" ADD CONSTRAINT "ItemTemplate_MythicLbPushTemplateID_fkey" FOREIGN KEY ("MythicLbPushTemplateID") REFERENCES "LimitBreakTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplate" ADD CONSTRAINT "ItemTemplate_MythicLbBreakTemplateID_fkey" FOREIGN KEY ("MythicLbBreakTemplateID") REFERENCES "LimitBreakTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplate" ADD CONSTRAINT "ItemTemplate_MythicLbTranscendTemplateID_fkey" FOREIGN KEY ("MythicLbTranscendTemplateID") REFERENCES "LimitBreakTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
