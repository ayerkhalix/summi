export const PLAYER_ICONS = ["spades", "hearts", "diamonds", "clubs", "jack", "queen", "king"] as const;
export type PlayerProfile = { icon: (typeof PLAYER_ICONS)[number]; color: string };
export const ICON_LABELS: Record<PlayerProfile["icon"], string> = {
  spades: "Spades", hearts: "Hearts", diamonds: "Diamonds", clubs: "Clubs",
  jack: "Jack", queen: "Queen", king: "King",
};
export const PROFILE_COLORS = ["#D12C50", "#7650A8", "#B85B76", "#F4F0F3", "#D4A65C", "#719FBB"];
export const DEFAULT_PROFILE: PlayerProfile = { icon: "spades", color: "#B85B76" };
