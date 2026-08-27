"use client";

export default function ViewToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="view-toggle">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={opt.value === value ? "active" : ""}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
