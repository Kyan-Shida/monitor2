import type { ReactNode, ButtonHTMLAttributes } from "react";
import { X, ChevronRight } from "lucide-react";
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
export const Badge = ({ children }: { children: ReactNode }) => (
  <span
    className={
      "badge " +
      (/失败|异常|歧义|离线|超限|待确认/.test(String(children))
        ? "red"
        : /已启用|已同步|完成|空闲|已恢复|已确认/.test(String(children))
          ? "green"
          : /待|暂停|草稿|接管|维护/.test(String(children))
            ? "amber"
            : "")
    }
  >
    {children}
  </span>
);
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
export const Note = ({ children }: { children: ReactNode }) => (
  <div className="note">{children}</div>
);
export const Empty = ({ children = "暂无记录" }: { children?: ReactNode }) => (
  <div className="empty">{children}</div>
);
/**
 * 通用表格
 * @description 表头支持 ReactNode（可用 <span className="th-note"> 在表头下挂小字副注，
 *              避免长说明被 th 的 nowrap 撑宽导致其他列挤压）
 * @param heads 表头单元格（字符串或节点）
 * @param rows 行数据，二维数组，行内元素顺序与 heads 对齐
 */
export function Table({
  heads,
  rows,
}: {
  heads: ReactNode[];
  rows: ReactNode[][];
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {heads.map((h, i) => (
              // 表头可能为节点，故用下标作 key（表头顺序固定不变）
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
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
  drawer = false,
  drawerWidth,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** 宽版弹窗：列数较多的表格（如对象与检测项）使用，避免挤压换行 */
  wide?: boolean;
  /**
   * 右侧抽屉形态
   * @description 内容体量大的场景（多字段表单、分步向导、长文档、就地详情）用它替代居中弹窗：
   *              全高滚动 + 底部操作条常驻，且不遮挡身后的列表上下文
   */
  drawer?: boolean;
  /** 抽屉宽度（px）；仅 drawer 生效，缺省沿用样式的 620 */
  drawerWidth?: number;
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
    <div className={"overlay" + (drawer ? " drawer-host" : "")} onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className={"modal" + (wide ? " wide" : "")}
        style={drawerWidth ? { width: drawerWidth } : undefined}
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
