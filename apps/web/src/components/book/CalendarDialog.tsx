import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { CalendarDay } from "../../lib/api";
import { useDialogFocus } from "../books/useDialogFocus";

const monthLabelFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
});

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function shiftMonth(current: string, offset: number): string {
  const [year, month] = current.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function monthTitle(current: string): string {
  const [year, month] = current.split("-").map(Number);
  return monthLabelFormatter.format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

type CalendarDialogProps = {
  days: CalendarDay[];
  selectedDate: string;
  today: string;
  onSelect: (date: string) => void;
  onClose: () => void;
};

export function CalendarDialog({
  days,
  selectedDate,
  today,
  onSelect,
  onClose,
}: CalendarDialogProps) {
  const [viewMonth, setViewMonth] = useState(() => monthKey(selectedDate));
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useDialogFocus(dialogRef, gridRef, onClose, false);

  useEffect(() => {
    setViewMonth(monthKey(selectedDate));
  }, [selectedDate]);

  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const day of days) map.set(day.date, day);
    return map;
  }, [days]);

  const cells = useMemo(() => {
    const [year, month] = viewMonth.split("-").map(Number);
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    // Monday-first offset: getUTCDay() Sunday=0 … Saturday=6
    const leading = (firstOfMonth.getUTCDay() + 6) % 7;
    const result: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < leading; i += 1) result.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${viewMonth}-${String(day).padStart(2, "0")}`;
      result.push({ date, day });
    }
    return result;
  }, [viewMonth]);

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={handleBackdrop}>
      <section
        ref={dialogRef}
        className="book-dialog calendar-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-dialog-title"
      >
        <header className="book-dialog-header">
          <div>
            <p className="book-dialog-kicker">Calendar</p>
            <h2 id="calendar-dialog-title">翻到有记录的日子</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭日历"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="calendar-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="上个月"
            onClick={() => setViewMonth((current) => shiftMonth(current, -1))}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <strong aria-live="polite">{monthTitle(viewMonth)}</strong>
          <button
            type="button"
            className="icon-btn"
            aria-label="下个月"
            onClick={() => setViewMonth((current) => shiftMonth(current, 1))}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className="calendar-grid" ref={gridRef} tabIndex={-1}>
          {cells.map((cell, index) =>
            cell === null ? (
              <span key={`blank-${index}`} className="calendar-cell blank" />
            ) : (
              <CalendarCell
                key={cell.date}
                date={cell.date}
                day={cell.day}
                info={dayMap.get(cell.date)}
                isSelected={cell.date === selectedDate}
                isToday={cell.date === today}
                onSelect={onSelect}
              />
            ),
          )}
        </div>

        <footer className="calendar-legend">
          <span>
            <i className="calendar-dot" data-level="high" aria-hidden="true" />
            完成度高
          </span>
          <span>
            <i className="calendar-dot" data-level="medium" aria-hidden="true" />
            完成度中
          </span>
          <span>
            <i className="calendar-dot" data-level="low" aria-hidden="true" />
            完成度低
          </span>
        </footer>
      </section>
    </div>
  );
}

function CalendarCell({
  date,
  day,
  info,
  isSelected,
  isToday,
  onSelect,
}: {
  date: string;
  day: number;
  info: CalendarDay | undefined;
  isSelected: boolean;
  isToday: boolean;
  onSelect: (date: string) => void;
}) {
  const hasRecord = Boolean(info && (info.total > 0 || info.hasNotes));
  const label = info
    ? `${date}${info.total > 0 ? `，${info.done}/${info.total} 已完成` : ""}${info.hasNotes ? "，有日记" : ""}`
    : `${date}，无记录`;

  return (
    <button
      type="button"
      className="calendar-cell"
      data-has-record={hasRecord || undefined}
      data-selected={isSelected || undefined}
      data-today={isToday || undefined}
      aria-label={label}
      title={label}
      onClick={() => onSelect(date)}
    >
      <span className="calendar-day-num">{day}</span>
      {info && info.total > 0 ? (
        <span
          className="calendar-dot"
          data-level={info.level}
          aria-hidden="true"
        />
      ) : info?.hasNotes ? (
        <span className="calendar-note-mark" aria-hidden="true" />
      ) : null}
    </button>
  );
}
