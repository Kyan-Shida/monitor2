/**
 * @file RoutePreview.tsx
 * @description 巡检路线预览：底图 + 父线（区域地图上的完整路网）+ 子线（选中巡检点按顺序、沿父线连线）
 * @interaction Planning.tsx（巡检路线编辑弹窗）
 *
 * 术语口径：
 * - 父线 = 一张区域地图上的完整路网（标定工作台画出的线 / 弧），是子线的基线；
 * - 子线 = 从父线上挑选若干巡检点、按执行顺序连成的路线（即一条「巡检路线」）；
 * - 机器狗沿父线行驶、按子线的点位顺序作业，故相邻停靠点之间**沿路网**画线（不直连，避免"穿墙"）。
 *
 * 坐标口径与 MapImageCanvas 一致：底图等比缩放后得到绘制区（plate），
 * 停靠点与连线都以该绘制区为参照定位，保证图与点严格对齐、不变形。
 */
import { useEffect, useRef, useState } from "react";
import { useStore } from "../data/store";
import { targetsOf } from "../data/mapCalibration";
import { shortestRoadPath } from "../data/roadnet";
import { SAMPLE_MAP_IMAGE } from "../data/sampleMap";
import { Note } from "./UI";
import type { MapAsset, Point } from "../data/types";

/** 底图缺省像素尺寸（与画布口径一致）；图片加载后按真实像素覆盖 */
const DEFAULT_NAT = { w: 1000, h: 620 };
/** 预览区高度（px）：够看清路网，又不至于把弹窗撑太长 */
const PREVIEW_H = 320;

