/**
 * @file AreaSketch.tsx
 * @description 区域范围标绘：全厂底图 + 绘制工具条（多边形 / 矩形 / 撤销 / 重做 / 清空）+ 标绘列表
 * @interaction pages/Admin.tsx（区域配置的右侧画布）与 pages/BusinessTargets.tsx
 *              （区域 / 环境类目标的「参照物锚点」走抽屉绘制）
 * @note 受控组件：只对外暴露 `{ points, closed }`，绘制工具、撤销 / 重做栈都在组件内部，
 *       调用方不需要关心绘制过程，保存时拿顶点序列即可
 */
import { useState } from "react";
import { Pentagon, Redo2, Square, Trash2, Undo2 } from "lucide-react";
import { MapImageCanvas } from "./MapImageCanvas";
import { SAMPLE_MAP_IMAGE } from "../data/sampleMap";

/** 顶点（底图百分比坐标，0–100） */
export type SketchPoint = { x: number; y: number };
/** 标绘结果：顶点序列 + 是否闭合（闭合才算成品范围） */
export type SketchValue = { points: SketchPoint[]; closed: boolean };

export function AreaSketch({
  title = "全厂大地图",
  /** 标绘列表里显示的草稿名（一般传区域名 / 锚点名称） */
  label,
  value,
  onChange,
  image = SAMPLE_MAP_IMAGE,
  fill = false,
  height = 380,
}: {
  title?: string;
  label?: string;
  value: SketchValue;
  onChange: (next: SketchValue) => void;
  /** 底图：缺省用示例全厂图 */
  image?: string;
  /** 撑满父容器高度（内置页右栏用）；否则按 height 固定 */
  fill?: boolean;
  height?: number;
}) {
  /** 绘制工具：多边形点选 / 矩形两点成框 */
  const [tool, TOOL] = useState<"polygon" | "rect">("polygon");
  /** 矩形第一点（rect 工具：两次点击确定对角） */
  const [rectAnchor, RECT] = useState<SketchPoint | null>(null);
  /** 撤销栈：顶点序列快照（最多 20 步） */
  const [history, HIST] = useState<SketchPoint[][]>([]);
  /** 重做栈 */
  const [future, FUT] = useState<SketchPoint[][]>([]);

  /** 改动顶点前压栈，并清空重做栈 */
  const push = () => {
    HIST((h) => [...h, value.points].slice(-20));
    FUT([]);
  };

  /** 图面点击：多边形依次加点（点回首点闭合）/ 矩形两点成框 */
  const click = (x: number, y: number) => {
    if (value.closed) return;
    if (tool === "rect") {
      if (!rectAnchor) {
        RECT({ x, y });
        return;
      }
      const a = rectAnchor;
      push();
      RECT(null);
      onChange({
        points: [
          { x: a.x, y: a.y },
          { x, y: a.y },
          { x, y },
          { x: a.x, y },
        ],
        closed: true,
      });
      return;
    }
    // 多边形：靠近首点（2% 内）且已有 ≥3 顶点 → 闭合轮廓
    const first = value.points[0];
    if (
      first &&
      value.points.length >= 3 &&
      Math.hypot(first.x - x, first.y - y) < 2
    ) {
      onChange({ ...value, closed: true });
      return;
    }
    push();
    onChange({ points: [...value.points, { x, y }], closed: false });
  };

  /** 撤销：弹回上一步顶点序列（闭合态撤销即重新打开草稿） */
  const undo = () => {
    if (!history.length) return;
    onChange({
      points: history[history.length - 1],
      closed: false,
    });
    HIST((h) => h.slice(0, -1));
    FUT((f) => [value.points, ...f]);
    RECT(null);
  };

  /** 重做：恢复被撤销的顶点序列 */
  const redo = () => {
    if (!future.length) return;
    onChange({ points: future[0], closed: false });
    HIST((h) => [...h, value.points]);
    FUT((f) => f.slice(1));
  };

  /** 清空范围：当前内容入撤销栈，可撤回 */
  const clear = () => {
    push();
    onChange({ points: [], closed: false });
    RECT(null);
  };

  return (
    <div className="area-canvas">
      <div className="area-canvas-title">{title}</div>
      <div className="area-canvas-body">
        <MapImageCanvas
          image={image}
          fill={fill}
          height={height}
          hint={
            value.closed
              ? "范围已闭合 · 可撤销或点工具重画"
              : tool === "rect"
                ? rectAnchor
                  ? "矩形：再点一次取对角"
                  : "矩形：点击第一个角"
                : "点击加顶点 · 靠近首点自动闭合"
          }
          onAdd={value.closed ? undefined : click}
          areas={[
            {
              id: "draft",
              points: value.points,
              closed: value.closed,
              name: label || undefined,
            },
          ]}
        />

        {/* 绘制工具条：悬浮在地图右上（多边形 / 矩形 / 撤销 / 重做 / 清空） */}
        <div className="area-tools">
          <button
            type="button"
            title="多边形：依次点顶点，点回首点闭合"
            className={tool === "polygon" ? "on" : ""}
            onClick={() => {
              TOOL("polygon");
              RECT(null);
            }}
          >
            <Pentagon size={16} />
          </button>
          <button
            type="button"
            title="矩形：两次点击取对角"
            className={tool === "rect" ? "on" : ""}
            onClick={() => {
              TOOL("rect");
              RECT(null);
            }}
          >
            <Square size={16} />
          </button>
          <button
            type="button"
            title="撤销"
            disabled={!history.length}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            title="重做"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            title="清空标绘"
            disabled={!value.points.length}
            onClick={clear}
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* 标绘列表：当前草稿 / 成品一条记录 */}
        <div className="area-plots">
          <div className="area-plots-head">标绘列表</div>
          {value.points.length ? (
            <div className="area-plot-item">
              <b>{label?.trim() || "未命名区域"}</b>
              <span>
                {value.closed
                  ? `已闭合 · ${value.points.length} 个顶点`
                  : `绘制中 · ${value.points.length} 个顶点`}
              </span>
              <button type="button" title="删除该标绘" onClick={clear}>
                <Trash2 size={13} />
              </button>
            </div>
          ) : (
            <p className="area-plots-empty">暂无标绘，点工具开始在图上画范围</p>
          )}
        </div>
      </div>
    </div>
  );
}
