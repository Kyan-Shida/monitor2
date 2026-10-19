/**
 * @file Segmented.tsx
 * @description 分段切换器：页面内 tab / 视图切换的统一实现（全站同一套外观与交互）
 * @interaction pages/LogCenter.tsx、components/RoleAdmin.tsx；其余页面直接复用 .segmented 样式
 */

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className = "",
}: {
  items: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={"segmented" + (className ? " " + className : "")}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className={value === it.key ? "active" : ""}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
