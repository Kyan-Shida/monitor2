/**
 * @file RoutePreview.tsx
 * @description 巡检路线预览：底图 + 父线（区域地图上的完整路网）+ 子线（选中巡检点按顺序、沿父线连线）
 * @interaction Planning.tsx（巡检路线编辑 / 编辑内置页）、QuickTaskDrawer.tsx（临时任务）
 *
 * 术语口径：
 * - 固定路线 = 一张区域地图上的完整路网（标定工作台画出的线 / 弧），是巡检路线的基线；
 * - 自定义路线 = 不走路网、在图上自绘的线路（保存后停用，须导航验证后才可启用）；
 * - 机器狗沿固定路线行驶、按路线的点位顺序作业，故相邻停靠点之间**沿路网**画线（不直连，避免"穿墙"）。
 *
 * 坐标口径与 MapImageCanvas 一致：底图等比缩放后得到绘制区（plate），
 * 停靠点与连线都以该绘制区为参照定位，保证图与点严格对齐、不变形。
 */
import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useStore } from "../data/store";
import { targetsOf } from "../data/mapCalibration";
import { shortestRoadPath } from "../data/roadnet";
import { SAMPLE_MAP_IMAGE } from "../data/sampleMap";
import { Btn, Note } from "./UI";
import type { MapAsset, Point, RouteNode } from "../data/types";

/** 底图缺省像素尺寸（与画布口径一致）；图片加载后按真实像素覆盖 */
const DEFAULT_NAT = { w: 1000, h: 620 };
/** 预览区高度（px）：够看清路网，又不至于把弹窗撑太长 */
const PREVIEW_H = 320;
/**
 * 绘制 / 选择工具（与「地图标定工作台」同一套工具位，见 styles.css 的 .calib-tool）
 * @description 元素选择 = 点选图上已有元素并查看参数；
 *              直线 / 曲线 = 就近吸附「已选巡检点」落点，段按直线连或二次贝塞尔平滑
 */
const TOOLS = ["元素选择", "直线", "曲线"] as const;
type Tool = (typeof TOOLS)[number];
/** 吸附半径（百分比坐标）：点在定位点附近多少以内算「点中了它」 */
const SNAP_R = 4;

