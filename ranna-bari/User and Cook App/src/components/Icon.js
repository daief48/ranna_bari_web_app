/**
 * Icon set ported verbatim from the generated SVG sprite in the HTML build.
 * Path data is byte-for-byte identical -- these are the same 45 glyphs, drawn
 * through react-native-svg instead of <use href="#i-...">.
 *
 * Stroke defaults mirror the .ico rule: currentColor stroke, no fill,
 * 1.75 width, round caps and joins.
 */

import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

const TAGS = { path: Path, circle: Circle, rect: Rect, line: Line, polyline: Polyline, polygon: Polygon };

export const ICONS = {
  activity: [
    ["path", {"d":"M21.5 12h-4l-3 8.2L9.5 3.8l-3 8.2h-4"}],
  ],
  alertCircle: [
    ["circle", {"cx":"12","cy":"12","r":"9"}],
    ["path", {"d":"M12 7.6v5.2"}],
    ["circle", {"cx":"12","cy":"16.4","r":".9","fill":"currentColor","stroke":"none"}],
  ],
  arrowLeft: [
    ["path", {"d":"M19.5 12h-15M10.5 18l-6-6 6-6"}],
  ],
  arrowRight: [
    ["path", {"d":"M4.5 12h15M13.5 6l6 6-6 6"}],
  ],
  banknote: [
    ["rect", {"x":"2.5","y":"6.4","width":"19","height":"11.2","rx":"2.4"}],
    ["circle", {"cx":"12","cy":"12","r":"2.7"}],
    ["path", {"d":"M6.2 11.3v1.4M17.8 11.3v1.4"}],
  ],
  bell: [
    ["path", {"d":"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"}],
    ["path", {"d":"M13.73 21a2 2 0 0 1-3.46 0"}],
  ],
  /* A speech bubble with a tail. The inbox is the one place a customer and a
     cook actually talk, and nothing in this set said "talk" — bell is the
     platform announcing, phone is a call, and neither is a conversation. */
  chat: [
    ["path", {"d":"M20 14.4a2 2 0 0 1-2 2H9l-4 3.4V6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2Z"}],
    ["path", {"d":"M9 9.6h6"}],
    ["path", {"d":"M9 12.8h4"}],
  ],
  box: [
    ["path", {"d":"M20.8 8.6v6.8a1 1 0 0 1-.5.87l-7.8 4.4a1 1 0 0 1-1 0l-7.8-4.4a1 1 0 0 1-.5-.87V8.6a1 1 0 0 1 .5-.87l7.8-4.4a1 1 0 0 1 1 0l7.8 4.4a1 1 0 0 1 .5.87Z"}],
    ["path", {"d":"m3.5 8.2 8.5 4.8 8.5-4.8"}],
    ["path", {"d":"M12 21v-8"}],
  ],
  brand: [
    ["path", {"d":"M3.2 11.8h17.6a8.8 8.8 0 0 1-8.8 8.8 8.8 8.8 0 0 1-8.8-8.8Z"}],
    ["path", {"d":"M8.2 8.6c0-1.3.9-1.6.9-2.8M12 7.9c0-1.5 1-1.9 1-3.3M15.8 8.6c0-1.3.9-1.6.9-2.8"}],
  ],
  cart: [
    ["circle", {"cx":"9","cy":"20","r":"1.5"}],
    ["circle", {"cx":"18.5","cy":"20","r":"1.5"}],
    ["path", {"d":"M2.5 3h2.2l2.6 11.6a1.8 1.8 0 0 0 1.8 1.4h9a1.8 1.8 0 0 0 1.76-1.42L21.5 7H6"}],
  ],
  check: [
    ["path", {"d":"m4.5 12.5 5 5 10-11"}],
  ],
  chefHat: [
    ["path", {"d":"M6.4 17.2h11.2"}],
    ["path", {"d":"M17.6 20.4H6.4v-3.9c0-.6-.4-1.1-.9-1.4a4.4 4.4 0 0 1 2.3-8.3 5.2 5.2 0 0 1 9.4 0 4.4 4.4 0 0 1 2.3 8.3c-.5.3-.9.8-.9 1.4Z"}],
  ],
  chevronDown: [
    ["path", {"d":"m5.5 9 6.5 6.5L18.5 9"}],
  ],
  chevronRight: [
    ["path", {"d":"m9.5 5.5 6.5 6.5-6.5 6.5"}],
  ],
  clock: [
    ["circle", {"cx":"12","cy":"12","r":"9"}],
    ["path", {"d":"M12 6.8V12l3.4 2"}],
  ],
  delivery: [
    ["path", {"d":"M3 16.4V6.6a1.1 1.1 0 0 1 1.1-1.1h8.6a1.1 1.1 0 0 1 1.1 1.1v9.8"}],
    ["path", {"d":"M13.8 9.4h3.4l3.8 3.8v3.2"}],
    ["circle", {"cx":"7.2","cy":"18","r":"2.2"}],
    ["circle", {"cx":"17.4","cy":"18","r":"2.2"}],
    ["path", {"d":"M9.4 18h5.8"}],
  ],
  dessert: [
    ["path", {"d":"M5.6 13.2h12.8l-1.3 6.1a1.6 1.6 0 0 1-1.6 1.3H8.5a1.6 1.6 0 0 1-1.6-1.3Z"}],
    ["path", {"d":"M4.6 10.4a2.7 2.7 0 0 1 2.7-2.7A3.1 3.1 0 0 1 12.9 6a2.6 2.6 0 0 1 4 2.2v.2a2.7 2.7 0 0 1-.5 5.3H7.3a2.7 2.7 0 0 1-2.7-2.7Z"}],
  ],
  eye: [
    ["path", {"d":"M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z"}],
    ["circle", {"cx":"12","cy":"12","r":"3.2"}],
  ],
  eyeOff: [
    ["path", {"d":"M10.6 6.7a9.9 9.9 0 0 1 1.4-.1c6.2 0 10 5.4 10 5.4a17.6 17.6 0 0 1-3.3 3.9M6.3 7.8A17.4 17.4 0 0 0 2 12s3.8 5.4 10 5.4c1.6 0 3-.3 4.2-.8"}],
    ["path", {"d":"M9.8 9.9a3.1 3.1 0 0 0 4.3 4.3"}],
    ["path", {"d":"m3.5 3.5 17 17"}],
  ],
  fish: [
    ["path", {"d":"M16.8 12c0 3.3-3.3 6-7.4 6S2 15.3 2 12s3.3-6 7.4-6 7.4 2.7 7.4 6Z"}],
    ["path", {"d":"M16.8 12c1.7-.4 3.5-1.8 5.2-3.6v7.2c-1.7-1.8-3.5-3.2-5.2-3.6Z"}],
    ["circle", {"cx":"6.6","cy":"10.4","r":".9"}],
  ],
  flame: [
    ["path", {"d":"M12 21.5a6.6 6.6 0 0 0 6.6-6.6c0-5.1-4.6-6.6-4.6-11.2 0 0-2 2.5-2 5.1 0 0-1.5-1-1.5-3.05-2.05 2.05-5.1 4.6-5.1 9.15A6.6 6.6 0 0 0 12 21.5Z"}],
  ],
  gem: [
    ["path", {"d":"M6.2 3h11.6l3.7 5.8L12 21 2.5 8.8Z"}],
    ["path", {"d":"M2.5 8.8h19"}],
    ["path", {"d":"m8.2 3-2 5.8L12 21l5.8-12.2-2-5.8"}],
  ],
  home: [
    ["path", {"d":"M3 10.6 12 3l9 7.6"}],
    ["path", {"d":"M5.2 9.4V20a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V9.4"}],
    ["path", {"d":"M9.6 21v-6.2h4.8V21"}],
  ],
  leaf: [
    ["path", {"d":"M11 20.5A7.5 7.5 0 0 1 3.5 13C3.5 7.8 7.8 3.5 20.5 3.5c0 10.6-4.3 14.9-9.5 14.9Z"}],
    ["path", {"d":"M3.5 21c3.2-6.4 7-9.6 12.8-11.8"}],
  ],
  locate: [
    ["circle", {"cx":"12","cy":"12","r":"7"}],
    ["circle", {"cx":"12","cy":"12","r":"2.4"}],
    ["path", {"d":"M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22"}],
  ],
  lock: [
    ["rect", {"x":"4","y":"10.2","width":"16","height":"10.8","rx":"2.4"}],
    ["path", {"d":"M7.8 10.2V7a4.2 4.2 0 0 1 8.4 0v3.2"}],
  ],
  map: [
    ["path", {"d":"m3 6.2 6-3 6 3 6-3v14.6l-6 3-6-3-6 3Z"}],
    ["path", {"d":"M9 3.2v14.6M15 6.2v14.6"}],
  ],
  minus: [
    ["path", {"d":"M5.5 12h13"}],
  ],
  moon: [
    ["path", {"d":"M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"}],
  ],
  navigation: [
    ["path", {"d":"M20.8 3.2 3.6 10.6l7.5 2.3 2.3 7.5Z"}],
  ],
  phone: [
    ["path", {"d":"M21.5 16.9v2.6a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.7-2.8 17.5 17.5 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3.6 5.3a1.8 1.8 0 0 1 1.8-2H8a1.8 1.8 0 0 1 1.8 1.5c.1.9.3 1.7.7 2.5a1.8 1.8 0 0 1-.4 1.9l-1.1 1.1a14 14 0 0 0 5.4 5.4l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.6 2.5.7a1.8 1.8 0 0 1 1.5 1.8Z"}],
  ],
  pin: [
    ["path", {"d":"M20 10.2c0 5.7-8 11.8-8 11.8s-8-6.1-8-11.8a8 8 0 0 1 16 0Z"}],
    ["circle", {"cx":"12","cy":"10","r":"2.8"}],
  ],
  plus: [
    ["path", {"d":"M12 5.5v13M5.5 12h13"}],
  ],
  pot: [
    ["path", {"d":"M3.6 10.8h16.8v2.4a7.2 7.2 0 0 1-7.2 7.2h-2.4a7.2 7.2 0 0 1-7.2-7.2Z"}],
    ["path", {"d":"M2 10.8h20"}],
    ["path", {"d":"M9 7.4c0-1.2.9-1.5.9-2.6M14.1 7.4c0-1.2.9-1.5.9-2.6"}],
  ],
  receipt: [
    ["path", {"d":"M5.6 2.8h12.8v18.4l-2.13-1.5-2.14 1.5-2.13-1.5-2.14 1.5-2.13-1.5-2.13 1.5Z"}],
    ["path", {"d":"M9 8.4h6M9 12.6h6"}],
  ],
  route: [
    ["circle", {"cx":"6","cy":"18.5","r":"2.6"}],
    ["circle", {"cx":"18","cy":"5.5","r":"2.6"}],
    ["path", {"d":"M15.4 5.5H10a3.5 3.5 0 0 0 0 7h4a3.5 3.5 0 0 1 0 7H8.6"}],
  ],
  salad: [
    ["path", {"d":"M3.4 12.6h17.2a8.6 8.6 0 0 1-17.2 0Z"}],
    ["path", {"d":"M7.6 12.6a2.6 2.6 0 1 1 5.2 0"}],
    ["path", {"d":"M13.4 12.6a2.2 2.2 0 1 1 4.4 0"}],
    ["path", {"d":"M11 8.2c0-1.6 1.3-2.9 2.9-2.9"}],
  ],
  search: [
    ["circle", {"cx":"11","cy":"11","r":"7"}],
    ["path", {"d":"m20.5 20.5-4.2-4.2"}],
  ],
  searchCheck: [
    ["circle", {"cx":"11","cy":"11","r":"7"}],
    ["path", {"d":"m20.5 20.5-4.2-4.2"}],
    ["path", {"d":"m8.4 11 1.9 1.9 3.5-3.6"}],
  ],
  shield: [
    ["path", {"d":"M12 21.5s7.6-3.8 7.6-9.5V5.2L12 2.5 4.4 5.2V12c0 5.7 7.6 9.5 7.6 9.5Z"}],
  ],
  shieldCheck: [
    ["path", {"d":"M12 21.5s7.6-3.8 7.6-9.5V5.2L12 2.5 4.4 5.2V12c0 5.7 7.6 9.5 7.6 9.5Z"}],
    ["path", {"d":"m9 11.8 2.1 2.1 4.2-4.2"}],
  ],
  sliders: [
    ["path", {"d":"M4 6.5h8.5M17.5 6.5H20M4 12h3M12 12h8M4 17.5h8.5M17.5 17.5H20"}],
    ["circle", {"cx":"15","cy":"6.5","r":"2.2"}],
    ["circle", {"cx":"9.5","cy":"12","r":"2.2"}],
    ["circle", {"cx":"15","cy":"17.5","r":"2.2"}],
  ],
  sparkles: [
    ["path", {"d":"M12 3.2 13.85 8.15 18.8 10 13.85 11.85 12 16.8 10.15 11.85 5.2 10l4.95-1.85Z"}],
    ["path", {"d":"m18.4 15.6.75 2.05 2.05.75-2.05.75-.75 2.05-.75-2.05-2.05-.75 2.05-.75Z"}],
  ],
  sprout: [
    ["path", {"d":"M12 21v-8.4"}],
    ["path", {"d":"M12 12.6c0-3.4 2.8-6.2 6.2-6.2 0 3.4-2.8 6.2-6.2 6.2Z"}],
    ["path", {"d":"M12 14.6c0-2.9-2.3-5.2-5.2-5.2 0 2.9 2.3 5.2 5.2 5.2Z"}],
  ],
  star: [
    ["path", {"d":"m12 2.6 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.6l-5.88 3.09 1.12-6.55L2.48 9.5l6.58-.96Z"}],
  ],
  sun: [
    ["circle", {"cx":"12","cy":"12","r":"4"}],
    ["path", {"d":"M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"}],
  ],
  user: [
    ["path", {"d":"M20 21v-1.8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V21"}],
    ["circle", {"cx":"12","cy":"7.5","r":"4"}],
  ],
  utensils: [
    ["path", {"d":"M6 2.8v7.4a2.6 2.6 0 0 0 5.2 0V2.8"}],
    ["path", {"d":"M8.6 10.4v10.8"}],
    ["path", {"d":"M18.2 2.8c-1.5 1.1-2.2 3.2-2.2 5.8 0 1.7.75 2.6 2.2 2.6Z"}],
    ["path", {"d":"M18.2 11.2v10"}],
  ],
  x: [
    ["path", {"d":"M18 6 6 18M6 6l12 12"}],
  ],
};

export const ICON_NAMES = Object.keys(ICONS);

/**
 * @param {object} props
 * @param {string} props.name          sprite id, minus the "i-" prefix
 * @param {number} [props.size]        box size in px (the CSS .ico is 1.25em)
 * @param {string} [props.color]       resolves currentColor
 * @param {number} [props.strokeWidth]
 * @param {string} [props.fill]        filled glyphs (stars) pass a colour
 */
export default function Icon({
  name,
  size = 20,
  color = '#000',
  strokeWidth = 1.75,
  fill = 'none',
  style,
}) {
  const elements = ICONS[name];
  if (!elements) {
    if (__DEV__) console.warn('<Icon> unknown name: ' + name);
    return null;
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      color={color}
    >
      {elements.map(([tag, attrs], i) => {
        const Tag = TAGS[tag];
        return (
          <Tag
            key={i}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={fill}
            {...attrs}
          />
        );
      })}
    </Svg>
  );
}
