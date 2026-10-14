import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { X, ChevronRight, ChevronDown } from "lucide-react";
export const Btn = ({
  children,
  primary = false,
  danger = false,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  danger?: boolean;
}) => (
  <button
    className={"btn " + (primary ? "primary " : "") + (danger ? "danger" : "")}
    {...p}
  >
    {children}
  </button>
);
/** 分级等级（告警级别 / 业务状态通用）：显式 tone 优先，缺省时按文字关键字推断 */
type Tone = "red" | "amber" | "blue" | "green";
export const Badge = ({
  children,
  tone,
}: {
  children: ReactNode;
  /** 显式色：red/amber/blue/green，优先级高于文字推断 */
  tone?: Tone;
}) => {
  const text = String(children);
  const cls =
    tone ??
    (/失败|异常|歧义|离线|超限|待确认|已驳回|一级|紧急/.test(text)
      ? "red"
      : /已启用|已同步|完成|空闲|已恢复|已确认|已通过|通过|正常|已落位/.test(text)
        ? "green"
        : /待|暂停|草稿|未发布|接管|维护|孤立|二级|重要/.test(text)
          ? "amber"
          : /三级|一般|普通/.test(text)
            ? "blue"
            : "");
  return <span className={"badge " + cls}>{children}</span>;
};
export const Panel = ({
  title,
  extra,
  children,
  className = "",
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={"panel " + className}>
    <div className="panel-head">
      <h3>{title}</h3>
      {extra}
    </div>
    <div className="panel-body">{children}</div>
  </section>
);
export const Field = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
/**
 * 多选下拉：收起时显示已选摘要，展开后在候选里勾选（可多选）
 * @description 值用字符串数组维护，空数组 = 不限；候选由调用方从后台主数据实时取
 * @param options 候选值
 * @param value 已选值
 * @param onChange 选中集合变化
 * @param placeholder 空值时的占位文案
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "不限",
  searchable,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** 候选多时给个搜索框（按关键词过滤候选，仍可多选） */
  searchable?: boolean;
}) {
  const [open, OPEN] = useState(false);
  /** 搜索关键词：收起时清空，避免下次展开还残留上次的过滤条件 */
  const [kw, KW] = useState("");
  const box = useRef<HTMLDivElement>(null);
  /** 点面板外部收起，避免下拉浮层残留 */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) OPEN(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => {
    if (!open) KW("");
  }, [open]);
  const toggle = (x: string) =>
    onChange(value.includes(x) ? value.filter((v) => v !== x) : [...value, x]);
  const k = kw.trim();
  const shown = k ? options.filter((x) => x.includes(k)) : options;
  return (
    <div className="msel" ref={box}>
      <button type="button" className="msel-box" onClick={() => OPEN(!open)}>
        <span className={value.length ? "" : "muted"}>
          {value.length ? value.join(" / ") : placeholder}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="msel-pop">
          {searchable && (
            <input
              className="msel-search"
              aria-label="搜索候选"
              placeholder="搜索"
              value={kw}
              onChange={(e) => KW(e.target.value)}
            />
          )}
          {shown.map((x) => (
            <label key={x} className="msel-item">
              <input
                type="checkbox"
                checked={value.includes(x)}
                onChange={() => toggle(x)}
              />
              {x}
            </label>
          ))}
          {!shown.length && <p className="msel-empty">无匹配项</p>}
        </div>
      )}
    </div>
  );
}
export const Note = ({ children }: { children: ReactNode }) => (
  <div className="note">{children}</div>
);
export const Empty = ({ children = "暂无记录" }: { children?: ReactNode }) => (
  <div className="empty">{children}</div>
);
/**
 * 通用表格
 * @description 表头支持 ReactNode；行级可通过 rowClass 回调返回 className 做视觉分级（如告警行）
 * @param heads 表头单元格
 * @param rows 行数据，二维数组
 * @param rowClass 可选：按行内容和行号返回 className；缺省全部无额外样式
 */
export function Table<T extends ReactNode[]>({
  heads,
  rows,
  rowClass,
  minWidth,
  className,
}: {
  heads: ReactNode[];
  rows: T[];
  rowClass?: (row: T, i: number) => string;
  /** 附加到 <table> 的类名（供页面做列宽 / 控件宽度的针对性调整） */
  className?: string;
  /**
   * 表格最小宽度（px）
   * @description 列多且单元格里是输入框时给足宽度：容器装不下就横向滑动，
   *              而不是把「0.2」压成「(」这种只剩一个字符的输入框
   */
  minWidth?: number;
}) {
  return (
    <div className="table-scroll">
      <table
        className={className}
        style={minWidth ? { minWidth } : undefined}
      >
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={rowClass ? rowClass(r, i) : ""}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty />}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** 宽版弹窗：列数较多的表格（如对象与检测项）使用，避免挤压换行 */
  wide?: boolean;
  /**
   * 固定底栏（取消 / 保存这类常驻操作）
   * @description 与滚动内容分离：按钮不随内容滚动、也不悬浮在内容之上，始终贴在窗体底部
   */
  footer?: ReactNode;
}) {
  const header = (
    <div className="panel-head">
      <h3>{title}</h3>
      <button aria-label="关闭" onClick={onClose}>
        <X size={19} />
      </button>
    </div>
  );
  const body = <div className="modal-body">{children}</div>;
  return (
    <div className="overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={"modal" + (wide ? " wide" : "")}
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        {body}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
export const Steps = ({
  items,
  current,
}: {
  items: string[];
  current: number;
}) => (
  <div className="steps">
    {items.map((x, i) => (
      <div
        key={x}
        className={i === current ? "active" : i < current ? "done" : ""}
      >
        <span>{i < current ? "✓" : i + 1}</span>
        {x}
        {i < items.length - 1 && <ChevronRight size={14} />}
      </div>
    ))}
  </div>
);
export function Download({ name, data }: { name: string; data: unknown }) {
  return (
    <Btn
      onClick={() => {
        const u = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = u;
        a.download = name;
        a.click();
        URL.revokeObjectURL(u);
      }}
    >
      下载版本清单
    </Btn>
  );
}
