-- CreateEnum
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('WEAPON', 'ARMOR', 'SHIELD', 'ITEM');

-- CreateEnum
CREATE TYPE "WeaponSize" AS ENUM ('SMALL', 'ONE_HANDED', 'TWO_HANDED');

-- CreateEnum
CREATE TYPE "RangeCategory" AS ENUM ('MELEE', 'RANGED', 'AOE');

-- CreateEnum
CREATE TYPE "AoEShape" AS ENUM ('SPHERE', 'CONE', 'LINE');

-- CreateEnum
CREATE TYPE "ArmorLocation" AS ENUM ('HEAD', 'SHOULDERS', 'TORSO', 'LEGS', 'FEET');

-- CreateEnum
CREATE TYPE "ItemLocation" AS ENUM ('HEAD', 'NECK', 'ARMS', 'BELT');

-- CreateEnum
CREATE TYPE "VRPEffectKind" AS ENUM ('VULNERABILITY', 'RESISTANCE', 'PROTECTION');

-- CreateEnum
CREATE TYPE "ForgeConfigCategory" AS ENUM ('RARITY', 'SIZE', 'ARMOR_LOCATION', 'ITEM_LOCATION');

-- CreateEnum
CREATE TYPE "ForgeCostCategory" AS ENUM ('AoECenterRangeFt', 'AoECount', 'ArmorAttributes', 'Attribute', 'Aura_Mental', 'Aura_Physical', 'ConeLengthFt', 'DmgType_Count', 'GS_AttackEffects', 'GS_DefEffects', 'ItemType', 'LineLengthFt', 'LineWidthFt', 'MeleeTargets', 'RangeCategory', 'RangedDistanceFt', 'RangedTargets', 'SanctifiedOptions', 'ShieldAttributes', 'ShieldHasAttack', 'SphereSizeFt', 'Stat', 'VRPOptions', 'WardingOptions', 'WeaponAttributes');

-- CreateTable
CREATE TABLE "ItemTemplate" (
    "ItemID" TEXT NOT NULL,
    "ItemUrl" TEXT,
    "Timestamp" TIMESTAMP(3) NOT NULL,
    "ItemName" TEXT NOT NULL,
    "ItemRarity" "ItemRarity" NOT NULL,
    "ItemLevel" INTEGER NOT NULL,
    "GeneralDescription" TEXT NOT NULL,
    "ItemType" "ItemType" NOT NULL,
    "Size" "WeaponSize",
    "StrikeValue" INTEGER,
    "WillpowerValue" INTEGER,
    "MeleeTargets" INTEGER,
    "RangedTargets" INTEGER,
    "RangedDistance" INTEGER,
    "AoECenterRange" INTEGER,
    "AoECount" INTEGER,
    "AoEShape" "AoEShape",
    "AoESphereSize" INTEGER,
    "AoEConeLength" INTEGER,
    "AoELineWidth" INTEGER,
    "AoELineLength" INTEGER,
    "CustomWeaponAttributes" TEXT,
    "ArmorLocation" "ArmorLocation",
    "PPV" INTEGER,
    "MPV" INTEGER,
    "Aura_Physical" INTEGER,
    "Aura_Mental" INTEGER,
    "CustomArmorAttributes" TEXT,
    "ShieldHasAttack" BOOLEAN,
    "CustomShieldAttributes" TEXT,
    "ItemLocation" "ItemLocation",
    "CustomItemAttributes" TEXT,

    CONSTRAINT "ItemTemplate_pkey" PRIMARY KEY ("ItemID")
);

-- CreateTable
CREATE TABLE "DamageType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "DamageType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttackEffect" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AttackEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefEffect" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "DefEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeaponAttribute" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "WeaponAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArmorAttribute" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ArmorAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShieldAttribute" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ShieldAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WardingOption" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "WardingOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SanctifiedOption" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SanctifiedOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemTemplateRangeCategory" (
    "itemTemplateId" TEXT NOT NULL,
    "rangeCategory" "RangeCategory" NOT NULL,

    CONSTRAINT "ItemTemplateRangeCategory_pkey" PRIMARY KEY ("itemTemplateId","rangeCategory")
);

-- CreateTable
CREATE TABLE "ItemTemplateMeleeDamageType" (
    "itemTemplateId" TEXT NOT NULL,
    "damageTypeId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateMeleeDamageType_pkey" PRIMARY KEY ("itemTemplateId","damageTypeId")
);

