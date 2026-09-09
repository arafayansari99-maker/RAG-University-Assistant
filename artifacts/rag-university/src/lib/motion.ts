import type { Variants } from "framer-motion";

/** Re-exported so pages can branch on the OS setting without importing framer-motion. */
export { useReducedMotion } from "framer-motion";

/** One easing + two durations for the whole app. Reading app, not a landing page. */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const BASE = { duration: 0.22, ease: EASE };
const FAST = { duration: 0.15, ease: EASE };

/** Shared transition for ad-hoc `motion` props and `layoutId` indicators. */
export const motionTransition = BASE;

/** Section entrance: page headers, panels, cards that appear on their own. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: BASE },
};

/** Parent-only wrapper that cascades its children: message list, document grid. */
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

/** Child of `stagger`: one message bubble, document card, or session row. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: BASE },
  exit: { opacity: 0, y: -6, transition: FAST },
};

/** Grows from center: badges, confidence rings, popovers, dropzone feedback. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: BASE },
  exit: { opacity: 0, scale: 0.96, transition: FAST },
};

/** Right-edge panels: citation drawer, document preview, mobile sheets. */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: BASE },
  exit: { opacity: 0, x: 24, transition: FAST },
};

/** Looping in-flight state: `processing` badges, streaming caret, skeletons. */
export const pulse: Variants = {
  visible: {
    opacity: [1, 0.45, 1],
    transition: { duration: 1.4, ease: "easeInOut", repeat: Infinity },
  },
};
