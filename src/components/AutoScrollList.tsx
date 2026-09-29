/**
 * @file AutoScrollList.tsx
 * @description 大屏列表「自动上下滚动播放」容器：内容高于可视区时无缝循环滚动，
 *              隐藏滚动条、不提供手动上下拉动；内容不足一屏时保持静态不动。
 * @interaction 纯展示组件（条目自身仍可点击）；鼠标移入暂停播放、移出继续；
 *              可视高度可由 rows（显示条数，按首条高度自适应）或 height（固定像素）指定，都不传则撑满父容器
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export function AutoScrollList({
  children,
  /** 施加到每一份列表内容上的类名（如 "cs-work-list readonly"，用于复用既有列表观感） */
  listClass = "",
  /** 可视高度（像素） */
  height,
  /** 可视区内显示的条目数：按「首条高度 + 列表 gap」自动换算高度（与 height 互斥，rows 优先） */
  rows,
  /** 滚动速度：像素 / 秒 */
  speed = 22,
  className = "",
}: {
  children: ReactNode;
  listClass?: string;
  height?: number;
  rows?: number;
  speed?: number;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  /** 单份内容高度 / 可视区高度：用于判断是否需要滚动与计算循环时长 */
  const [segH, SETSEG] = useState(0);
  const [boxH, SETBOX] = useState(0);
  /** rows 模式下的可视高度（按首条高度换算） */
  const [rowsH, SETROWSH] = useState(0);

  useEffect(() => {
    const measure = () => {
      const seg = inner.current?.firstElementChild as HTMLElement | null;
      SETSEG(seg?.offsetHeight || 0);
      SETBOX(wrap.current?.clientHeight || 0);
      if (rows && seg) {
        const first = seg.firstElementChild as HTMLElement | null;
        /** children 可能是多个同级条目，也可能只有一个列表容器（如 ul），此时条目取容器首个子元素 */
        const list =
          first && seg.children.length === 1 && ["UL", "OL"].includes(first.tagName)
            ? first
            : seg;
        const itemH = (list.firstElementChild as HTMLElement | null)?.offsetHeight || 0;
        const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
        // 顶部 6px 为分段内边距，保证首条完整可见
        SETROWSH(itemH ? Math.round(rows * itemH + (rows - 1) * gap + 6) : 0);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [children, height, rows]);

  /** 生效的可视高度：rows 模式用换算值，避免与容器实测值出现时序错位 */
  const viewH = rows ? rowsH : boxH;
  /** 仅当内容高于可视区才滚动；能全部展示时保持静态（不播放） */
  const play = viewH > 0 && segH > viewH + 2;
  const copies = play ? Math.max(2, Math.ceil(viewH / segH) + 1) : 1;
  const style = {
    "--scroll-h": `${segH}px`,
    "--scroll-dur": `${Math.max(8, segH / speed).toFixed(1)}s`,
  } as CSSProperties;
  const boxStyle = rows
    ? rowsH
      ? { height: rowsH }
      : undefined
    : height
      ? { height }
      : undefined;

  return (
    <div
      className={
        "auto-scroll" +
        (boxStyle ? "" : " fill") +
        (className ? " " + className : "")
      }
      ref={wrap}
      style={boxStyle}
    >
      <div
        className={"auto-scroll-inner" + (play ? " play" : "")}
        ref={inner}
        style={style}
      >
        {Array.from({ length: copies }).map((_, i) => (
          <div
            className={"auto-scroll-seg " + listClass}
            key={i}
            aria-hidden={i > 0}
            inert={i > 0 ? true : undefined}
          >
            {children}
          </div>
        ))}
      </div>
    </div>
  );
}
