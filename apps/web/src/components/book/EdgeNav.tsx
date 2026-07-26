import { useRef, type PointerEvent, type ReactNode } from "react";

type EdgeNavProps = {
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  children: ReactNode;
  disabled?: boolean;
};

/**
 * Book-frame wrapper that handles left/right edge click and horizontal swipe.
 * Vertical scrolling inside panels is preserved via delta thresholds.
 */
export function EdgeNav({
  onPrev,
  onNext,
  canPrev,
  canNext,
  children,
  disabled = false,
}: EdgeNavProps) {
  const startRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, button, select, a, label, .book-edge")) {
      startRef.current.active = false;
      return;
    }
    startRef.current = { x: event.clientX, y: event.clientY, active: true };
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !startRef.current.active) return;
    startRef.current.active = false;
    const deltaX = event.clientX - startRef.current.x;
    const deltaY = event.clientY - startRef.current.y;
    if (Math.abs(deltaX) < 80 || Math.abs(deltaY) > 40) return;
    if (deltaX < 0 && canNext) onNext();
    if (deltaX > 0 && canPrev) onPrev();
  }

  return (
    <div
      className="book-3d-frame"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        startRef.current.active = false;
      }}
    >
      <button
        type="button"
        className="book-edge left"
        aria-label="上一页"
        disabled={disabled || !canPrev}
        onClick={(event) => {
          event.stopPropagation();
          if (canPrev) onPrev();
        }}
      />
      <button
        type="button"
        className="book-edge right"
        aria-label="下一页"
        disabled={disabled || !canNext}
        onClick={(event) => {
          event.stopPropagation();
          if (canNext) onNext();
        }}
      />
      {children}
    </div>
  );
}
