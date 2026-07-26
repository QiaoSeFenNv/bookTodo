import { useEffect, useId, useRef, useState } from "react";
import { Check, Clock3 } from "lucide-react";

type TimePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  align?: "start" | "end";
};

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export function TimePicker({ label, value, onChange, align = "start" }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const [hour = "00", minute = "00"] = value.split(":");

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.setTimeout(() => {
      hourListRef.current?.focus();
      for (const list of [hourListRef.current, minuteListRef.current]) {
        const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
        selected?.scrollIntoView({ block: "center", inline: "nearest" });
      }
    }, 0);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function closePicker() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function handlePickerKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
    }
  }

  function handleListKeyDown(
    event: React.KeyboardEvent,
    values: string[],
    selected: string,
    update: (next: string) => void,
  ) {
    const current = Math.max(0, values.indexOf(selected));
    let next = current;
    if (event.key === "ArrowDown") next = (current + 1) % values.length;
    else if (event.key === "ArrowUp") next = (current - 1 + values.length) % values.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = values.length - 1;
    else return;
    event.preventDefault();
    update(values[next]);
    document.getElementById(`${popoverId}-${values === HOURS ? "hour" : "minute"}-${values[next]}`)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="time-picker" ref={rootRef} data-align={align}>
      <button
        ref={triggerRef}
        type="button"
        className="time-picker-trigger"
        aria-label={`${label}，当前 ${value}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Clock3 size={14} aria-hidden="true" />
        <span>{value}</span>
      </button>

      {open ? (
        <div
          id={popoverId}
          className="time-picker-popover"
          role="dialog"
          aria-label={`${label}选择器`}
          onKeyDown={handlePickerKeyDown}
        >
          <div className="time-picker-column">
            <span className="time-picker-heading">时</span>
            <div
              ref={hourListRef}
              className="time-picker-list"
              role="listbox"
              tabIndex={0}
              aria-label={`${label}小时`}
              aria-activedescendant={`${popoverId}-hour-${hour}`}
              onKeyDown={(event) =>
                handleListKeyDown(event, HOURS, hour, (next) => onChange(`${next}:${minute}`))
              }
            >
              {HOURS.map((option) => (
                <div
                  id={`${popoverId}-hour-${option}`}
                  key={option}
                  role="option"
                  aria-selected={option === hour}
                  className="time-picker-option"
                  onClick={() => onChange(`${option}:${minute}`)}
                >
                  {option}
                </div>
              ))}
            </div>
          </div>
          <span className="time-picker-colon" aria-hidden="true">:</span>
          <div className="time-picker-column">
            <span className="time-picker-heading">分</span>
            <div
              ref={minuteListRef}
              className="time-picker-list"
              role="listbox"
              tabIndex={0}
              aria-label={`${label}分钟`}
              aria-activedescendant={`${popoverId}-minute-${minute}`}
              onKeyDown={(event) =>
                handleListKeyDown(event, MINUTES, minute, (next) => onChange(`${hour}:${next}`))
              }
            >
              {MINUTES.map((option) => (
                <div
                  id={`${popoverId}-minute-${option}`}
                  key={option}
                  role="option"
                  aria-selected={option === minute}
                  className="time-picker-option"
                  onClick={() => onChange(`${hour}:${option}`)}
                >
                  {option}
                </div>
              ))}
            </div>
          </div>
          <button type="button" className="time-picker-done" aria-label="完成时间选择" onClick={closePicker}>
            <Check size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
