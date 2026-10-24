/**
 * @file MapImageCanvas.tsx
 * @description 简易地图画布：以「用户上传的地图图片」为底图，点击图面即可标注点位。
 *              不含点云/轨道/充电桩等复杂图层（那些由 MapCanvas 在驾驶舱等场景使用）。
 * @interaction 被 Annotation.tsx、MapOnboarding.tsx、MapSurveyPanel.tsx 消费
 */
import React, { useEffect, useRef, useState } from "react";

/** 图面上的一个标记（候选点 / 业务点） */
export interface ImageMarker {
  id: string;
  x: number;
  y: number;
  label?: string;
  kind?: string;
  /** 状态：已确认 / 待确认 …（用于配色） */
  state?: string;
  /** 来源：地图导入 / 平台新增（平台新增的点位另用一档描边色区分） */
  source?: string;
  /** 已选入连线草稿（标定工作台连点中，需与普通选中区分开） */
  draft?: boolean;
}

/** 底图缺省尺寸（示例底图 1000×620）；图片加载后按真实像素覆盖 */
const DEFAULT_NAT = { w: 1000, h: 620 };

/**
 * 简单地图画布
 * @param image 底图 dataUrl；缺省时显示"未上传底图"空态
 * @param markers 图面标记（百分比坐标）
 * @param selected 选中标记 id
 * @param onSelect 标记点击回调
 * @param onAdd 图面点击新增点位回调（返回百分比坐标）；不传则不打点
 * @param onBlank 图面**空白处**点击回调（返回百分比坐标）：直线 / 曲线连点时的「收尾 / 取消」入口
 * @param hint 底部提示文案（覆盖默认，说明当前工具怎么用）
 * @param showIds 是否在标记上显示编号尾号
 * @param showLabels 是否在标记旁显示中文名称（p_N / 自定义名）
 * @param height 画布高度（px）
 */
