import type { TemplateMode } from "../../lib/api";

type TemplateSwitcherProps = {
  value: TemplateMode;
  onChange: (mode: TemplateMode) => void;
  disabled?: boolean;
};

const OPTIONS: { value: TemplateMode; label: string }[] = [
  { value: "A", label: "列表" },
  { value: "B", label: "时间块" },
  { value: "C", label: "大纲+日程" },
];

export function TemplateSwitcher({ value, onChange, disabled }: TemplateSwitcherProps) {
  return (
    <div className="template-switcher" role="group" aria-label="模板选择">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`chip${value === option.value ? " active" : ""}`}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
