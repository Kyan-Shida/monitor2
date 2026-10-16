/**
 * @file FilterPanel.tsx
 * @description 通用筛选面板（紧凑单行）：条件字段（下拉 / 关键词输入 / 日期）+ 右侧「重置 / 查询」
 * @interaction 列表页复用；条件由调用方以草稿方式持有，点「查询」才写回生效值
 */
import { Btn } from "./UI";

/** 下拉选项：字符串即「值 = 文案」；对象用于把命中条数等附在文案上 */
export type FilterOption = string | { value: string; label: string };

/** 筛选项：给 options 渲染下拉，type="date" 渲染日期，否则渲染文本输入 */
export interface FilterField {
  /** 取值键（与 value / onChange 的字段一一对应） */
  key: string;
  label: string;
  /** 下拉选项（「全部」等兜底项由调用方拼入） */
  options?: FilterOption[];
  /** 输入类型：默认文本，date 用于起止日期 */
  type?: "text" | "date";
  placeholder?: string;
}

export function FilterPanel({
  fields,
  value,
  onChange,
  onSearch,
  onReset,
}: {
  fields: FilterField[];
  /** 草稿值：键为字段 key */
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onSearch: () => void;
  onReset: () => void;
}) {
  return (
    <div className="filter-panel">
      {fields.map((f) => (
        <label className="fp-field" key={f.key}>
          <span>{f.label}</span>
          {f.options ? (
            <select
              value={value[f.key] ?? ""}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            >
              {f.options.map((o) => {
                const v = typeof o === "string" ? o : o.value;
                return (
                  <option key={v} value={v}>
                    {typeof o === "string" ? o : o.label}
                  </option>
                );
              })}
            </select>
          ) : (
            <input
              type={f.type === "date" ? "date" : "text"}
              value={value[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
            />
          )}
        </label>
      ))}
      <div className="fp-actions">
        <Btn onClick={onReset}>重置</Btn>
        <Btn primary onClick={onSearch}>
          查询
        </Btn>
      </div>
    </div>
  );
}
