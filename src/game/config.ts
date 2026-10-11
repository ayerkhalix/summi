export const BRAND = {
  name: "SUMMIN",
  tagline: "Know the deck. Play the odds.",
};
export const RULES = {
  2: { target: [80, 150], initial: [8, 15] },
  3: { target: [55, 110], initial: [6, 10] },
  4: { target: [40, 85], initial: [5, 7] },
  5: { target: [30, 70], initial: [4, 5] },
} as const;
export type PlayerCount = keyof typeof RULES;
// Solo is a separate practice mode using the two-player target/hand ranges.
export const rulesFor = (count: number) =>
  RULES[(count === 1 ? 2 : count) as PlayerCount];
export const FIRST_ADDITION_MAX = 3;
export const secondCap = (received: number) => Math.floor(received / 2);
export const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
export const TIMING = {
  automaticPhase: 1200,
  heartbeat: 5000,
  stale: 20000,
  reconnect: 90000,
};
// Presentation choices, independent of the official rules above.
export const MOTION = {
  deal: 0.42,
  flip: 0.42,
  dealStagger: 0.022,
  maxStagger: 0.7,
  resultStagger: 0.12,
};
export const PHASES = [
  "burn",
  "initial_selection",
  "initial_deal",
  "first_reveal",
  "first_additions",
  "second_reveal",
  "second_additions",
  "final_reveal",
  "round_results",
] as const;
export const PHASE_LABELS: Record<(typeof PHASES)[number], string> = {
  burn: "The burn",
  initial_selection: "Choose your hand",
  initial_deal: "Dealing",
  first_reveal: "First reveal",
  first_additions: "First addition",
  second_reveal: "Second reveal",
  second_additions: "Final addition",
  final_reveal: "Final reveal",
  round_results: "The results",
};
