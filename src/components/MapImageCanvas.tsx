/**
 * @file MapImageCanvas.tsx
 * @description 简易地图画布：以「用户上传的地图图片」为底图，点击图面即可标注点位。
 *              不含点云/轨道/充电桩等复杂图层（那些由 MapCanvas 在驾驶舱等场景使用）。
 * @interaction 被 Annotation.tsx、MapOnboarding.tsx、MapSurveyPanel.tsx 消费
 */
import { useEffect, useRef, useState } from "react";

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
}

/** 底图缺省尺寸（示例底图 1000×620）；图片加载后按真实像素覆盖 */
const DEFAULT_NAT = { w: 1000, h: 620 };

/**
 * 简单地图画布
 * @param image 底图 dataUrl；缺省时显示"未上传底图"空态
 * @param markers 图面标记（百分比坐标）
 * @param selected 选中标记 id
 * @param onSelect 标记点击回调
 * @param onAdd 图面点击新增点位回调（返回百分比坐标）；不传则只读
 * @param showIds 是否在标记上显示编号尾号
 * @param height 画布高度（px）
 */
export function MapImageCanvas({
  image,
  markers = [],
  selected,
  onSelect,
  onAdd,
  track,
  showIds = false,
  height = 440,
}: {
  image?: string;
  markers?: ImageMarker[];
  selected?: string;
  onSelect?: (id: string) => void;
  onAdd?: (x: number, y: number) => void;
  /** 轨迹折线（百分比坐标，按顺序连线）；少于 2 点不绘制 */
  track?: { x: number; y: number }[];
  showIds?: boolean;
  height?: number;
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

  if (!image) {
    return (
      <div className="map-image empty" style={{ height }}>
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
    <div className="map-image" style={{ height }} ref={box}>
      <div
        className={"map-plate" + (onAdd ? " editable" : "")}
        style={plate}
        role={onAdd ? "button" : undefined}
        aria-label={onAdd ? "点击图面标注点位" : "地图预览"}
        onClick={(e) => {
          if (!onAdd) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * 100;
          const y = ((e.clientY - r.top) / r.height) * 100;
          if (x >= 0 && x <= 100 && y >= 0 && y <= 100)
            onAdd(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
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
        {markers.map((mk) => (
          <button
            key={mk.id}
            type="button"
            className={
              "map-marker" +
              (selected === mk.id ? " selected" : "") +
              (mk.state === "已确认" ? " done" : "") +
              (mk.source === "平台新增" ? " added" : "")
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
        ))}
        <span className="map-image-hint">{onAdd ? "点击图面标注点位" : "只读预览"}</span>
      </div>
    </div>
  );
}
