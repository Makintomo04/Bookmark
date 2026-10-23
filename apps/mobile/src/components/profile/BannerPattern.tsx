import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import type { BannerPresetId } from "@bookmark/shared/banners";
import { shade } from "@bookmark/shared/colour";

// The preset profile banners, drawn in the reader's colour. A port of the web's
// app/components/profile/BannerPattern.tsx: same shapes, same 1200x400 canvas, sliced to fill.

type Tones = { base: string; light: string; lighter: string; dark: string };

const W = 1200;
const H = 400;

type TileShape = "quarter" | "half" | "circle" | "triangle" | null;

const TILE_LAYOUT: TileShape[][] = [
  [null, null, "half", "quarter", null, "circle", "triangle"],
  [null, null, "circle", "triangle", "half", "quarter", "circle"],
  [null, null, "quarter", null, "circle", "half", null],
];

function tilePath(shape: Exclude<TileShape, null>, x: number, y: number, s: number) {
  const h = s / 2;
  if (shape === "quarter") return `M${x} ${y} H${x + s} A ${s} ${s} 0 0 1 ${x} ${y + s} Z`;
  if (shape === "half") return `M${x} ${y + s} A ${h} ${h} 0 0 1 ${x + s} ${y + s} Z`;
  if (shape === "circle") return `M${x} ${y + h} A ${h} ${h} 0 1 0 ${x + s} ${y + h} A ${h} ${h} 0 1 0 ${x} ${y + h} Z`;
  return `M${x} ${y} H${x + s} V${y + s} Z`;
}

function Flower({ cx, cy, length, width, back, front, centre }: { cx: number; cy: number; length: number; width: number; back: string; front: string; centre: string }) {
  const petal = `M${cx} ${cy} Q ${cx + width} ${cy - length / 2} ${cx} ${cy - length} Q ${cx - width} ${cy - length / 2} ${cx} ${cy} Z`;
  return (
    <G>
      {[0, 90, 180, 270].map((a) => <Path key={`b${a}`} d={petal} fill={back} transform={`rotate(${a} ${cx} ${cy})`} />)}
      {[45, 135, 225, 315].map((a) => <Path key={`f${a}`} d={petal} fill={front} transform={`rotate(${a} ${cx} ${cy})`} />)}
      <Circle cx={cx} cy={cy} r={length * 0.22} fill={centre} />
    </G>
  );
}

const PATTERNS: Record<BannerPresetId, (t: Tones) => ReactNode> = {
  plain: () => null,
  arches: (t) => (
    <G>
      <Circle cx="760" cy="420" r="300" fill={t.dark} />
      <Circle cx="760" cy="420" r="230" fill={t.light} />
      <Circle cx="760" cy="420" r="160" fill={t.lighter} />
      <Circle cx="760" cy="420" r="90" fill={t.base} />
    </G>
  ),
  orbit: (t) => (
    <G>
      <Circle cx="820" cy="200" r="170" fill={t.light} />
      <Circle cx="880" cy="160" r="90" fill={t.lighter} />
      <Circle cx="560" cy="250" r="42" fill={t.dark} />
    </G>
  ),
  waves: (t) => (
    <G>
      <Path d={`M0 210 C 200 130, 400 130, 600 210 S 1000 290, 1200 210 V${H} H0 Z`} fill={t.light} />
      <Path d={`M0 270 C 200 190, 400 190, 600 270 S 1000 350, 1200 270 V${H} H0 Z`} fill={t.dark} />
    </G>
  ),
  tiles: (t) => {
    const size = 180;
    const tones = [t.light, t.dark, t.lighter];
    return (
      <G>
        {TILE_LAYOUT.flatMap((row, r) =>
          row.map((shape, c) => (shape ? <Path key={`${r}-${c}`} d={tilePath(shape, c * size - 60, r * size - 70, size)} fill={tones[(r + c) % tones.length]} /> : null)),
        )}
      </G>
    );
  },
  bloom: (t) => (
    <G>
      <Flower cx={820} cy={205} length={165} width={78} back={t.dark} front={t.light} centre={t.lighter} />
      <Flower cx={555} cy={275} length={62} width={30} back={t.light} front={t.lighter} centre={t.dark} />
    </G>
  ),
};

// Fills its parent; give the parent a size and overflow hidden.
export function BannerPattern({ preset, colour }: { preset: BannerPresetId; colour: string }) {
  const tones: Tones = { base: colour, light: shade(colour, 0.28), lighter: shade(colour, 0.5), dark: shade(colour, -0.22) };
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <Rect x="0" y="0" width={W} height={H} fill={colour} />
      {PATTERNS[preset](tones)}
    </Svg>
  );
}
