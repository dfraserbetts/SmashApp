"use client";

import type { RadarAxes } from "@/lib/calculators/monsterOutcomeCalculator";

type Props = {
  axes: RadarAxes;
  backgroundAxes?: RadarAxes | null;
  size?: number;
};

const AXES: { key: keyof RadarAxes; labelLines: string[] }[] = [
  { key: "physicalThreat", labelLines: ["Physical", "Threat"] },
  { key: "mentalThreat", labelLines: ["Mental", "Threat"] },
  { key: "physicalSurvivability", labelLines: ["Physical", "Survivability"] },
  { key: "mentalSurvivability", labelLines: ["Mental", "Survivability"] },
  { key: "manipulation", labelLines: ["Control", "Pressure"] },
  { key: "synergy", labelLines: ["Synergy"] },
  { key: "mobility", labelLines: ["Mobility"] },
  { key: "presence", labelLines: ["Pressure"] },
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

export function OutcomeRadar({ axes, backgroundAxes, size = 312 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  // Reserve a real label gutter so long axis names stay inside the SVG
  // instead of colliding with the outer ring.
  const labelGutter = 58;
  const radius = Math.max(48, cx - labelGutter);
  const labelRadius = radius + 24;

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
          const labelPos = toPoint(cx, cy, labelRadius, angle);
          const labelLines = AXES[i].labelLines;
          const firstLineY = labelPos.y - ((labelLines.length - 1) * 5) / 2;
          return (
            <text
              key={`label-${i}`}
              x={labelPos.x}
              y={firstLineY}
              textAnchor="middle"
              fontSize="9"
              className="fill-zinc-400"
            >
              {labelLines.map((line, lineIndex) => (
                <tspan
                  key={`${AXES[i].key}-${lineIndex}`}
                  x={labelPos.x}
                  dy={lineIndex === 0 ? 0 : 10}
                >
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