-- CreateTable
CREATE TABLE "ItemTemplateRangedDamageType" (
    "itemTemplateId" TEXT NOT NULL,
    "damageTypeId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateRangedDamageType_pkey" PRIMARY KEY ("itemTemplateId","damageTypeId")
);

-- CreateTable
CREATE TABLE "ItemTemplateAoEDamageType" (
    "itemTemplateId" TEXT NOT NULL,
    "damageTypeId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateAoEDamageType_pkey" PRIMARY KEY ("itemTemplateId","damageTypeId")
);

-- CreateTable
CREATE TABLE "ItemTemplateAttackEffectMelee" (
    "itemTemplateId" TEXT NOT NULL,
    "attackEffectId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateAttackEffectMelee_pkey" PRIMARY KEY ("itemTemplateId","attackEffectId")
);

-- CreateTable
CREATE TABLE "ItemTemplateAttackEffectRanged" (
    "itemTemplateId" TEXT NOT NULL,
    "attackEffectId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateAttackEffectRanged_pkey" PRIMARY KEY ("itemTemplateId","attackEffectId")
);

-- CreateTable
CREATE TABLE "ItemTemplateAttackEffectAoE" (
    "itemTemplateId" TEXT NOT NULL,
    "attackEffectId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateAttackEffectAoE_pkey" PRIMARY KEY ("itemTemplateId","attackEffectId")
);

-- CreateTable
CREATE TABLE "ItemTemplateWeaponAttribute" (
    "itemTemplateId" TEXT NOT NULL,
    "weaponAttributeId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateWeaponAttribute_pkey" PRIMARY KEY ("itemTemplateId","weaponAttributeId")
);

-- CreateTable
CREATE TABLE "ItemTemplateArmorAttribute" (
    "itemTemplateId" TEXT NOT NULL,
    "armorAttributeId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateArmorAttribute_pkey" PRIMARY KEY ("itemTemplateId","armorAttributeId")
);

-- CreateTable
CREATE TABLE "ItemTemplateShieldAttribute" (
    "itemTemplateId" TEXT NOT NULL,
    "shieldAttributeId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateShieldAttribute_pkey" PRIMARY KEY ("itemTemplateId","shieldAttributeId")
);

-- CreateTable
CREATE TABLE "ItemTemplateDefEffect" (
    "itemTemplateId" TEXT NOT NULL,
    "defEffectId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateDefEffect_pkey" PRIMARY KEY ("itemTemplateId","defEffectId")
);

-- CreateTable
CREATE TABLE "ItemTemplateWardingOption" (
    "itemTemplateId" TEXT NOT NULL,
    "wardingOptionId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateWardingOption_pkey" PRIMARY KEY ("itemTemplateId","wardingOptionId")
);

-- CreateTable
CREATE TABLE "ItemTemplateSanctifiedOption" (
    "itemTemplateId" TEXT NOT NULL,
    "sanctifiedOptionId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateSanctifiedOption_pkey" PRIMARY KEY ("itemTemplateId","sanctifiedOptionId")
);

