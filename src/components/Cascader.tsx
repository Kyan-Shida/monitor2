/**
 * @file Cascader.tsx
 * @description 级联选择器（全站通用）：点击展开浮层 → 浮层内按层级横向列出候选 → 逐级选到叶子即回调并收起。
 *              浮层用 **portal 挂到 body**（`position: fixed` + 触发器的实时坐标）：
 *              页面面板 `.panel` 是 `overflow: hidden`，浮层留在原地会被裁掉、还会被后面的面板压住。
 *              关闭时机：选中叶子 / 点浮层外 / Esc / 滚动或窗口尺寸变化（fixed 浮层滚动后会错位）。
 *              叶子值需全局唯一；组件内按值反查路径，用于回显「区域 / 设备 / 检测目标」这类完整链路。
 * @interaction 巡检目标台账第 1 段（区域 › 设备 › 检测目标）、算法模板的「算法」（算法能力类型 › 算法）
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";

/** 级联选项：带 children 即分组节点，不带即叶子（叶子 value 全局唯一） */
export type CascaderOption = {
  value: string;
  label: string;
  children?: CascaderOption[];
};

/** 触发器下方剩余空间小于这个值时，浮层改为向上展开（约等于浮层一半高度） */
const MIN_BELOW = 200;

/** 按值反查路径（回显用） */
function pathOf(
  options: CascaderOption[],
  value: string,
  trail: CascaderOption[] = [],
): CascaderOption[] {
  for (const o of options) {
    const next = [...trail, o];
    if (!o.children?.length && o.value === value) return next;
    if (o.children?.length) {
      const hit = pathOf(o.children, value, next);
      if (hit.length) return hit;
    }
  }
  return [];
}

/**
 * 级联选择器
 * @param options 树形选项（末级为可选值）
 * @param value 当前选中值（叶子 value；空串 = 未选）
 * @param onChange 选中叶子后的回调
 * @param placeholder 未选时的占位文案
 * @param disabled 只读（如编辑既有台账时目标不可改）
 * @param triggerClass 触发器附加类名（如「告警等级配置」入口要主按钮样式）
 */
export function Cascader({
  options,
  value,
  onChange,
  placeholder = "请选择",
  disabled = false,
  triggerClass,
}: {
  options: CascaderOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  triggerClass?: string;
}) {
  const [open, SETOPEN] = useState(false);
  /** 浮层内各列已选中的节点（打开时按当前值预铺，方便就近改选） */
  const [cols, SETCOLS] = useState<CascaderOption[]>([]);
  /** 浮层坐标（fixed 定位，取触发器实时位置算出；up = 向上展开） */
  const [pos, SETPOS] = useState({ top: 0, left: 0, up: false });
  /** 浮层可选的高度上限（按上下可用空间收敛，窗口矮时不会被底部截断） */
  const [maxH, SETMAXH] = useState(300);
  /** 触发器容器：用于取位置、判断点击是否落在选择器内 */
  const box = useRef<HTMLDivElement>(null);
  /** 浮层：portal 到 body，单独一个 ref 用于判断点击是否落在浮层内 */
  const pop = useRef<HTMLDivElement>(null);
  const label = pathOf(options, value)
    .map((x) => x.label)
    .join(" / ");

  /**
   * 打开浮层
   * @description 先按触发器的实时位置定坐标（下方不够就向上翻，左右夹在视口内），
   *              再按当前值预铺已选路径
   */
  function openPop() {
    const r = box.current?.getBoundingClientRect();
    if (r) {
      const up =
        window.innerHeight - r.bottom < MIN_BELOW && r.top > MIN_BELOW;
      SETPOS({
        top: up ? r.top - 4 : r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - 240)),
        up,
      });
      // 高度按"向上 / 向下那一侧的可用空间"收敛（最少 120px，最多 300px）
      const space = up ? r.top - 8 : window.innerHeight - r.bottom - 8;
      SETMAXH(Math.max(120, Math.min(300, space)));
    }
    SETCOLS(pathOf(options, value));
    SETOPEN(true);
  }

  function toggle() {
    if (disabled) return;
    if (open) SETOPEN(false);
    else openPop();
  }

  /** 点第 level 列的第 i 项：分组 → 展开下一列；叶子 → 提交并收起 */
  function pick(level: number, o: CascaderOption) {
    const next = [...cols.slice(0, level), o];
    SETCOLS(next);
    if (o.children?.length) return;
    onChange(o.value);
    SETOPEN(false);
  }

  /**
   * 关闭浮层的全局监听
   * @description 用 document 监听代替原来铺满视口的遮罩层：遮罩会盖住整页、吞掉所有点击（表现为"页面卡住"），
   *              而且它是 fixed 全屏层，每次开关都要重绘整个视口
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || pop.current?.contains(t)) return;
      SETOPEN(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") SETOPEN(false);
    };
    const onMove = () => SETOPEN(false);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  /**
   * 浮层渲染后量一次实际宽度：超出视口右沿就往左挪
   * @description 列数随下钻逐级增多、宽度会变，静态估算不准，量一次最省事（挪够就不再挪，不会来回抖）
   */
  useEffect(() => {
    if (!open) return;
    const el = pop.current;
    if (!el) return;
    const over = el.getBoundingClientRect().right - (window.innerWidth - 8);
    if (over > 0) SETPOS((p) => ({ ...p, left: Math.max(8, p.left - over) }));
  }, [open, cols]);

  /** 浮层列：根列常驻，之后按已选中节点逐级展开 */
  const columns: { level: number; items: CascaderOption[] }[] = [
    { level: 0, items: options },
  ];
  cols.forEach((o, i) => {
    if (o.children?.length) columns.push({ level: i + 1, items: o.children! });
  });

  return (
    <div className="cascader" ref={box}>
      <button
        type="button"
        className={"cascader-trigger" + (triggerClass ? " " + triggerClass : "")}
        disabled={disabled}
        onClick={toggle}
      >
        <span className={label ? "" : "muted"}>{label || placeholder}</span>
        <ChevronDown size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            className={"cascader-pop" + (pos.up ? " up" : "")}
            style={
              {
                top: pos.top,
                left: pos.left,
                "--cascader-h": `${maxH}px`,
              } as CSSProperties
            }
          >
            {columns.map((c) => (
              <div className="cascader-col" key={c.level}>
                {c.items.map((o) => (
                  <button
                    type="button"
                    key={o.value}
                    className={cols[c.level]?.value === o.value ? "on" : undefined}
                    onClick={() => pick(c.level, o)}
                  >
                    <span>{o.label}</span>
                    {o.children?.length ? <ChevronRight size={12} /> : null}
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
