"use client";
// Feishin rebuild — custom slider (seek bar + volume, feishin-style thin bar)
import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

export function FsSlider({
  value,
  max,
  onChange,
  onCommit,
  className,
  ariaLabel,
  mode,
}: {
  value: number;
  max: number;
  onChange?: (v: number) => void;
  onCommit?: (v: number) => void;
  className?: string;
  ariaLabel: string;
  mode?: "dark" | "light";
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const valueFromEvent = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * max;
    },
    [max],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    ref.current?.classList.add("dragging");
    const v = valueFromEvent(e.clientX);
    onChange?.(v);
    const move = (ev: PointerEvent) => {
      const v2 = valueFromEvent(ev.clientX);
      onChange?.(v2);
    };
    const up = (ev: PointerEvent) => {
      draggingRef.current = false;
      ref.current?.classList.remove("dragging");
      const v3 = valueFromEvent(ev.clientX);
      onCommit?.(v3);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${Math.round(pct)}%`}
      tabIndex={0}
      className={cn("fs-slider", className)}
      data-mode={mode}
      onPointerDown={handlePointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.stopPropagation();
          onChange?.(Math.min(max, value + max * 0.02));
          onCommit?.(Math.min(max, value + max * 0.02));
        } else if (e.key === "ArrowLeft") {
          e.stopPropagation();
          onChange?.(Math.max(0, value - max * 0.02));
          onCommit?.(Math.max(0, value - max * 0.02));
        }
      }}
    >
      <div className="fs-slider-fill" style={{ width: `${pct}%` }} />
      <div className="fs-slider-thumb" style={{ left: `${pct}%` }} />
    </div>
  );
}
