-- CreateTable
CREATE TABLE "ItemTag" (
  "id" TEXT NOT NULL,
  "itemTemplateId" TEXT NOT NULL,
  "tag" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ItemTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemTag_tag_idx" ON "ItemTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "ItemTag_itemTemplateId_tag_key" ON "ItemTag"("itemTemplateId", "tag");

-- AddForeignKey
ALTER TABLE "ItemTag" ADD CONSTRAINT "ItemTag_itemTemplateId_fkey"
FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;
