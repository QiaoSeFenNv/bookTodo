import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import { Copy, X } from "lucide-react";
import type { CalendarDay } from "../../lib/api";
import { todayKey } from "../../lib/date";
import { useDialogFocus } from "../books/useDialogFocus";

const dateLabelFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "short",
});

function shortLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return dateLabelFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

type CopyDayDialogProps = {
  days: CalendarDay[];
  targetDate: string;
  onClose: () => void;
  onCopy: (sourceDate: string) => Promise<number | false>;
};

export function CopyDayDialog({ days, targetDate, onClose, onCopy }: CopyDayDialogProps) {
  const today = todayKey();
  const defaultSource = useMemo(() => {
    const candidates = days.filter((day) => day.total > 0 && day.date !== targetDate);
    if (candidates.length > 0) return candidates[candidates.length - 1].date;
    if (targetDate !== today) return today;
    return "";
  }, [days, targetDate, today]);

  const [sourceDate, setSourceDate] = useState(defaultSource);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useDialogFocus(dialogRef, inputRef, onClose, submitting);

  useEffect(() => {
    setSourceDate(defaultSource);
  }, [defaultSource]);

  const suggestions = useMemo(() => {
    return [...days]
      .filter((day) => day.total > 0 && day.date !== targetDate)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 6);
  }, [days, targetDate]);

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !submitting) onClose();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
      setError("请选择或输入正确的日期。");
      inputRef.current?.focus();
      return;
    }
    if (sourceDate === targetDate) {
      setError("来源日期不能和当前日期相同。");
      inputRef.current?.focus();
      return;
    }

    setError("");
    setSubmitting(true);
    const copiedCount = await onCopy(sourceDate);
    setSubmitting(false);
    if (copiedCount === false) return;
    if (copiedCount === 0) {
      setError("这一天没有可复制的待办。");
      return;
    }
    onClose();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={handleBackdrop}>
      <section
        ref={dialogRef}
        className="book-dialog copy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-day-title"
      >
        <header className="book-dialog-header">
          <div>
            <p className="book-dialog-kicker">Duplicate day</p>
            <h2 id="copy-day-title">复制某一天到当前</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭复制窗口"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="book-dialog-form" onSubmit={handleSubmit}>
          <label>
            <span>来源日期（复制它的全部待办到当前日期）</span>
            <input
              ref={inputRef}
              type="date"
              value={sourceDate}
              onChange={(event) => setSourceDate(event.target.value)}
              required
            />
          </label>

          {suggestions.length > 0 ? (
            <div className="copy-suggestions" role="group" aria-label="有记录的最近日子">
              {suggestions.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  className="copy-suggestion"
                  data-active={day.date === sourceDate || undefined}
                  onClick={() => setSourceDate(day.date)}
                >
                  <span>{shortLabel(day.date)}</span>
                  <span className="copy-suggestion-meta">{day.total} 项</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="copy-empty-hint">书架里还没有可复制的历史记录。</p>
          )}

          <p className="copy-hint">
            复制的内容为未完成状态，日记（总结/目标/备注）不会被复制。
          </p>

          {error ? (
            <p className="book-dialog-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="book-dialog-actions">
            <button type="button" className="secondary-btn" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="primary-btn" disabled={submitting || !sourceDate}>
              <Copy size={15} aria-hidden="true" />
              {submitting ? "复制中…" : "复制到当前日期"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
