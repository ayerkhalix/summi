"use client";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { Card } from "@/game/types";
import { PlayingCard, rankLabel } from "./card";
import { Modal } from "./dialogs";

export function InspectableCard({ card, isPublic = true, label, delay = 0 }: {
  card: Card | null; isPublic?: boolean; label: string; delay?: number;
}) {
  const face = isPublic ? card : null;
  const description = face
    ? `${rankLabel(face.rank)} of ${face.suit} · value ${face.value}`
    : "Hidden card · unknown until its reveal";
  const id = useId();
  const [preview, setPreview] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", escape);
    };
  }, [preview]);
  const show = (element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect();
    setPreview({
      left: Math.max(12, Math.min(innerWidth - 192, rect.left + rect.width / 2 - 90)),
      top: Math.max(12, Math.min(innerHeight - 284, rect.top >= 284 ? rect.top - 280 : rect.bottom + 10)),
    });
  };
  return <>
    <button type="button" className="card-inspect-button"
      aria-label={`Inspect ${label}: ${description}`}
      aria-haspopup="dialog" aria-describedby={preview && !open ? id : undefined}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") show(event.currentTarget); }}
      onPointerLeave={() => setPreview(null)}
      onFocus={(event) => show(event.currentTarget)} onBlur={() => setPreview(null)}
      onClick={() => { setPreview(null); setOpen(true); }}>
      <PlayingCard card={face} faceUp={!!face} isPublic={!!face} size="small" delay={delay} />
    </button>
    {preview && !open && createPortal(
      <div id={id} className="card-preview" role="tooltip" style={preview}>
        <PlayingCard card={face} faceUp={!!face} isPublic={!!face} silent />
        <span>{description}</span>
      </div>, document.body,
    )}
    {open && <Modal title={label} onClose={() => setOpen(false)}>
      <div className="card-inspection">
        <PlayingCard card={face} faceUp={!!face} isPublic={!!face} silent />
        <p>{description}</p>
      </div>
    </Modal>}
  </>;
}
