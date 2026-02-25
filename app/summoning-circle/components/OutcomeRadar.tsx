"use client";

import type { RadarAxes } from "@/lib/calculators/monsterOutcomeCalculator";

type Props = {
  axes: RadarAxes;
  backgroundAxes?: RadarAxes | null;
  size?: number;
};

const AXES: { key: keyof RadarAxes; label: string }[] = [
  { key: "physicalThreat", label: "Phys" },
  { key: "mentalThreat", label: "Ment" },
  { key: "survivability", label: "Surv" },
  { key: "manipulation", label: "Ctrl" },
  { key: "synergy", label: "Syn" },
  { key: "mobility", label: "Mob" },
  { key: "presence", label: "Pres" },
];

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toPoint(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function buildPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  return `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
}

export function OutcomeRadar({ axes, backgroundAxes, size = 240 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const padding = 20;
  const radius = cx - padding;

  const angles = AXES.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length);

  const rings = [0.25, 0.5, 0.75, 1];

  const fgPath = buildPath(
    AXES.map((axis, i) => {
      const score = clamp01((axes[axis.key] ?? 0) / 10);
      return toPoint(cx, cy, radius * score, angles[i]);
    }),
  );

  const bgPath =
    backgroundAxes &&
    buildPath(
      AXES.map((axis, i) => {
        const score = clamp01((backgroundAxes[axis.key] ?? 0) / 10);
        return toPoint(cx, cy, radius * score, angles[i]);
      }),
    );

  return (
    <div className="flex justify-center">
      <svg width={size} height={size}>
        {rings.map((r) => (
          <circle key={r} cx={cx} cy={cy} r={radius * r} fill="none" className="stroke-zinc-800" />
        ))}

        {angles.map((angle, i) => {
          const end = toPoint(cx, cy, radius, angle);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              className="stroke-zinc-800"
            />
          );
        })}

        {bgPath && <path d={bgPath} className="fill-zinc-700/20 stroke-zinc-600/60" />}

        <path d={fgPath} className="fill-emerald-500/20 stroke-emerald-400" strokeWidth={2} />

        {angles.map((angle, i) => {
          const labelPos = toPoint(cx, cy, radius + 12, angle);
          return (
            <text
              key={`label-${i}`}
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              className="fill-zinc-400"
            >
              {AXES[i].label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
