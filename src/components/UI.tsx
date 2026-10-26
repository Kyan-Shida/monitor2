import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, ChevronDown } from "lucide-react";
export const Btn = ({
  children,
  primary = false,
  danger = false,
  small = false,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
}) => (
  <button
    className={"btn " + (primary ? "primary " : "") + (danger ? "danger " : "") + (small ? "small" : "")}
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
  /**
   * 无显式 tone 时按语义着色：
   * 红 = 异常结束，绿 = 正常结束，黄 = 待处理 / 人工介入，蓝 = 进行中
   */
  const cls =
    tone ??
    (/失败|异常|歧义|离线|超限|待确认|已驳回|超期|取消|一级|紧急/.test(text)
      ? "red"
      : /已启用|已同步|完成|空闲|已关闭|已确认|已通过|通过|正常|已落位/.test(
            text,
          )
        ? "green"
        : /待|暂停|草稿|未发布|接管|维护|孤立|二级|重要/.test(text)
          ? "amber"
          : /执行中|已分配|下发中|三级|一般|普通/.test(text)
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
  /** 面板标题；传 undefined / 空串则不渲染 panel-head（无标题面板） */
  title?: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={"panel " + className}>
    {title ? (
      <div className="panel-head">
        <h3>{title}</h3>
        {extra}
      </div>
    ) : null}
    <div className="panel-body">{children}</div>
  </section>
);
/**
 * 表单字段
 * @param required 必填项：标签后追加红色星号标识
 */
export const Field = ({
  label,
  required = false,
  error,
  className,
  children,
}: {
  label: string;
  /** 必填：标签后加红星标识 */
  required?: boolean;
  children: ReactNode;
  /**
   * 字段级校验提示
   * @description 有值时标签变红、控件下方给出原因；比只在角落弹一条 toast 更容易定位
   */
  error?: string;
  /** 附加类名：栅格表单里控制跨列等排布 */
  className?: string;
}) => (
  <label
    className={
      "field" + (error ? " has-err" : "") + (className ? " " + className : "")
    }
  >
    <span>
      {label}
      {required && <em className="req">*</em>}
    </span>
    {children}
    {error && <i className="field-err">{error}</i>}
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
  slim = false,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** 宽版弹窗：列数较多的表格（如对象与检测项）使用，避免挤压换行 */
  wide?: boolean;
  /**
   * 窄版弹窗：仅承载少量按钮的轻量弹窗（如「更多操作」菜单），
   * 避免默认 880px 宽度把几个按钮拉得很散、右侧留大片空白
   */
  slim?: boolean;
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
  /* 挂到 body：页面根若有 transform（整页等比缩放），fixed 会以它为基准，弹窗就会偏位、跟着缩小 */
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={"modal" + (wide ? " wide" : "") + (slim ? " slim" : "")}
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        {body}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
/**
 * 二次确认
 * @description 保存 / 重置 / 删除这类一按就落库、不能撤回的操作，执行前再问一次；
 *              复用 Modal 窄版，尺寸、圆角、按钮与全站弹窗完全一套
 * @param danger 危险操作：确认按钮转红
 */
export function Confirm({
  title,
  message,
  confirmText = "确定",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  /** 一句话说清后果，可省 */
  message?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      slim
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn primary={!danger} danger={danger} onClick={onConfirm}>
            {confirmText}
          </Btn>
        </>
      }
    >
      {message && <p>{message}</p>}
    </Modal>
  );
}
/**
 * 通用抽屉（右侧滑出，约 2/3 页面宽）
 * @description 与 Modal 的分工：**需要一边填一边看列表上下文**的编辑走抽屉，
 *              极轻的确认 / 少量按钮走 Modal，字段多又要长期停留的走内置页。
 *              抽屉只压暗不位移，关闭后列表仍停在原滚动位置。
 * @param footer 固定底栏（取消 / 保存），与滚动内容分离
 * @param subtitle 标题下一行小字（如编码 / 归属），省掉正文里重复的说明
 */
export function Drawer({
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  /** 固定底栏：按钮不随内容滚动，也不悬浮在内容之上 */
  footer?: ReactNode;
}) {
  /* 同样挂 body：页面根有 transform 时 fixed 会以它为基准，抽屉会偏位并跟着缩放 */
  return createPortal(
    <div className="overlay drawer-overlay" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={title}
        className="drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <small>{subtitle}</small>}
          </div>
          <button aria-label="关闭" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
/**
 * 开关（滑块）
 * @description 二态字段用它替代下拉「启用 / 停用」：一眼看到当前状态，一次点击切换
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 无障碍名称（视觉上不显示） */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={"ui-switch" + (checked ? " on" : "")}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  );
}

/**
 * 内置页容器（整页表单）
 * @description 容器选型的第三档：字段多、需要长期停留、含图上绘制的编辑场景，
 *              用整页替代弹窗 / 抽屉；顶栏常驻（标题 + 取消 / 保存），主体就是页面内容
 * @param actions 顶栏右侧操作（取消 / 保存）
 */
export function InnerPage({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={"inner-page " + className}>
      <div className="context-bar">
        <div>
          <b>{title}</b>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      {children}
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
