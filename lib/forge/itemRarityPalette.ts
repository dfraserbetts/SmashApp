export type ForgeItemRarityPalette = {
  backgroundImage: string;
  outerBorderClass: string;
  outerShadowClass: string;
  innerBorderClass: string;
  innerShadowClass: string;
  panelBorderClass: string;
  panelShadowClass: string;
  imageBorderClass: string;
  headerTextClass: string;
  nameTextClass: string;
  descriptionTextClass: string;
  dividerClass: string;
  dividerBorderClass: string;
  attackLabelClass: string;
  bodyTextClass: string;
  bulletClass: string;
  bulletColor: string;
  outerBorderColor: string;
  panelBorderColor: string;
  headerColor: string;
  bodyColor: string;
  attackLabelColor: string;
};

const RARITY_PALETTES: Record<string, ForgeItemRarityPalette> = {
  COMMON: {
    backgroundImage:
      "radial-gradient(circle at 50% -12%, rgba(161, 161, 170, 0.36), transparent 34%), linear-gradient(180deg, #4b4b50 0%, #29292d 34%, #111114 68%, #050506 100%)",
    outerBorderClass: "border-zinc-400/70",
    outerShadowClass: "shadow-[0_0_28px_rgba(63,63,70,0.42),inset_0_0_42px_rgba(0,0,0,0.72)]",
    innerBorderClass: "border-zinc-200/45",
    innerShadowClass: "shadow-[0_0_16px_rgba(212,212,216,0.14),inset_0_0_18px_rgba(0,0,0,0.45)]",
    panelBorderClass: "border-zinc-500/40",
    panelShadowClass: "shadow-[inset_0_1px_0_rgba(212,212,216,0.08)]",
    imageBorderClass: "border-zinc-500/50",
    headerTextClass: "text-zinc-300 drop-shadow-[0_0_7px_rgba(212,212,216,0.28)]",
    nameTextClass: "text-zinc-100 drop-shadow-[0_0_8px_rgba(244,244,245,0.32)]",
    descriptionTextClass: "text-white/90",
    dividerClass: "via-zinc-300/45",
    dividerBorderClass: "border-zinc-300/45",
    attackLabelClass: "text-zinc-100",
    bodyTextClass: "text-zinc-50/90",
    bulletClass: "bg-zinc-300/70 shadow-[0_0_6px_rgba(212,212,216,0.35)]",
    bulletColor: "rgb(212 212 216 / 0.7)",
    outerBorderColor: "rgb(161 161 170 / 0.7)",
    panelBorderColor: "rgb(113 113 122 / 0.4)",
    headerColor: "rgb(212 212 216 / 0.88)",
    bodyColor: "rgb(255 255 255 / 0.9)",
    attackLabelColor: "rgb(244 244 245)",
  },
  UNCOMMON: {
    backgroundImage:
      "radial-gradient(circle at 50% -12%, rgba(74, 222, 128, 0.36), transparent 34%), linear-gradient(180deg, #285f36 0%, #17351f 34%, #08180d 68%, #030704 100%)",
    outerBorderClass: "border-emerald-400/70",
    outerShadowClass: "shadow-[0_0_28px_rgba(22,101,52,0.42),inset_0_0_42px_rgba(0,0,0,0.72)]",
    innerBorderClass: "border-emerald-100/45",
    innerShadowClass: "shadow-[0_0_16px_rgba(110,231,183,0.14),inset_0_0_18px_rgba(0,0,0,0.45)]",
    panelBorderClass: "border-emerald-700/40",
    panelShadowClass: "shadow-[inset_0_1px_0_rgba(110,231,183,0.08)]",
    imageBorderClass: "border-emerald-700/50",
    headerTextClass: "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.35)]",
    nameTextClass: "text-lime-100 drop-shadow-[0_0_9px_rgba(190,242,100,0.34)]",
    descriptionTextClass: "text-emerald-50/95",
    dividerClass: "via-emerald-300/45",
    dividerBorderClass: "border-emerald-300/45",
    attackLabelClass: "text-emerald-100",
    bodyTextClass: "text-emerald-50/90",
    bulletClass: "bg-emerald-300/70 shadow-[0_0_6px_rgba(110,231,183,0.35)]",
    bulletColor: "rgb(110 231 183 / 0.7)",
    outerBorderColor: "rgb(52 211 153 / 0.7)",
    panelBorderColor: "rgb(4 120 87 / 0.4)",
    headerColor: "rgb(110 231 183 / 0.9)",
    bodyColor: "rgb(236 253 245 / 0.95)",
    attackLabelColor: "rgb(209 250 229)",
  },
  RARE: {
    backgroundImage:
      "radial-gradient(circle at 50% -12%, rgba(253, 186, 116, 0.46), transparent 34%), linear-gradient(180deg, #b55f1d 0%, #7c3510 34%, #321004 68%, #0b0301 100%)",
    outerBorderClass: "border-orange-300/80",
    outerShadowClass: "shadow-[0_0_28px_rgba(234,88,12,0.4),inset_0_0_42px_rgba(0,0,0,0.68)]",
    innerBorderClass: "border-orange-50/50",
    innerShadowClass: "shadow-[0_0_16px_rgba(253,186,116,0.18),inset_0_0_18px_rgba(0,0,0,0.42)]",
    panelBorderClass: "border-orange-500/45",
    panelShadowClass: "shadow-[inset_0_1px_0_rgba(253,186,116,0.1)]",
    imageBorderClass: "border-orange-500/55",
    headerTextClass: "text-orange-200 drop-shadow-[0_0_8px_rgba(251,146,60,0.34)]",
    nameTextClass: "text-amber-100 drop-shadow-[0_0_9px_rgba(253,186,116,0.38)]",
    descriptionTextClass: "text-orange-50/95",
    dividerClass: "via-orange-200/50",
    dividerBorderClass: "border-orange-200/50",
    attackLabelClass: "text-orange-50",
    bodyTextClass: "text-orange-50/95",
    bulletClass: "bg-orange-200/75 shadow-[0_0_6px_rgba(253,186,116,0.4)]",
    bulletColor: "rgb(253 186 116 / 0.75)",
    outerBorderColor: "rgb(253 186 116 / 0.8)",
    panelBorderColor: "rgb(249 115 22 / 0.45)",
    headerColor: "rgb(254 215 170 / 0.9)",
    bodyColor: "rgb(255 247 237 / 0.95)",
    attackLabelColor: "rgb(255 237 213)",
  },
  LEGENDARY: {
    backgroundImage:
      "radial-gradient(circle at 50% -12%, rgba(239, 104, 48, 0.42), transparent 34%), linear-gradient(180deg, #7f2115 0%, #3a120d 34%, #170906 68%, #070302 100%)",
    outerBorderClass: "border-amber-500/70",
    outerShadowClass: "shadow-[0_0_28px_rgba(120,32,8,0.42),inset_0_0_42px_rgba(0,0,0,0.72)]",
    innerBorderClass: "border-amber-200/45",
    innerShadowClass: "shadow-[0_0_16px_rgba(251,191,36,0.14),inset_0_0_18px_rgba(0,0,0,0.45)]",
    panelBorderClass: "border-amber-700/40",
    panelShadowClass: "shadow-[inset_0_1px_0_rgba(251,191,36,0.08)]",
    imageBorderClass: "border-amber-700/50",
    headerTextClass: "text-amber-300",
    nameTextClass: "text-amber-200",
    descriptionTextClass: "text-orange-100/85",
    dividerClass: "via-amber-400/50",
    dividerBorderClass: "border-amber-400/45",
    attackLabelClass: "text-amber-100",
    bodyTextClass: "text-orange-50/90",
    bulletClass: "bg-amber-300/70 shadow-[0_0_6px_rgba(251,191,36,0.35)]",
    bulletColor: "rgb(252 211 77 / 0.7)",
    outerBorderColor: "rgb(245 158 11 / 0.7)",
    panelBorderColor: "rgb(180 83 9 / 0.4)",
    headerColor: "rgb(252 211 77 / 0.82)",
    bodyColor: "rgb(255 247 237 / 0.9)",
    attackLabelColor: "rgb(254 243 199)",
  },
  MYTHIC: {
    backgroundImage:
      "radial-gradient(circle at 50% -12%, rgba(103, 232, 249, 0.42), transparent 34%), linear-gradient(180deg, #14566a 0%, #0b3448 34%, #061827 68%, #020710 100%)",
    outerBorderClass: "border-cyan-300/75",
    outerShadowClass: "shadow-[0_0_28px_rgba(14,116,144,0.44),inset_0_0_42px_rgba(0,0,0,0.72)]",
    innerBorderClass: "border-cyan-100/45",
    innerShadowClass: "shadow-[0_0_16px_rgba(103,232,249,0.16),inset_0_0_18px_rgba(0,0,0,0.45)]",
    panelBorderClass: "border-cyan-700/40",
    panelShadowClass: "shadow-[inset_0_1px_0_rgba(103,232,249,0.08)]",
    imageBorderClass: "border-cyan-700/50",
    headerTextClass: "text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.38)]",
    nameTextClass: "text-sky-200 drop-shadow-[0_0_10px_rgba(125,211,252,0.48)]",
    descriptionTextClass: "text-white/95",
    dividerClass: "via-sky-100/55",
    dividerBorderClass: "border-sky-100/55",
    attackLabelClass: "text-sky-50",
    bodyTextClass: "text-sky-50/95",
    bulletClass: "bg-sky-100/80 shadow-[0_0_7px_rgba(186,230,253,0.45)]",
    bulletColor: "rgb(224 242 254 / 0.8)",
    outerBorderColor: "rgb(103 232 249 / 0.75)",
    panelBorderColor: "rgb(14 116 144 / 0.4)",
    headerColor: "rgb(103 232 249 / 0.9)",
    bodyColor: "rgb(255 255 255 / 0.95)",
    attackLabelColor: "rgb(240 249 255)",
  },
};

export function getForgeRarityPalette(rarity: string | null | undefined): ForgeItemRarityPalette {
  const key = String(rarity ?? "").trim().toUpperCase();
  return RARITY_PALETTES[key] ?? RARITY_PALETTES.COMMON;
}