export function MapImageCanvas({
  image,
  markers = [],
  selected,
  onSelect,
  onAdd,
  onBlank,
  track,
  paths,
  areas,
  onHover,
  onSelectPath,
  hint,
  showIds = false,
  showLabels = false,
  height = 440,
  fill = false,
}: {
  image?: string;
  markers?: ImageMarker[];
  selected?: string;
  onSelect?: (id: string) => void;
  onAdd?: (x: number, y: number) => void;
  /** 图面空白处点击（不新增点位时用；点标记 / 折线不会触发） */
  onBlank?: (x: number, y: number) => void;
  /** 轨迹折线（百分比坐标，按顺序连线）；少于 2 点不绘制 */
  track?: { x: number; y: number }[];
  /** 多条折线（标定工作台的路网：直线 / 弧），与底图同一百分比坐标系 */
  paths?: {
    id: string;
    kind?: string;
    points: { x: number; y: number }[];
    /** 选中态：加粗高亮（标定工作台点选元素） */
    selected?: boolean;
  }[];
  /** 折线点选回调（标定工作台「元素选择」） */
  onSelectPath?: (id: string) => void;
  /**
   * 区域范围（闭合多边形）层：区域配置画范围、地图详情展示范围共用
   * @description closed = 已闭合的成品范围（填色）；否则只画绘制中的虚线草稿
   */
  areas?: {
    id: string;
    name?: string;
    points: { x: number; y: number }[];
    closed?: boolean;
  }[];
  /** 鼠标在图面移动时回报百分比坐标（标定工作台的「实时位姿」） */
  onHover?: (x: number, y: number) => void;
  /** 底部提示文案（覆盖默认） */
  hint?: string;
  showIds?: boolean;
  showLabels?: boolean;
  height?: number;
  /**
   * 撑满父容器高度
   * @description 整页编辑（如区域内置页）用：画布高度由父级布局决定，
   *              窗口变高时地图跟着长，而不是永远 430px、下面留一大片空白
   */
  fill?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** 底图原始像素尺寸 */
  const [nat, SETNAT] = useState(DEFAULT_NAT);
  /** 画布可用尺寸 */
  const [size, SETSIZE] = useState({ w: 0, h: 0 });

  // 画布尺寸变化时重算底图绘制区，保证图片与标记同步缩放
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => SETSIZE({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [image, height]);

  /** 固定高度 / 撑满父容器二选一 */
  const boxStyle = fill ? { height: "100%" } : { height };

  if (!image) {
    return (
      <div className="map-image empty" style={boxStyle}>
        <span>尚未上传底图</span>
        <small>请先上传一张巡检地图图片，上传后即可在图上标注点位</small>
      </div>
    );
  }

  // 等比缩放：底图完整放进画布（不裁切、不变形），标记以该绘制区为参照
  const scale =
    size.w && size.h ? Math.min(size.w / nat.w, size.h / nat.h) : 1;
  const plate = {
    width: Math.round(nat.w * scale),
    height: Math.round(nat.h * scale),
  };

  return (
    <div className="map-image" style={boxStyle} ref={box}>
      <div
        className={"map-plate" + (onAdd || onBlank ? " editable" : "")}
        style={plate}
        role={onAdd ? "button" : undefined}
        aria-label={
          onAdd
            ? "点击图面标注点位"
            : onBlank
              ? "点击图面空白处收尾或取消连线"
              : "地图预览"
        }
        onClick={(e) => {
          // 标记与折线自身 stopPropagation，所以这里只会在真正的空白处触发
          if (!onAdd && !onBlank) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * 100;
          const y = ((e.clientY - r.top) / r.height) * 100;
          if (x < 0 || x > 100 || y < 0 || y > 100) return;
          const px = Math.round(x * 10) / 10;
          const py = Math.round(y * 10) / 10;
          if (onAdd) onAdd(px, py);
          else onBlank?.(px, py);
        }}
        onMouseMove={(e) => {
          if (!onHover) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * 100;
          const y = ((e.clientY - r.top) / r.height) * 100;
          onHover(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
        }}
      >
        <img
          src={image}
          alt="地图底图"
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            if (el.naturalWidth && el.naturalHeight)
              SETNAT({ w: el.naturalWidth, h: el.naturalHeight });
          }}
        />
        {/* 轨迹折线：坐标系与底图绘制区一致（0–100 百分比），随底图等比缩放 */}
        {track && track.length > 1 && (
          <svg
            className="map-track"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={track.map((p) => `${p.x},${p.y}`).join(" ")}
              vectorEffect="non-scaling-stroke"
            />
            {track.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={0.7} />
            ))}
          </svg>
        )}
        {/* 多段路网线（直线 / 弧）：与底图同一百分比坐标系，随底图等比缩放 */}
        {!!paths?.length && (
          <svg
            className="map-track map-paths"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {paths.map((p) => (
              <polyline
                key={p.id}
                points={p.points.map((v) => `${v.x},${v.y}`).join(" ")}
                vectorEffect="non-scaling-stroke"
                className={
                  (p.kind === "直线"
                    ? "path-line"
                    : p.kind === "预览"
                      ? "path-preview"
                      : "path-arc") + (p.selected ? " path-selected" : "")
                }
                style={
                  onSelectPath
                    ? { pointerEvents: "stroke", cursor: "pointer" }
                    : undefined
                }
                onClick={
                  onSelectPath
                    ? (e) => {
                        e.stopPropagation();
                        onSelectPath(p.id);
                      }
                    : undefined
                }
              />
            ))}
          </svg>
        )}
        {/* 区域范围：闭合多边形填色 + 虚线草稿，与底图同一百分比坐标系 */}
        {!!areas?.length && (
          <svg
            className="map-track map-areas"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {areas.map((a) => {
              if (a.points.length < 2) return null;
              const pts = a.points.map((v) => `${v.x},${v.y}`).join(" ");
              const cx = a.points.reduce((n, p) => n + p.x, 0) / a.points.length;
              const cy = a.points.reduce((n, p) => n + p.y, 0) / a.points.length;
              return (
                <g key={a.id} className={a.closed ? "area-shape" : "area-draft"}>
                  <polygon
                    points={
                      a.closed ? pts : `${pts} ${a.points[0].x},${a.points[0].y}`
                    }
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* 草稿态：逐顶点画圆点，提示还可继续加点；成品态只在中心标名称 */}
                  {!a.closed &&
                    a.points.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={0.6} />
                    ))}
                  {a.closed && a.name && (
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {a.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {markers.map((mk) => (
          <React.Fragment key={mk.id}>
            <button
              type="button"
              className={
                "map-marker" +
                (selected === mk.id ? " selected" : "") +
                (mk.state === "已确认" ? " done" : "") +
                (mk.source === "平台新增" ? " added" : "") +
                (mk.draft ? " draft" : "")
              }
              style={{ left: `${mk.x}%`, top: `${mk.y}%` }}
              title={`${mk.label || mk.id}${mk.kind ? " · " + mk.kind : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(mk.id);
              }}
            >
              {showIds ? mk.id.slice(-4) : ""}
            </button>
            {showLabels && mk.label && (
              <span
                className="map-marker-label"
                style={{ left: `${mk.x + 1.2}%`, top: `${mk.y - 1}%` }}
              >
                {mk.label}
              </span>
            )}
          </React.Fragment>
        ))}
        {/* 选中光圈：跟随 selected marker 位置，给底图 img 叠加醒目定位反馈 */}
        {(() => {
          const sel = markers.find((m) => m.id === selected);
          if (!sel) return null;
          return (
            <>
              <span
                className="map-marker-halo"
                style={{ left: `${sel.x}%`, top: `${sel.y}%` }}
              />
              <span
                className="map-marker-crosshair"
                style={{ left: `${sel.x}%`, top: `${sel.y}%` }}
              />
            </>
          );
        })()}
        <span className="map-image-hint">
          {hint ||
            (onAdd
              ? "点击图面标注点位"
              : onSelect
                ? "点击图面定位ID点完成绑定"
                : "只读预览")}
        </span>
      </div>
    </div>
  );
}
