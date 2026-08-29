// The app's icon language: white line-work only, no fills, no colour.
//
// Steven's call on the mockup (2026-08-06): "icons white outline only, no
// colours, keep it simple." Colour stays reserved for meaning — the wiring-code
// status colours — and the Mr Sparky yellow marks exactly one thing, the
// active tab. Geometry matches the approved design artifact stroke for stroke.
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { C } from "../lib/theme";

const SHAPES = {
  wrench: [
    <Path key="a" d="M14.5 6.5a4 4 0 0 0-5.3 5L4 16.7 7.3 20l5.2-5.2a4 4 0 0 0 5-5.3l-2.6 2.6-2.4-.6-.6-2.4z" />,
  ],
  mic: [
    <Rect key="a" x="9.2" y="3.5" width="5.6" height="10" rx="2.8" />,
    <Path key="b" d="M6 11.5a6 6 0 0 0 12 0" />,
    <Path key="c" d="M12 17.5v3" />,
  ],
  dollar: [
    <Circle key="a" cx="12" cy="12" r="8.5" />,
    <Path key="b" d="M12 7.5v9M14.6 9.2c-2.4-1.6-5.2-.6-5.2 1.3 0 2.6 5.2 1.6 5.2 4.1 0 1.9-2.8 2.9-5.2 1.3" />,
  ],
  board: [
    <Rect key="a" x="5" y="4.5" width="14" height="16" rx="2.5" />,
    <Path key="b" d="M9.5 4.5V3h5v1.5" />,
    <Path key="c" d="M9 10h6M9 13.5h6M9 17h3.5" />,
  ],
  claims: [
    <Rect key="a" x="5" y="3.5" width="14" height="17" rx="2.5" />,
    <Path key="b" d="M9 8.5h6M9 12h6M9 15.5h3.5" />,
  ],
  receipt: [
    <Path key="a" d="M6 3.5h12v17l-2.4-1.7-2.4 1.7-2.4-1.7-2.4 1.7-2.4-1.7z" />,
    <Path key="b" d="M9 8.5h6M9 12h6" />,
  ],
  chart: [
    <Path key="a" d="M4 20h16" />,
    <Path key="b" d="M7 16.5v-5M12 16.5V7.5M17 16.5v-7" />,
  ],
  bank: [
    <Path key="a" d="M4 9.5 12 4l8 5.5" />,
    <Path key="b" d="M5.5 9.5v7M10 9.5v7M14 9.5v7M18.5 9.5v7" />,
    <Path key="c" d="M4 19.5h16" />,
  ],
  trend: [
    <Path key="a" d="M4 17.5 10 11l3.5 3.5L20 7.5" />,
    <Path key="b" d="M15.5 7.5H20V12" />,
  ],
  tools: [
    <Path key="a" d="M14.5 6.5a4 4 0 0 1 5-5l-2.6 2.6 1 2.5 2.5 1L23 5" transform="translate(-2.5 1.5)" />,
    <Path key="b" d="m10.5 10.5-6 6a2 2 0 0 0 2.8 2.8l6-6" />,
    <Circle key="c" cx="6" cy="17.8" r=".4" />,
  ],
  idcard: [
    <Rect key="a" x="3.5" y="5.5" width="17" height="13" rx="2.5" />,
    <Circle key="b" cx="9" cy="11" r="1.8" />,
    <Path key="c" d="M6.5 15.6c.5-1.5 4.5-1.5 5 0" />,
    <Path key="d" d="M14.5 10h3.5M14.5 13.5h3.5" />,
  ],
  person: [
    <Circle key="a" cx="12" cy="8.5" r="3.2" />,
    <Path key="b" d="M5.5 19.5c.8-3.6 12.2-3.6 13 0" />,
  ],
  camera: [
    <Rect key="a" x="3.5" y="7" width="17" height="12.5" rx="2.5" />,
    <Path key="b" d="M8.5 7l1.5-2.5h4L15.5 7" />,
    <Circle key="c" cx="12" cy="13" r="3.2" />,
  ],
  approve: [
    <Circle key="a" cx="12" cy="12" r="8.5" />,
    <Path key="b" d="M8.5 12.2l2.4 2.4 4.6-5" />,
  ],
  topay: [
    <Rect key="a" x="3.5" y="6" width="17" height="12" rx="2.5" />,
    <Path key="b" d="M3.5 10h17" />,
    <Path key="c" d="M7 14.5h4" />,
  ],
  reject: [
    <Circle key="a" cx="12" cy="12" r="8.5" />,
    <Path key="b" d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />,
  ],
  archive: [
    <Rect key="a" x="4" y="4.5" width="16" height="5" rx="1.5" />,
    <Path key="b" d="M5.5 9.5v8a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-8" />,
    <Path key="c" d="M10 13h4" />,
  ],
  spark: [
    <Path key="a" d="M13 2.5 5.5 13.5h5L11 21.5l7.5-11h-5z" />,
  ],
  // Claude's starburst, in the app's line-work language.
  claude: [
    <Path key="a" d="M12 2.5v6M12 15.5v6M2.5 12h6M15.5 12h6" />,
    <Path key="b" d="M5.3 5.3l4.2 4.2M14.5 14.5l4.2 4.2M18.7 5.3l-4.2 4.2M9.5 14.5l-4.2 4.2" />,
  ],
  people: [
    <Circle key="a" cx="9" cy="9" r="2.8" />,
    <Path key="b" d="M3.8 18.5c.6-3 9.8-3 10.4 0" />,
    <Circle key="c" cx="17" cy="9.5" r="2.2" />,
    <Path key="d" d="M15.5 14.6c2.5-.4 4.6.9 5 3.9" />,
  ],
};

export default function Icon({ name, size = 22, color = C.ink, strokeWidth = 1.7 }) {
  const shapes = SHAPES[name];
  if (!shapes) return null;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes}
    </Svg>
  );
}
