"use client";
// Feishin rebuild — horizontal scroll carousel (feishin-style section with arrows)
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./shared";

export function ScrollCarousel({
  title,
  children,
  onTitleClick,
  itemWidth = 164,
  gap = 16,
  action,
}: {
  title: string;
  children: React.ReactNode;
  onTitleClick?: () => void;
  itemWidth?: number;
  gap?: number;
  action?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * (itemWidth + gap) * 3, behavior: "smooth" });
  };

  return (
    <section>
      <SectionHeader
        title={title}
        action={
          <>
            {action}
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Scroll left"
                disabled={atStart}
                onClick={() => scroll(-1)}
                className="fs-icon-btn p-1 disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                aria-label="Scroll right"
                disabled={atEnd}
                onClick={() => scroll(1)}
                className="fs-icon-btn p-1 disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        }
      />
      <div
        ref={ref}
        onScroll={update}
        className={cn("flex overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}
        style={{ gap: `${gap}px` }}
      >
        {children}
      </div>
    </section>
  );
}
