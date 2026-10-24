/**
 * @file LogTable.tsx
 * @description 日志表格：列宽拖拽（按比例分配，宽度始终铺满容器）、长文本省略 + Hover 气泡
 * @interaction 被 pages/LogCenter.tsx 的三个日志页签复用
 */
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface LogColumn<T> {
  key: string;
  head: string;
  width: number;
  render: (row: T) => ReactNode;
  /** 导出 Excel 的纯文本；缺省则该列不导出 */
  text?: (row: T) => string;
}

/** 文本单元格：超出容器时省略，Hover 由外层表格弹气泡 */
function Cell({
  value,
  onTip,
  onLeave,
}: {
  value: ReactNode;
  onTip: (e: ReactMouseEvent<HTMLSpanElement>, text: string) => void;
  onLeave: () => void;
}) {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value);
    return (
      <span
        className="cell-ellipsis"
        onMouseEnter={(e) => onTip(e, text)}
        onMouseLeave={onLeave}
      >
        {text}
      </span>
    );
  }
  return <>{value}</>;
}

export function LogTable<T extends { id: string }>({
  columns,
  rows,
}: {
  columns: LogColumn<T>[];
  rows: T[];
}) {
  const [widths, WIDTHS] = useState(columns.map((c) => c.width));
  const [tip, TIP] = useState<{ text: string; x: number; y: number } | null>(
    null,
  );
  const drag = useRef<{ index: number; startX: number; startW: number } | null>(
    null,
  );

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      WIDTHS((prev) =>
        prev.map((w, i) =>
          i === d.index ? Math.max(72, d.startW + e.clientX - d.startX) : w,
        ),
      );
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      document.body.classList.remove("col-resizing");
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, []);

  /** 仅当文本被截断时才弹气泡，短文本不打扰 */
  function onTip(e: ReactMouseEvent<HTMLSpanElement>, text: string) {
    const el = e.currentTarget;
    if (el.scrollWidth <= el.clientWidth) return;
    const r = el.getBoundingClientRect();
    TIP({ text, x: r.left, y: r.bottom + 6 });
  }

  return (
    <div className="table-scroll log-table-wrap">
      <table className="log-table" style={{ width: "100%" }}>
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key}>
                {c.head}
                <span
                  className="col-resizer"
                  title="拖拽调整列宽"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    drag.current = {
                      index: i,
                      startX: e.clientX,
                      startW: widths[i],
                    };
                    document.body.classList.add("col-resizing");
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.key}>
                  <Cell
                    value={c.render(row)}
                    onTip={onTip}
                    onLeave={() => TIP(null)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">暂无记录</div>}
      {/* 气泡按视口坐标定位，portal 到 body：页面根节点带缩放 transform 时留在原位会偏位 */}
      {tip &&
        createPortal(
          <div className="cell-tip" style={{ left: tip.x, top: tip.y }}>
            {tip.text}
          </div>,
          document.body,
        )}
    </div>
  );
}