export function RoutePreview({
  map,
  stops,
}: {
  /** 父线所属地图 */
  map?: MapAsset;
  /** 子线停靠点：**数组顺序即机器狗执行顺序** */
  stops: Point[];
}) {
  const { s } = useStore();
  /** 是否叠加显示父线（默认显示，可单独只看子线） */
  const [showParent, SP] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const [nat, SETNAT] = useState(DEFAULT_NAT);
  const [size, SETSIZE] = useState({ w: 0, h: 0 });

  // 容器尺寸变化时重算绘制区，保证底图与点位同步缩放
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => SETSIZE({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [map?.id]);

  if (!map)
    return (
      <section className="route-preview">
        <Note>请先选择父线地图，再挑选巡检点组成子线。</Note>
      </section>
    );

  /** 该图的定位点：父线与子线共用同一份坐标（与标定工作台 / 现场采集同源） */
  const targets = targetsOf(s, map.id);
  const at = (targetId: string) => targets.find((t) => t.id === targetId);
  /** 能在本图定位到的停靠点（跨图残留的点不参与绘制） */
  const located = stops.filter((p) => at(p.targetId));
  const missing = stops.length - located.length;
  const parentPaths = map.roadnet?.paths || [];
  /**
   * 子线分段：相邻两个停靠点之间**沿父线（道路）走**
   * @description 取父线上的最短路径；两点在父线上不连通时退回直连，并在图下给出补线提示
   */
  const legs = located.slice(1).map((p, i) => {
    const from = located[i].targetId;
    const to = p.targetId;
    const road = shortestRoadPath(parentPaths, at, from, to);
    return {
      key: p.id,
      onRoad: !!road,
      pts: (road || [from, to])
        .map((id) => at(id))
        .filter(Boolean) as { x: number; y: number }[],
    };
  });
  /**
   * 父线上不连通的子线段（带上两端停靠点）
   * @description 提示里直接点名"哪两点之间需要补线"，比只给个数量好定位
   */
  const offRoadLegs = legs
    .map((l, i) => ({ ...l, from: located[i], to: located[i + 1] }))
    .filter((l) => !l.onRoad);
  /**
   * 引用了「不在本图」的定位点、因而画不出来的父线段数
   * @description 点位归属修正（如装置区的点迁到装置区地图）会让历史路网引用失效，
   *              以前是静默跳过、表现为"父线断了"，这里显式提示
   */
  const brokenParentRefs = parentPaths.filter((v) =>
    v.pointIds.some((id) => !at(id)),
  ).length;
  /** 等比缩放：底图完整放进预览区，点位以该绘制区为参照 */
  const scale = size.w && size.h ? Math.min(size.w / nat.w, size.h / nat.h) : 1;
  const plate = {
    width: Math.round(nat.w * scale),
    height: Math.round(nat.h * scale),
  };

  return (
    <section className="route-preview">
      <div className="route-preview-head">
        <b>路线预览（子线）</b>
        <span className="muted">
          父线：{map.name} · 路网 {parentPaths.length} 条
        </span>
        <label className="route-preview-toggle">
          <input
            type="checkbox"
            checked={showParent}
            onChange={() => SP(!showParent)}
          />
          显示父线
        </label>
      </div>
      <div
        className="route-preview-body"
        style={{ height: PREVIEW_H }}
        ref={box}
      >
        <div className="route-plate" style={plate}>
          <img
            src={map.image || SAMPLE_MAP_IMAGE}
            alt={`${map.name} 底图`}
            onLoad={(e) => {
              const el = e.currentTarget;
              if (el.naturalWidth && el.naturalHeight)
                SETNAT({ w: el.naturalWidth, h: el.naturalHeight });
            }}
          />
          {/* 逐段 line 用百分比坐标绘制：无 viewBox 拉伸，箭头不会被拉变形 */}
          <svg className="route-svg" aria-hidden="true">
            <defs>
              <marker
                id="route-arrow"
                markerWidth="7"
                markerHeight="7"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L6,3 z" className="route-arrow-head" />
              </marker>
            </defs>
            {/* 父线：浅灰虚线，代表地图上的完整路网（子线的基线） */}
            {showParent &&
              parentPaths.map((v) =>
                v.pointIds.slice(1).map((pid, i) => {
                  const a = at(v.pointIds[i]);
                  const b = at(pid);
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`${v.id}-${i}`}
                      x1={`${a.x}%`}
                      y1={`${a.y}%`}
                      x2={`${b.x}%`}
                      y2={`${b.y}%`}
                      className="route-parent"
                    />
                  );
                }),
              )}
            {/* 父线端点：小圆点标出，断口位置一眼可见（便于回标定工作台补连） */}
            {showParent &&
              parentPaths.flatMap((v) =>
                [v.pointIds[0], v.pointIds[v.pointIds.length - 1]].map(
                  (id, i) => {
                    const t = at(id);
                    if (!t) return null;
                    return (
                      <circle
                        key={`${v.id}-node-${i}`}
                        cx={`${t.x}%`}
                        cy={`${t.y}%`}
                        r={3.5}
                        className="route-parent-node"
                      />
                    );
                  },
                ),
              )}
            {/* 子线：相邻停靠点之间沿父线走，逐段画线并在每段末尾标方向 */}
            {legs.map((leg) =>
              leg.pts.slice(1).map((pt, i) => {
                const prev = leg.pts[i];
                return (
                  <line
                    key={`${leg.key}-${i}`}
                    x1={`${prev.x}%`}
                    y1={`${prev.y}%`}
                    x2={`${pt.x}%`}
                    y2={`${pt.y}%`}
                    className={"route-seg" + (leg.onRoad ? "" : " off-road")}
                    markerEnd={
                      i === leg.pts.length - 2 ? "url(#route-arrow)" : undefined
                    }
                  />
                );
              }),
            )}
          </svg>
          {/* 停靠点：序号即机器狗的执行顺序 */}
          {located.map((p, i) => {
            const t = at(p.targetId)!;
            return (
              <span
                key={p.id}
                className="route-stop"
                style={{ left: `${t.x}%`, top: `${t.y}%` }}
                title={`${i + 1}. ${p.name}`}
              >
                {i + 1}
              </span>
            );
          })}
          {!located.length && (
            <p className="route-preview-empty">还没有选中巡检点，子线尚为空。</p>
          )}
        </div>
      </div>
      {brokenParentRefs > 0 && (
        <Note>
          有 <b>{brokenParentRefs}</b>{" "}
          段父线引用的定位点已不在本图（例如装置区的点随点位归属迁到了装置区地图），
          因此未绘制；可到「地图管理 › 编辑（地图标定）」重新连线，或保存一次路网以清理这些段。
        </Note>
      )}
      {missing > 0 && (
        <Note>
          有 <b>{missing}</b> 个已选巡检点不在当前父线地图上，未参与预览；
          一条路线（子线）只能属于同一张地图，请先在下方取消这些点的勾选。
        </Note>
      )}
    </section>
  );
}