export function RoutePreview({
  map,
  stops,
  path,
  onPathChange,
  height = PREVIEW_H,
}: {
  /** 父线所属地图 */
  map?: MapAsset;
  /** 子线停靠点：**数组顺序即机器狗执行顺序** */
  stops: Point[];
  /**
   * 自定义线路锚点
   * @description 传数组即进入「自定义路线」模式（不再沿父线寻路，改用这条自绘线路）；
   *              传 undefined 表示跟随父线
   */
  path?: RouteNode[];
  /**
   * 自定义线路变化回调
   * @param next 新锚点序列；传 undefined = 放弃自定义，恢复「跟随父线」
   */
  onPathChange?: (next?: RouteNode[]) => void;
  /** 预览区高度（内置页可放高一些） */
  height?: number;
}) {
  const { s } = useStore();
  /** 是否叠加显示父线（默认显示，可单独只看子线） */
  const [showParent, SP] = useState(true);
  /** 当前工具（默认「元素选择」：点图先看参数，不误落点） */
  const [tool, TOOL] = useState<Tool>("元素选择");
  /** 是否在停靠点旁显示巡检点名称（对应工具条「显示点名称」开关） */
  const [showLabels, SETLABELS] = useState(false);
  /**
   * 选中的元素 id（父线 / 停靠点 / 自定义路线节点）
   * @description 前缀区分三类元素，右侧参数面板按前缀取对应参数
   */
  const [sel, SEL] = useState("");
  /** 「元素浏览」抽屉：列出图上全部元素，点行即选中并高亮 */
  const [browse, BROWSE] = useState(false);
  /**
   * 是否处于「自定义路线」模式
   * @description 由上层是否传入 path 驱动：自定义线路不走父线，须先在图上画线并经导航验证
   */
  const custom = !!onPathChange && path !== undefined;
  /**
   * 是否具备编辑器形态（工具条 + 右侧参数面板）
   * @description 只有传了 onPathChange 的宿主（「巡检路线」编辑页）才是可编辑的；
   *              任务详情等只读预览不显示工具条与参数面板，保持紧凑
   */
  const editor = !!onPathChange;
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
        <Note>请先选择固定路线地图，再挑选巡检点组成路线。</Note>
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
  /**
   * 自定义模式：把画布点击落成路径锚点
   * @description 只吸附「已选巡检点」的定位点 —— 不新建、不删除任何业务点位；
   *              落在点位上时直接引用其坐标，避免手抖把线画歪。
   *              `pointId` 记的是**巡检点 id**（不是定位点 target id）：它是路线落库时
   *              机器狗的执行停靠点，引擎按 `s.points` 查，写错口径会被判「所选巡检点不存在」
   * @param e 画布点击事件（换算为底图百分比坐标，与绘制口径一致）
   */
  const addNode = (e: ReactMouseEvent<HTMLDivElement>) => {
    // 「元素选择」只做选中，不落点；不在自定义模式时也不能落点
    if (!custom || !onPathChange || tool === "元素选择") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    /**
     * 就近吸附「已选巡检点」的定位点
     * @description 直线 / 曲线都吸附（手抖也能准确落在点位上）；离所有点位都超过
     *              吸附半径时，才落成自由锚点（绕行 / 拐角用）
     */
    const hit = located.find((p) => {
      const t = at(p.targetId)!;
      return Math.hypot(t.x - x, t.y - y) < SNAP_R;
    });
    /** 吸附点的定位点：只用来取吸附后的坐标（去掉手抖偏差） */
    const t = hit ? at(hit.targetId) : undefined;
    onPathChange([
      ...(path || []),
      t && hit
        ? { x: t.x, y: t.y, pointId: hit.id, curve: tool === "曲线" }
        : { x, y, curve: tool === "曲线" },
    ]);
  };
  /**
   * 就近拾取元素（「元素选择」工具）
   * @param x 点击处百分比横坐标
   * @param y 点击处百分比纵坐标
   * @returns 元素 id（`node:` 路线节点 / `stop:` 停靠点 / `parent:` 父线）；都没命中返回空串（清空选中）
   * @description 三类元素放在一起比距离，取最近的那个：从近到远分别是路线节点 → 停靠点 → 父线端点。
   *              父线只按**端点**命中（线体在 SVG 里 pointer-events: none，接不到点击），
   *              要按整条线选请用工具条右侧的「元素浏览」
   */
  const pickNearest = (x: number, y: number): string => {
    const dist = (px: number, py: number) => Math.hypot(px - x, py - y);
    let best = "";
    let bestD = SNAP_R;
    (path || []).forEach((n, i) => {
      const d = dist(n.x, n.y);
      if (d < bestD) {
        bestD = d;
        best = `node:${i}`;
      }
    });
    located.forEach((p) => {
      const t = at(p.targetId);
      if (!t) return;
      const d = dist(t.x, t.y);
      if (d < bestD) {
        bestD = d;
        best = `stop:${p.id}`;
      }
    });
    if (showParent)
      parentPaths.forEach((v) =>
        v.pointIds.forEach((id) => {
          const t = at(id);
          if (!t) return;
          const d = dist(t.x, t.y);
          if (d < bestD) {
            bestD = d;
            best = `parent:${v.id}`;
          }
        }),
      );
    return best;
  };
  /**
   * 图面点击总入口
   * @description 「元素选择」= 拾取最近元素（点空白则清空选中）；落点工具 = 落锚点。
   *              未开启编辑器（只读预览）时不响应
   * @param e 画布点击事件
   */
  const onPlateClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!editor) return;
    if (tool === "元素选择") {
      const r = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      SEL(pickNearest(x, y));
      return;
    }
    addNode(e);
  };
  /**
   * 点击停靠点徽标（序号圆点）
   * @description 与图面点击同语义：元素选择时选中它；落点工具时把这个停靠点作为锚点落进路线。
   *              徽标在 DOM 里会拦掉图面点击（它自己就是可点元素），故必须显式处理一次
   * @param p 停靠点
   */
  const clickStop = (p: Point) => (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (!editor) return;
    if (tool === "元素选择") {
      SEL(`stop:${p.id}`);
      return;
    }
    if (!custom || !onPathChange) return;
    const t = at(p.targetId);
    if (!t) return;
    onPathChange([
      ...(path || []),
      { x: t.x, y: t.y, pointId: p.id, curve: tool === "曲线" },
    ]);
  };
  /** 等比缩放：底图完整放进预览区，点位以该绘制区为参照 */
  const scale = size.w && size.h ? Math.min(size.w / nat.w, size.h / nat.h) : 1;
  const plate = {
    width: Math.round(nat.w * scale),
    height: Math.round(nat.h * scale),
  };
  /**
   * 曲线段的 path 指令（绘制区像素坐标）
   * @description SVG path 的 d 不支持百分比，故按绘制区像素换算；控制点取中点沿垂直方向
   *              偏移段长的 18%，得到自然弧度（偏移方向随行进方向一致，不走形）
   * @param a 段起点（底图百分比坐标）
   * @param b 段终点（底图百分比坐标）
   */
  const curveD = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const ax = (a.x / 100) * plate.width;
    const ay = (a.y / 100) * plate.height;
    const bx = (b.x / 100) * plate.width;
    const by = (b.y / 100) * plate.height;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const cx = (ax + bx) / 2 - (dy / len) * len * 0.18;
    const cy = (ay + by) / 2 + (dx / len) * len * 0.18;
    return `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  };

  /* ── 选中元素 → 右侧参数面板取数 ───────────────────────────────
     三类元素（父线 / 停靠点 / 自定义路线节点）用 id 前缀区分，避免三套并列 state */
  const selStop = sel.startsWith("stop:")
    ? located.find((p) => `stop:${p.id}` === sel)
    : undefined;
  const selPath = sel.startsWith("parent:")
    ? parentPaths.find((v) => `parent:${v.id}` === sel)
    : undefined;
  const selNodeIdx = sel.startsWith("node:") ? Number(sel.slice(5)) : -1;
  const selNode = selNodeIdx >= 0 ? (path || [])[selNodeIdx] : undefined;
  /** 选中节点吸附到的巡检点（没有吸附 = 自由锚点） */
  const selNodePoint = selNode?.pointId
    ? located.find((p) => p.id === selNode.pointId)
    : undefined;
  /**
   * 删除当前选中元素
   * @description 只允许删「自定义路线节点」：父线属于地图路网、停靠点属于巡检点主数据，
   *              要改得回各自的工作台（标定 / 点位管理），不在这里越权删除
   */
  const removeSel = () => {
    if (selNodeIdx < 0 || !onPathChange) return;
    onPathChange((path || []).filter((_, j) => j !== selNodeIdx));
    SEL("");
  };
  /**
   * 定位点坐标文案（百分比坐标）
   * @param targetId 定位点 id（巡检点在底图上的坐标记录）
   * @returns `id · x 12.34% · y 56.78%`；本图查不到该定位点时返回「—」
   * @description 与 RoutePreview 绘制口径同源（都取自 targetsOf），故面板数值即图面落点
   */
  const coordText = (targetId: string) => {
    const t = at(targetId);
    return t ? `${t.id} · x ${t.x.toFixed(2)}% · y ${t.y.toFixed(2)}%` : "—";
  };
  /** 「元素浏览」清单：停靠点 / 自定义路线节点 / 父线，点行即选中并高亮 */
  const browseRows: { key: string; type: string; name: string }[] = [
    ...located.map((p, i) => ({
      key: `stop:${p.id}`,
      type: "停靠点",
      name: `${i + 1}. ${p.name}`,
    })),
    ...(path || []).map((n, i) => ({
      key: `node:${i}`,
      type: "路线节点",
      name: `N_${i + 1} · ${
        n.pointId ? `吸附 ${located.find((p) => p.id === n.pointId)?.name || n.pointId}` : "自由锚点"
      }`,
    })),
    ...parentPaths.map((v) => ({
      key: `parent:${v.id}`,
      type: "固定路线",
      name: `${v.name || v.id} · ${v.kind} · ${v.pointIds.length} 节点`,
    })),
  ];

  return (
    <section className="route-preview">
      <div className="route-preview-head">
        <b>路线预览{custom ? "（自定义路线）" : "（固定路线）"}</b>
        <span className="muted">
          固定路线：{map.name} · 路网 {parentPaths.length} 条
        </span>
        <div className="route-preview-tools">
          {onPathChange && (
            <Btn
              onClick={() => {
                // 进入自定义 = 要开始画线，顺手切到落点工具，避免进来点图没反应
                const next = custom ? undefined : [];
                onPathChange(next);
                TOOL(custom ? "元素选择" : "直线");
                SEL("");
              }}
            >
              {custom ? "恢复固定路线" : "自定义路线"}
            </Btn>
          )}
          <label className="route-preview-toggle">
            <input
              type="checkbox"
              checked={showParent}
              onChange={() => SP(!showParent)}
            />
            显示固定路线
          </label>
        </div>
      </div>
      {/*
        工具条：与「地图标定工作台」同一套工具位与样式（.calib-tools / .calib-tool）
        工具 = 元素选择（点选看参数）/ 直线 / 曲线（就近吸附巡检点连线）
      */}
      {editor && (
        <div className="calib-tools route-editor-tools">
          <span className="calib-tools-label">工具</span>
          {TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              className={"calib-tool" + (tool === t ? " on" : "")}
              title={
                t === "元素选择"
                  ? "点选图上的停靠点 / 固定路线 / 路线节点，右侧查看参数"
                  : custom
                    ? `点击图面落点，就近吸附巡检点、${
                        t === "直线" ? "直线" : "平滑"
                      }连接`
                    : "先点右侧「自定义路线」才能在图面落点"
              }
              // 落点类工具只在自定义模式下可用（不自定义就没有自绘线路可画）
              disabled={t !== "元素选择" && !custom}
              onClick={() => TOOL(t)}
            >
              {t}
            </button>
          ))}
          {selNodeIdx >= 0 && (
            <button
              type="button"
              className="calib-delete"
              title="删除该路线节点"
              onClick={removeSel}
            >
              <span className="calib-delete-ic">✕</span>
              删除选中
            </button>
          )}
          <span className="calib-tools-sep"></span>
          <label className="calib-toggle">
            <span>显示点名称</span>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => SETLABELS(e.target.checked)}
            />
            <span className="calib-toggle-track"></span>
          </label>
          <span className="calib-tools-sep"></span>
          <Btn small onClick={() => BROWSE(true)}>
            元素浏览
          </Btn>
          {/* 落点类工具：把「怎么落点」和撤销入口就摆在手边 */}
          {tool !== "元素选择" && (
            <>
              <span className="calib-tools-sep"></span>
              <span className="calib-tip-inline">
                {tool === "直线" ? "点图落点，直线连接" : "点图落点，平滑连接"}
              </span>
              <span className="calib-tip-inline">
                已落 <b>{(path || []).length}</b> 段
              </span>
              <Btn
                small
                disabled={!path?.length}
                onClick={() => onPathChange?.((path || []).slice(0, -1))}
              >
                撤销
              </Btn>
              <Btn
                small
                disabled={!path?.length}
                onClick={() => onPathChange?.([])}
              >
                清空
              </Btn>
            </>
          )}
        </div>
      )}
      {/* 编辑器形态：图面（左）+ 选中元素参数面板（右）；只读预览时不带参数面板，单栏紧凑 */}
      <div className={"route-editor" + (editor ? "" : " solo")}>
      <div
        className={
          "route-preview-body" +
          (custom && tool !== "元素选择" ? " picking" : "")
        }
        style={{ height }}
        ref={box}
      >
        <div
          className={
            "route-plate" +
            (editor && tool === "元素选择" ? " select-mode" : "")
          }
          style={plate}
          onClick={onPlateClick}
        >
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
            {/* 子线：相邻停靠点之间沿父线走，逐段画线并在每段末尾标方向（自定义模式改画自绘线） */}
            {!custom &&
              legs.map((leg) =>
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
            {/* 自定义线路：按点选顺序逐段连接（不走父线）；吸附的巡检点即机器狗执行停靠点。
                直线段直接连、曲线段按二次贝塞尔平滑（工具条「直线 / 曲线」逐段生效） */}
            {custom &&
              (path || []).slice(1).map((n, i) => {
                const prev = (path || [])[i];
                const last = i === (path || []).length - 2;
                return n.curve ? (
                  <path
                    key={`custom-seg-${i}`}
                    d={curveD(prev, n)}
                    className="route-seg custom"
                    markerEnd={last ? "url(#route-arrow)" : undefined}
                  />
                ) : (
                  <line
                    key={`custom-seg-${i}`}
                    x1={`${prev.x}%`}
                    y1={`${prev.y}%`}
                    x2={`${n.x}%`}
                    y2={`${n.y}%`}
                    className="route-seg custom"
                    markerEnd={last ? "url(#route-arrow)" : undefined}
                  />
                );
              })}
            {custom &&
              (path || []).map((n, i) => (
                <circle
                  key={`custom-node-${i}`}
                  cx={`${n.x}%`}
                  cy={`${n.y}%`}
                  r={4}
                  className={"route-node" + (n.pointId ? " anchored" : "")}
                />
              ))}
          </svg>
          {/* 停靠点：序号即机器狗的执行顺序 */}
          {located.map((p, i) => {
            const t = at(p.targetId)!;
            return (
              <span
                key={p.id}
                className={
                  "route-stop" +
                  (sel === `stop:${p.id}` ? " on" : "") +
                  (showLabels ? " labeled" : "")
                }
                style={{ left: `${t.x}%`, top: `${t.y}%` }}
                title={`${i + 1}. ${p.name}`}
                onClick={clickStop(p)}
              >
                {i + 1}
              </span>
            );
          })}
          {/* 显示点名称：停靠点旁跟一个名牌（数据来自巡检点主数据，非模拟） */}
          {showLabels &&
            located.map((p) => {
              const t = at(p.targetId)!;
              return (
                <span
                  key={`label-${p.id}`}
                  className="route-stop-label"
                  style={{ left: `${t.x}%`, top: `${t.y}%` }}
                >
                  {p.name}
                </span>
              );
            })}
          {custom && !(path || []).length && (
            <p className="route-preview-empty">在图上依次点选巡检点，画出新路线。</p>
          )}
          {!located.length && (
            <p className="route-preview-empty">还没有选中巡检点，路线尚为空。</p>
          )}
        </div>
      </div>
      {/*
        选中元素参数面板（与「地图标定工作台」右栏同形）：
        按选中元素类型（停靠点 / 父线 / 自定义路线节点）给各自的参数；
        父线、停靠点只读（要改去各自的工作台），只有自绘节点可删
      */}
      {editor && (
        <aside className="route-param">
          <div className="route-param-head">
            <b>参数</b>
            {sel && (
              <button
                type="button"
                className="route-param-clear"
                onClick={() => SEL("")}
              >
                取消选择
              </button>
            )}
          </div>
          {!sel && (
            <p className="route-param-empty">
              用「元素选择」点图上的停靠点 / 父线端点 / 路线节点，这里显示它的参数。
            </p>
          )}
          {selStop && (
            <dl className="route-param-list">
              <dt>元素类型</dt>
              <dd>停靠点</dd>
              <dt>执行序号</dt>
              <dd>{located.findIndex((x) => x.id === selStop.id) + 1}</dd>
              <dt>巡检点</dt>
              <dd>
                {selStop.name} · {selStop.id}
              </dd>
              <dt>所属设备</dt>
              <dd>{selStop.device || "—"}</dd>
              <dt>检测项</dt>
              <dd>{selStop.item || "—"}</dd>
              <dt>定位坐标</dt>
              <dd>{coordText(selStop.targetId)}</dd>
            </dl>
          )}
          {selPath && (
            <dl className="route-param-list">
              <dt>元素类型</dt>
              <dd>固定路线（地图路网）</dd>
              <dt>线路名称</dt>
              <dd>{selPath.name || selPath.id}</dd>
              <dt>线路类型</dt>
              <dd>{selPath.kind}</dd>
              <dt>节点数</dt>
              <dd>{selPath.pointIds.length}</dd>
              <dt>起点 / 终点</dt>
              <dd>
                {selPath.pointIds[0] || "—"} →{" "}
                {selPath.pointIds[selPath.pointIds.length - 1] || "—"}
              </dd>
            </dl>
          )}
          {selNode && (
            <dl className="route-param-list">
              <dt>元素类型</dt>
              <dd>自定义路线节点</dd>
              <dt>节点序号</dt>
              <dd>{selNodeIdx + 1}</dd>
              <dt>关联巡检点</dt>
              <dd>
                {selNodePoint
                  ? `${selNodePoint.name} · ${selNodePoint.id}`
                  : "自由锚点（未吸附巡检点）"}
              </dd>
              <dt>与前段连接</dt>
              <dd>
                {selNodeIdx === 0
                  ? "（首节点）"
                  : selNode.curve
                    ? "曲线（平滑）"
                    : "直线"}
              </dd>
              <dt>坐标</dt>
              <dd>{`x ${selNode.x.toFixed(2)}% · y ${selNode.y.toFixed(2)}%`}</dd>
            </dl>
          )}
        </aside>
      )}
      </div>
      {/* 元素浏览：悬浮抽屉，列全图上元素，点行即选中（父线线体在 SVG 里接不到点击，从这里选） */}
      {browse && (
        <>
          <div className="route-browse-mask" onClick={() => BROWSE(false)} />
          <div className="route-browse">
            <div className="route-browse-head">
              <b>元素浏览</b>
              <button type="button" onClick={() => BROWSE(false)}>
                ✕
              </button>
            </div>
            {browseRows.map((r) => (
              <button
                key={r.key}
                type="button"
                className={"route-browse-row" + (sel === r.key ? " on" : "")}
                onClick={() => {
                  SEL(r.key);
                  BROWSE(false);
                }}
              >
                <span className="route-browse-type">{r.type}</span>
                <span className="route-browse-name">{r.name}</span>
              </button>
            ))}
            {!browseRows.length && (
              <p className="route-param-empty">图上还没有元素。</p>
            )}
          </div>
        </>
      )}
      {brokenParentRefs > 0 && (
        <Note>
          有 <b>{brokenParentRefs}</b>{" "}
          段固定路线引用的定位点已不在本图（例如装置区的点随点位归属迁到了装置区地图），
          因此未绘制；可到「地图管理 › 编辑（地图标定）」重新连线，或保存一次路网以清理这些段。
        </Note>
      )}
      {missing > 0 && (
        <Note>
          有 <b>{missing}</b> 个已选巡检点不在当前固定路线地图上，未参与预览；
          一条路线只能属于同一张地图，请先在下方取消这些点的勾选。
        </Note>
      )}
    </section>
  );
}
