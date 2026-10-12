"use client";
import type { CSSProperties } from "react";
import { DEFAULT_PROFILE, ICON_LABELS, PLAYER_ICONS, PROFILE_COLORS, type PlayerProfile } from "@/game/profile";
import { Suit } from "./card";

export function Avatar({ name, profile = DEFAULT_PROFILE, streak = 0 }: {
  name: string; profile?: PlayerProfile; streak?: number;
}) {
  const suit = ["spades", "hearts", "diamonds", "clubs"].includes(profile.icon);
  return <span className={`avatar player-avatar ${streak >= 3 ? "streak-avatar" : ""}`}
    style={{ "--player-color": profile.color } as CSSProperties}
    role="img" aria-label={`${name}: ${ICON_LABELS[profile.icon]} icon${streak >= 3 ? `, ${streak} round winning streak` : ""}`}>
    {suit ? <Suit suit={profile.icon as "spades" | "hearts" | "diamonds" | "clubs"} /> : <b>{({ jack: "J", queen: "Q", king: "K" })[profile.icon as "jack" | "queen" | "king"]}</b>}
    {streak >= 3 && <small>{streak}</small>}
  </span>;
}

export function ProfilePicker({ value, onChange }: { value: PlayerProfile; onChange: (profile: PlayerProfile) => void }) {
  return <fieldset className="profile-picker">
    <legend>Your player icon</legend>
    <div className="icon-options">
      {PLAYER_ICONS.map((icon) => <button type="button" key={icon} aria-label={`${ICON_LABELS[icon]} icon`}
        aria-pressed={value.icon === icon} className={`icon-option ${value.icon === icon ? "selected" : ""}`}
        onClick={() => onChange({ ...value, icon })}>
        <Avatar name={ICON_LABELS[icon]} profile={{ ...value, icon }} />
      </button>)}
    </div>
    <div className="profile-colors">
      {PROFILE_COLORS.map((color) => <button type="button" key={color} className="color-swatch"
        aria-label={`Icon color ${color}`} aria-pressed={value.color.toUpperCase() === color}
        style={{ backgroundColor: color }} onClick={() => onChange({ ...value, color })} />)}
      <label>Custom color<input aria-label="Custom icon color" type="color" value={value.color} onChange={(event) => onChange({ ...value, color: event.target.value })} /></label>
    </div>
  </fieldset>;
}