-- CreateTable
CREATE TABLE "ItemTemplateVRPEntry" (
    "id" SERIAL NOT NULL,
    "itemTemplateId" TEXT NOT NULL,
    "effectKind" "VRPEffectKind" NOT NULL,
    "magnitude" INTEGER NOT NULL,
    "damageTypeId" INTEGER NOT NULL,

    CONSTRAINT "ItemTemplateVRPEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgeConfigEntry" (
    "id" SERIAL NOT NULL,
    "category" "ForgeConfigCategory" NOT NULL,
    "selector1" TEXT NOT NULL,
    "selector2" TEXT,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ForgeConfigEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForgeCostEntry" (
    "id" SERIAL NOT NULL,
    "category" "ForgeCostCategory" NOT NULL,
    "selector1" TEXT NOT NULL,
    "selector2" TEXT,
    "selector3" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ForgeCostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DamageType_name_key" ON "DamageType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AttackEffect_name_key" ON "AttackEffect"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DefEffect_name_key" ON "DefEffect"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WeaponAttribute_name_key" ON "WeaponAttribute"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ArmorAttribute_name_key" ON "ArmorAttribute"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShieldAttribute_name_key" ON "ShieldAttribute"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WardingOption_name_key" ON "WardingOption"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SanctifiedOption_name_key" ON "SanctifiedOption"("name");

-- CreateIndex
CREATE INDEX "ItemTemplateVRPEntry_itemTemplateId_idx" ON "ItemTemplateVRPEntry"("itemTemplateId");

-- CreateIndex
CREATE INDEX "ForgeConfigEntry_category_selector1_selector2_idx" ON "ForgeConfigEntry"("category", "selector1", "selector2");

-- CreateIndex
CREATE INDEX "ForgeCostEntry_category_selector1_selector2_selector3_idx" ON "ForgeCostEntry"("category", "selector1", "selector2", "selector3");

-- AddForeignKey
ALTER TABLE "ItemTemplateRangeCategory" ADD CONSTRAINT "ItemTemplateRangeCategory_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateMeleeDamageType" ADD CONSTRAINT "ItemTemplateMeleeDamageType_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateMeleeDamageType" ADD CONSTRAINT "ItemTemplateMeleeDamageType_damageTypeId_fkey" FOREIGN KEY ("damageTypeId") REFERENCES "DamageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateRangedDamageType" ADD CONSTRAINT "ItemTemplateRangedDamageType_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateRangedDamageType" ADD CONSTRAINT "ItemTemplateRangedDamageType_damageTypeId_fkey" FOREIGN KEY ("damageTypeId") REFERENCES "DamageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateAoEDamageType" ADD CONSTRAINT "ItemTemplateAoEDamageType_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateAoEDamageType" ADD CONSTRAINT "ItemTemplateAoEDamageType_damageTypeId_fkey" FOREIGN KEY ("damageTypeId") REFERENCES "DamageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateAttackEffectMelee" ADD CONSTRAINT "ItemTemplateAttackEffectMelee_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateAttackEffectMelee" ADD CONSTRAINT "ItemTemplateAttackEffectMelee_attackEffectId_fkey" FOREIGN KEY ("attackEffectId") REFERENCES "AttackEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateAttackEffectRanged" ADD CONSTRAINT "ItemTemplateAttackEffectRanged_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateAttackEffectRanged" ADD CONSTRAINT "ItemTemplateAttackEffectRanged_attackEffectId_fkey" FOREIGN KEY ("attackEffectId") REFERENCES "AttackEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateAttackEffectAoE" ADD CONSTRAINT "ItemTemplateAttackEffectAoE_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateAttackEffectAoE" ADD CONSTRAINT "ItemTemplateAttackEffectAoE_attackEffectId_fkey" FOREIGN KEY ("attackEffectId") REFERENCES "AttackEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateWeaponAttribute" ADD CONSTRAINT "ItemTemplateWeaponAttribute_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateWeaponAttribute" ADD CONSTRAINT "ItemTemplateWeaponAttribute_weaponAttributeId_fkey" FOREIGN KEY ("weaponAttributeId") REFERENCES "WeaponAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateArmorAttribute" ADD CONSTRAINT "ItemTemplateArmorAttribute_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateArmorAttribute" ADD CONSTRAINT "ItemTemplateArmorAttribute_armorAttributeId_fkey" FOREIGN KEY ("armorAttributeId") REFERENCES "ArmorAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateShieldAttribute" ADD CONSTRAINT "ItemTemplateShieldAttribute_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateShieldAttribute" ADD CONSTRAINT "ItemTemplateShieldAttribute_shieldAttributeId_fkey" FOREIGN KEY ("shieldAttributeId") REFERENCES "ShieldAttribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateDefEffect" ADD CONSTRAINT "ItemTemplateDefEffect_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateDefEffect" ADD CONSTRAINT "ItemTemplateDefEffect_defEffectId_fkey" FOREIGN KEY ("defEffectId") REFERENCES "DefEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateWardingOption" ADD CONSTRAINT "ItemTemplateWardingOption_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateWardingOption" ADD CONSTRAINT "ItemTemplateWardingOption_wardingOptionId_fkey" FOREIGN KEY ("wardingOptionId") REFERENCES "WardingOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateSanctifiedOption" ADD CONSTRAINT "ItemTemplateSanctifiedOption_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateSanctifiedOption" ADD CONSTRAINT "ItemTemplateSanctifiedOption_sanctifiedOptionId_fkey" FOREIGN KEY ("sanctifiedOptionId") REFERENCES "SanctifiedOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateVRPEntry" ADD CONSTRAINT "ItemTemplateVRPEntry_itemTemplateId_fkey" FOREIGN KEY ("itemTemplateId") REFERENCES "ItemTemplate"("ItemID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemTemplateVRPEntry" ADD CONSTRAINT "ItemTemplateVRPEntry_damageTypeId_fkey" FOREIGN KEY ("damageTypeId") REFERENCES "DamageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
