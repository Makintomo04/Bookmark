import Svg, { Path } from "react-native-svg";
import { brand } from "@bookmark/shared/tokens";

// The Bookmark mark, from apps/web/public/logo.svg. Always the brand red.
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={(size * 31) / 30} viewBox="0 0 30 31" accessibilityLabel="Bookmark">
      <Path
        d="M25.5097 30.5354L4.94348 30.536C2.73429 30.5361 0.943359 28.7452 0.943359 26.536L0.943358 4.61413C0.943358 2.40504 2.73414 0.614201 4.94324 0.614134L25.5092 0.613509C28.7291 0.613412 30.6295 4.22392 28.8065 6.87812L24.3892 13.3096C23.4521 14.6739 23.4521 16.4745 24.3892 17.8388L28.8068 24.2708C30.6297 26.9249 28.7296 30.5353 25.5097 30.5354Z"
        fill={brand.DEFAULT}
      />
    </Svg>
  );
}
