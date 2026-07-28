import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { TerminalSession } from "../../types";

interface Props {
  sessions: TerminalSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function TerminalTabs({ sessions, activeId, onSelect, onClose }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const shell = shellRef.current;
    const container = scrollContainerRef.current;
    if (!shell || !container) return;

    const nextHasOverflow = container.scrollWidth > shell.clientWidth + 1;
    setHasOverflow(nextHasOverflow);
    if (!nextHasOverflow) {
      container.scrollLeft = 0;
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    setCanScrollLeft(container.scrollLeft > 1);
    setCanScrollRight(
      container.scrollLeft + container.clientWidth < container.scrollWidth - 1,
    );
  }, []);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
    const frame = requestAnimationFrame(updateScrollState);
    return () => cancelAnimationFrame(frame);
  }, [activeId, sessions.length, updateScrollState]);

  useEffect(() => {
    const shell = shellRef.current;
    const container = scrollContainerRef.current;
    if (!shell || !container) return;

    updateScrollState();
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(shell);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [sessions.length, updateScrollState]);

  const scrollTabs = (direction: -1 | 1) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: direction * Math.max(container.clientWidth * 0.6, 160),
      behavior: "smooth",
    });
  };

  return (
    <div ref={shellRef} className="terminal-tabs-shell">
      {hasOverflow && (
        <button
          type="button"
          className="terminal-tabs-scroll"
          onClick={() => scrollTabs(-1)}
          disabled={!canScrollLeft}
          aria-label="向左滚动终端标签"
          title="向左滚动"
        >
          <ChevronLeft size={15} />
        </button>
      )}
      <div
        ref={scrollContainerRef}
        className="terminal-tabs"
        role="tablist"
        aria-label="终端标签"
        onScroll={updateScrollState}
        onWheel={(event) => {
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
          event.currentTarget.scrollLeft += event.deltaY;
        }}
      >
        {sessions.map((s) => (
          <div
            key={s.id}
            ref={s.id === activeId ? activeTabRef : undefined}
            className={`terminal-tab${s.id === activeId ? " active" : ""}`}
            role="tab"
            aria-selected={s.id === activeId}
            tabIndex={s.id === activeId ? 0 : -1}
            onClick={() => onSelect(s.id)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onSelect(s.id);
            }}
            title={s.error ?? s.title}
          >
            <span className={`status-dot ${s.status}`} />
            <span className="tab-title">{s.title}</span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(s.id);
              }}
              aria-label={`关闭 ${s.title}`}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      {hasOverflow && (
        <button
          type="button"
          className="terminal-tabs-scroll"
          onClick={() => scrollTabs(1)}
          disabled={!canScrollRight}
          aria-label="向右滚动终端标签"
          title="向右滚动"
        >
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
