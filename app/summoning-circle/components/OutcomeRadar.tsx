"use client";

import { useId } from "react";

import type { RadarAxes } from "@/lib/calculators/monsterOutcomeCalculator";

type Props = {
  axes: RadarAxes;
  backgroundAxes?: RadarAxes | null;
  size?: number;
};

const AXES: {
  key: keyof RadarAxes;
  labelLines: string[];
  description?: string;
}[] = [
  {
    key: "physicalSurvivability",
    labelLines: ["Physical", "Survivability"],
    description:
      "Physical durability compared with the expected defensive package for this creature's level, tier, and Legendary state.",
  },
  {
    key: "physicalThreat",
    labelLines: ["Physical", "Threat"],
    description:
      "Physical offence compared with the expected output for this creature's level and tier.",
  },
  {
    key: "mentalThreat",
    labelLines: ["Mental", "Threat"],
    description:
      "Mental offence compared with the expected output for this creature's level and tier.",
  },
  {
    key: "mentalSurvivability",
    labelLines: ["Mental", "Survivability"],
    description:
      "Mental durability compared with the expected defensive package for this creature's level, tier, and Legendary state.",
  },
  { key: "manipulation", labelLines: ["Control", "Pressure"] },
  { key: "synergy", labelLines: ["Synergy"] },
  { key: "mobility", labelLines: ["Mobility"] },
  { key: "presence", labelLines: ["Pressure"] },
];

const AXIS_CAP_WARNING_THRESHOLD = 9.9;
const AXIS_CAP_WARNING_START_RATIO = 0.5;

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isAxisAtCap(value: number | null | undefined) {
  return Number.isFinite(value) && Number(value) > AXIS_CAP_WARNING_THRESHOLD;
}

function toPoint(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function scalePointFromCenter(
  point: { x: number; y: number },
  cx: number,
  cy: number,
  ratio: number,
) {
  return {
    x: cx + (point.x - cx) * ratio,
    y: cy + (point.y - cy) * ratio,
  };
}

function buildPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  return `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;
}

export function OutcomeRadar({ axes, backgroundAxes, size = 312 }: Props) {
  const gradientIdPrefix = useId().replace(/:/g, "");
  const cx = size / 2;
  const cy = size / 2;
  // Reserve a real label gutter so long axis names stay inside the SVG
  // instead of colliding with the outer ring.
  const labelGutter = 58;
  const radius = Math.max(48, cx - labelGutter);
  const labelRadius = radius + 24;

  const angles = AXES.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length);

  const rings = [0.25, 0.5, 0.75, 1];
  const fgPoints = AXES.map((axis, i) => {
    const score = clamp01((axes[axis.key] ?? 0) / 10);
    return toPoint(cx, cy, radius * score, angles[i]);
  });
  const cappedAxes = AXES.map((axis, i) => ({
    ...axis,
    angle: angles[i],
    index: i,
  })).filter((axis) => isAxisAtCap(axes[axis.key]));

  const fgPath = buildPath(fgPoints);

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
        <defs>
          <clipPath id={`${gradientIdPrefix}-radar-fill-clip`}>
            <path d={fgPath} />
          </clipPath>
          {cappedAxes.map((axis) => {
            const start = toPoint(
              cx,
              cy,
              radius * AXIS_CAP_WARNING_START_RATIO,
              axis.angle,
            );
            const end = toPoint(cx, cy, radius, axis.angle);
            return (
              <linearGradient
                key={`cap-gradient-${axis.key}`}
                id={`${gradientIdPrefix}-${axis.key}-cap-gradient`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
                <stop offset="58%" stopColor="#f59e0b" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.95" />
              </linearGradient>
            );
          })}
        </defs>

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

        <path d={fgPath} className="fill-emerald-500/20" />

        <g clipPath={`url(#${gradientIdPrefix}-radar-fill-clip)`} aria-hidden="true">
          {cappedAxes.map((axis) => {
            const prevPoint = fgPoints[(axis.index - 1 + fgPoints.length) % fgPoints.length];
            const axisPoint = fgPoints[axis.index];
            const nextPoint = fgPoints[(axis.index + 1) % fgPoints.length];
            const path = buildPath([
              prevPoint,
              axisPoint,
              nextPoint,
              scalePointFromCenter(nextPoint, cx, cy, AXIS_CAP_WARNING_START_RATIO),
              scalePointFromCenter(axisPoint, cx, cy, AXIS_CAP_WARNING_START_RATIO),
              scalePointFromCenter(prevPoint, cx, cy, AXIS_CAP_WARNING_START_RATIO),
            ]);
            return (
              <path
                key={`cap-highlight-${axis.key}`}
                d={path}
                fill={`url(#${gradientIdPrefix}-${axis.key}-cap-gradient)`}
                opacity={0.9}
              />
            );
          })}
        </g>

        <path d={fgPath} className="fill-none stroke-emerald-400" strokeWidth={2} />

        {cappedAxes.map((axis) => {
          const end = toPoint(cx, cy, radius, axis.angle);
          return (
            <g key={`cap-tip-${axis.key}`} aria-hidden="true">
              <circle
                cx={end.x}
                cy={end.y}
                r={5}
                className="fill-red-500 stroke-red-200"
                strokeWidth={1.5}
              />
            </g>
          );
        })}

        {angles.map((angle, i) => {
          const labelPos = toPoint(cx, cy, labelRadius, angle);
          const axis = AXES[i];
          const labelLines = axis.labelLines;
          const firstLineY = labelPos.y - ((labelLines.length - 1) * 5) / 2;
          const isCapped = isAxisAtCap(axes[axis.key]);
          return (
            <text
              key={`label-${i}`}
              x={labelPos.x}
              y={firstLineY}
              textAnchor="middle"
              fontSize="9"
              className={isCapped ? "fill-red-400 font-semibold" : "fill-zinc-400"}
              aria-label={
                axis.description
                  ? `${labelLines.join(" ")}: ${axis.description}`
                  : labelLines.join(" ")
              }
            >
              {axis.description && <title>{axis.description}</title>}
              {labelLines.map((line, lineIndex) => (
                <tspan
                  key={`${axis.key}-${lineIndex}`}
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
