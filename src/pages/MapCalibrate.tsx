/**
 * @file MapCalibrate.tsx
 * @description 地图标定工作台（内置页）：在像素地图上打点、连线成路网。
 *              左：「元素选择」（点选已有元素看参数）/ 单点 / 直线 / 曲线；
 *              中：像素地图（点云底图 + 定位点 + 路网线，选中元素高亮）；
 *              右：实时位姿（图面 → 局部米 → 全局坐标）+ 选中元素的「基础参数 / 高级参数」
 *                  + 「保存路网」；左下：「元素浏览」（点 / 线 / 弧，点行即高亮对应元素）。
 * @interaction 路由 `map-calibrate`（父页面「地图管理」，由地图卡片「编辑」进入）；
 *              引擎动作：ADD_TARGET（打点，**与现场采集共用同一份定位点**）/ UPDATE_TARGET（改点参数）/
 *              SAVE_ROADNET（线 / 弧落库）
 */
import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Btn, Modal, Panel, Table } from "../components/UI";
import { MapImageCanvas } from "../components/MapImageCanvas";
import { targetsOf } from "../data/mapCalibration";
import { localToWorld } from "../data/geo";
import { SAMPLE_MAP_IMAGE } from "../data/sampleMap";
import { DEFAULT_PATH_PROPS } from "../data/types";
import type { Candidate, RoadnetPath, RoadnetPathProps } from "../data/types";

/** 绘制 / 选择工具（「元素选择」= 点选已有元素并查看参数） */
const TOOLS = ["元素选择", "单点", "直线", "曲线"] as const;
type Tool = (typeof TOOLS)[number];
/** 点类型候选 */
const POINT_TYPES = ["停靠点", "充电点", "待机点", "观察点"];
/** 底图缺省像素尺寸（与画布一致）：像素 → 米换算用 */
const NAT = { w: 1000, h: 620 };

/** 线 / 弧的高级参数字段（控件类型 + 候选项，与参考设计一致） */
const PATH_FIELDS: {
  key: keyof RoadnetPathProps;
  label: string;
  kind: "num" | "switch" | "select";
  options?: string[];
}[] = [
  { key: "avoidObstacle", label: "障碍物检测", kind: "switch" },
  { key: "floor", label: "楼层设置", kind: "num" },
  { key: "maxAngularSpeed", label: "最大角速度", kind: "num" },
  { key: "minAngularSpeed", label: "最小角速度", kind: "num" },
  { key: "maxForwardSpeed", label: "最大前进速度", kind: "num" },
  { key: "minForwardSpeed", label: "最小前进速度", kind: "num" },
  { key: "maxBackwardSpeed", label: "最大后退速度", kind: "num" },
  { key: "minBackwardSpeed", label: "最小后退速度", kind: "num" },
  { key: "avoidMode", label: "避障模式", kind: "select", options: ["停障", "绕障"] },
  { key: "widthMode", label: "宽窄道设置", kind: "select", options: ["宽道", "窄道"] },
  { key: "roadType", label: "道路选择", kind: "select", options: ["正常路面", "坡道"] },
  { key: "forwardDir", label: "起点到终点", kind: "select", options: ["前进", "后退"] },
  { key: "backwardDir", label: "终点到起点", kind: "select", options: ["前进", "后退"] },
];

export function MapCalibrate({ id }: { id?: string }) {
  const { s, act } = useStore();
  /** 进入前在「地图卡片 → 编辑」选中的机器狗 id（供实时位姿优先使用） */
  const [pickedRover] = useViewState("calib.roverId", "");
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  /** 定位点：直接用该图的标定数据（与「现场采集新增巡检点」共用一份，保证地图与点位一致） */
  const pts: Candidate[] = m
    ? targetsOf(s, m.id).filter((t) => t.state !== "已剔除")
    : [];
  /** 线 / 弧草稿（点「保存路网」才落库） */
  const [paths, PATHS] = useState<RoadnetPath[]>(() => m?.roadnet?.paths || []);
  const [tool, TOOL] = useState<Tool>("元素选择");
  /** 正在连接的点（直线满 2 点自动成线；曲线由「完成连线」收口） */
  const [draft, DRAFT] = useState<string[]>([]);
  /** 是否在定位点旁显示名称标签（p_N / 自定义名） */
  const [showLabels, SETL] = useState(false);
  /** 鼠标在图面上的实时位置（百分比） */
  const [hover, HOVER] = useState({ x: 0, y: 0 });
  /** 选中的元素 id（定位点 id 或线 id）：右侧显示参数、图上高亮 */
  const [sel, SEL] = useState("");
  /** 打点后待接管的新点（`ADD_TARGET` 不回传 id，靠坐标回找并选中） */
  const [pending, PENDING] = useState<{ x: number; y: number } | null>(null);
  const [browse, BROWSE] = useState(false);
  const [tab, TAB] = useState<"点" | "线" | "弧">("点");
  /** 基础 / 高级参数折叠态 */
  const [openBasic, OB] = useState(true);
  const [openAdv, OA] = useState(true);

  const uid = (p: string) =>
    p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /**
   * 打点后接管新点
   * @description `ADD_TARGET` 只回执布尔值，这里按「刚打下的坐标」回找并选中它
   */
  useEffect(() => {
    if (!pending || !m) return;
    const hit = [...pts]
      .reverse()
      .find(
        (t) =>
          Math.abs(t.x - pending.x) < 0.6 && Math.abs(t.y - pending.y) < 0.6,
      );
    PENDING(null);
    if (hit) SEL(hit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, pending]);

  /**
   * 切到另一张图时重置本地编辑态
   * @description `paths` 是本地草稿（点「保存路网」才落库），换图必须重新取该图的数据，
   *              否则会把上一张图连的线带过来
   */
  useEffect(() => {
    PATHS(m?.roadnet?.paths || []);
    DRAFT([]);
    SEL("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);

  /** Esc：放弃当前连线草稿（直线 / 曲线连到一半想退出时的统一出口） */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") DRAFT([]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Delete：删除当前选中元素（定位点 / 父线） */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Delete") removeSel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, paths, pts]);

  if (!m)
    return (
      <Panel title="地图标定">
        <p className="muted">未找到地图。</p>
      </Panel>
    );

  /**
   * 像素（图面百分比）→ 局部米 → 全局坐标
   * @description 换算口径只有一处：`frames.resolution` + `geo.localToWorld`
   */
  const res = m.frames?.resolution ?? 0.05;
  const worldOf = (x: number, y: number) =>
    localToWorld(
      { x: (x / 100) * NAT.w * res, y: (y / 100) * NAT.h * res, z: 0 },
      m.frames,
    );
  const hoverWorld = worldOf(hover.x, hover.y);
  const yaw = m.frames?.origin?.yaw ?? 0;
  /**
   * 实时位姿开关：开 = 实时加载**在场机器狗**的位置（原型用定时器模拟它在地图里走动），
   * 关 = 跟随鼠标在图面上的位置。
   */
  const [live, LIVE] = useState(false);
  const [livePose, LIVE_POSE] = useState({ x: 50, y: 50, yaw: 0 });
  /** 在场机器狗：优先「编辑前选中的那台」，其次本图在线执行中的，最后本图任意一台 */
  const rover =
    (s.robots || []).find((r) => r.id === pickedRover) ||
    (s.robots || []).find((r) => r.mapId === m.id && r.state === "执行中") ||
    (s.robots || []).find((r) => r.mapId === m.id);
  useEffect(() => {
    if (!live) return;
    LIVE_POSE({ x: rover?.x ?? 50, y: rover?.y ?? 50, yaw: 0 });
    // 原型：真实位姿由机器狗实时回传；这里按 1.2s 步进模拟它在跑图
    const t = setInterval(() => {
      LIVE_POSE((p) => ({
        x: Math.max(2, Math.min(98, p.x + (Math.random() - 0.5) * 6)),
        y: Math.max(2, Math.min(98, p.y + (Math.random() - 0.5) * 6)),
        yaw: Math.round((p.yaw + 15) % 360),
      }));
    }, 1200);
    return () => clearInterval(t);
  }, [live, rover?.id]);
  /** 打点用的图面坐标：实时模式取机器狗位姿，否则取鼠标位置 */
  const pose = live ? livePose : { ...hover, yaw };
  /** 面板展示的位姿：**关闭实时定位时不跟鼠标**，直接归零（0,0,0） */
  const shown = live ? livePose : { x: 0, y: 0, yaw: 0 };
  const shownWorld = live ? worldOf(shown.x, shown.y) : { x: 0, y: 0 };

  const selPoint = pts.find((t) => t.id === sel);
  const selPath = paths.find((v) => v.id === sel);
  /** 点在列表里的序号（线的「起点 / 终点 ID」同用） */
  const noOf = (tid: string) => pts.findIndex((t) => t.id === tid) + 1;
  /** 线在列表里的序号（排在定位点之后，与「元素浏览」ID 一致） */
  const lineNo = (lid: string) => pts.length + paths.findIndex((v) => v.id === lid) + 1;
  /** 点的全局坐标（缺省按图面坐标现场换算） */
  const pointWorld = (t: Candidate) => t.world || worldOf(t.x, t.y);
  /** 线的高级参数（缺省值兜底） */
  const pathProps = (v: RoadnetPath): RoadnetPathProps => ({
    ...DEFAULT_PATH_PROPS,
    ...v.props,
  });

  /** 在图面打点：定位点即时落库（与现场采集同一份数据）。只有「单点」工具会走到这里 */
  function addPointAt(x: number, y: number) {
    PENDING({ x, y });
    act({ type: "ADD_TARGET", mapId: m!.id, x, y, pointType: "停靠点" });
  }

  /**
   * 生成一条线 / 弧（名称按「元素浏览」口径：L_ / A_ + 全局序号）
   * @returns 新线 id（调用方用它把右侧参数面板切到这条线上）
   */
  function addPath(kind: "直线" | "弧", pointIds: string[]): string {
    const id = uid(kind === "直线" ? "RL-" : "RA-");
    PATHS((old) => [
      ...old,
      {
        id,
        kind,
        name: `${kind === "直线" ? "L" : "A"}_${pts.length + old.length + 1}`,
        pointIds,
        props: { ...DEFAULT_PATH_PROPS },
      },
    ]);
    return id;
  }

  /**
   * 点选地图上的定位点
   * @description 一律先选中看参数；「直线 / 曲线」下再把点累积到连线草稿——
   *              **直线 / 曲线不产生新点**，只在已有定位点之间连线。
   *              再点一次刚选中的点 = 撤销它（顺带避免连出 0 长度的退化线段）。
   */
  function pickPoint(tid: string) {
    SEL(tid);
    OB(true);
    OA(true);
    // 看参数 / 选元素：不参与连线，并放弃未完成的草稿，避免两件事混在一起
    if (tool !== "直线" && tool !== "曲线") {
      DRAFT([]);
      return;
    }
    if (draft[draft.length - 1] === tid) {
      DRAFT(draft.slice(0, -1));
      return;
    }
    const next = [...draft, tid];
    // 直线：满 2 点自动成线，并把右侧参数面板切到这条新线上
    if (tool === "直线" && next.length >= 2) {
      SEL(addPath("直线", next.slice(-2)));
      DRAFT([]);
      return;
    }
    DRAFT(next);
  }

  /** 曲线（弧）收口：把已连接的点收成一条弧 */
  function closePath() {
    if (draft.length < 3) return;
    SEL(addPath("弧", [...draft]));
    DRAFT([]);
  }

  /** 撤销草稿里最后一个点（点错时回退一步） */
  function undraft() {
    DRAFT((old) => old.slice(0, -1));
  }

  /**
   * 图面空白处点击（仅直线 / 曲线模式触发）
   * @description ① 阈值内先吸附最近的定位点——连线全靠点击，容错要给足；
   *              ② 否则作为收尾：曲线已够 3 点即收成弧，不足则放弃草稿
   */
  function blankClick(x: number, y: number) {
    let near: Candidate | undefined;
    let best = 3;
    for (const t of pts) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < best) {
        best = d;
        near = t;
      }
    }
    if (near) {
      pickPoint(near.id);
      return;
    }
    if (tool === "曲线" && draft.length >= 3) {
      closePath();
      return;
    }
    DRAFT([]);
  }

  /** 改线的高级参数（本地草稿，保存路网时落库） */
  function patchPath(patch: Partial<RoadnetPathProps>) {
    PATHS((old) =>
      old.map((v) =>
        v.id === sel
          ? { ...v, props: { ...DEFAULT_PATH_PROPS, ...v.props, ...patch } }
          : v,
      ),
    );
  }

  /** 保存路网：只提交线 / 弧（点已随打点写入标定数据） */
  function save() {
    act({ type: "SAVE_ROADNET", mapId: m!.id, paths });
  }
  /** 删除当前选中元素：定位点用 DISCARD_TARGET，父线从本地草稿移除 */
  function removeSel() {
    if (!sel) return;
    if (selPoint) {
      act({ type: "DISCARD_TARGET", mapId: m.id, targetId: selPoint.id });
    } else if (selPath) {
      PATHS((old) => old.filter((v) => v.id !== sel));
    }
    SEL("");
  }
  /** 删除父线中的某个节点；若删除后节点不足 2 个则删除整条父线 */
  function removeNode(pid: string) {
    if (!selPath) return;
    let removedLine = false;
    PATHS((old) => {
      const next = old
        .map((v) =>
          v.id === selPath.id
            ? { ...v, pointIds: v.pointIds.filter((id) => id !== pid) }
            : v,
        )
        .filter((v) => {
          if (v.id === selPath.id && v.pointIds.length < 2) {
            removedLine = true;
            return false;
          }
          return true;
        });
      return next;
    });
    if (removedLine) SEL("");
  }

  /** 元素浏览的行：点 / 线 / 弧（点行即选中并高亮） */
  const browseRows = (
    tab === "点"
      ? pts.map((t, i) => ({
        key: t.id,
        id: String(i + 1),
        name: `p_${i + 1}`,
      }))
      : paths
          .filter((v) => (tab === "线" ? v.kind === "直线" : v.kind === "弧"))
          .map((v) => ({
            key: v.id,
            id: String(lineNo(v.id)),
            name: v.name,
          }))
  ).map((r) => [
    r.id,
    <button
      key={r.key}
      type="button"
      className={"calib-row" + (sel === r.key ? " on" : "")}
      onClick={() => {
        SEL(r.key);
        OB(true);
        OA(true);
      }}
    >
      {r.name}
    </button>,
  ]);

  return (
    <>
      <div className="context-bar">
        <b>地图标定 · {m.name}</b>
        <span>像素地图打点、连线成路网；坐标按「分辨率 + 原点」换算为全局坐标</span>
      </div>

      <div className="calib-tools">
        <span className="calib-tools-label">工具</span>
        {TOOLS.map((t) => (
          <button
            key={t}
            className={"calib-tool" + (tool === t ? " on" : "")}
            onClick={() => {
              TOOL(t);
              DRAFT([]);
            }}
          >
            {t}
          </button>
        ))}
        {sel && (
          <button
            type="button"
            className="calib-delete"
            title={
              selPoint
                ? "删除该定位点"
                : selPath
                  ? "删除该父线"
                  : "删除选中元素"
            }
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
            onChange={(e) => SETL(e.target.checked)}
          />
          <span className="calib-toggle-track"></span>
        </label>
        {(tool === "直线" || tool === "曲线") && (
          <>
            <span className="calib-tools-sep"></span>
            <span className="calib-tip-inline">
              {tool === "直线" ? "点 2 个定位点即成线" : "点 ≥3 个定位点，再点完成"}
            </span>
            <span className="calib-tip-inline">
              已选 <b>{draft.length}</b> 点
            </span>
            <Btn small disabled={!draft.length} onClick={undraft}>撤销</Btn>
            {tool === "曲线" && (
              <Btn small primary disabled={draft.length < 3} onClick={closePath}>完成连线</Btn>
            )}
            <Btn small disabled={!draft.length} onClick={() => DRAFT([])}>取消</Btn>
          </>
        )}
        <span className="calib-tools-sep"></span>
        <Btn small onClick={() => BROWSE(true)}>元素浏览</Btn>
        <Btn small onClick={() => go("point-onsite")}>现场采集</Btn>
      </div>

      <div className="calib-layout">
        <div className="calib-canvas">
          <MapImageCanvas
            image={m.image || SAMPLE_MAP_IMAGE}
            markers={pts.map((t, i) => ({
              id: t.id,
              x: t.x,
              y: t.y,
              label: `p_${i + 1}`,
              // 已选入连线草稿的点单独配色，让「连了哪些点」一眼可见
              draft: draft.includes(t.id),
            }))}
            selected={selPoint ? sel : undefined}
            onSelect={pickPoint}
            showLabels={showLabels}
            // 只有「单点」在地图上打点；直线 / 曲线只把已有定位点连起来
            onAdd={tool === "单点" ? addPointAt : undefined}
            // 直线 / 曲线：点空白 = 就近吸附定位点，或收尾 / 放弃当前连线
            onBlank={tool === "直线" || tool === "曲线" ? blankClick : undefined}
            hint={
              tool === "单点"
                ? "点击图面新增定位点"
                : tool === "直线" || tool === "曲线"
                  ? "点选图面上的定位点连线，空白处收尾，Esc 放弃"
                  : undefined
            }
            paths={[
              ...paths.map((v) => ({
                id: v.id,
                kind: v.kind,
                selected: sel === v.id,
                points: v.pointIds
                  .map((pid) => pts.find((t) => t.id === pid))
                  .filter(Boolean)
                  .map((t) => ({ x: t!.x, y: t!.y })),
              })),
              // 连线草稿预览：连点过程中先把已选点串起来（仅提示，不落库）
              ...(draft.length >= 2
                ? [
                    {
                      id: "__draft",
                      kind: "预览",
                      points: draft
                        .map((pid) => pts.find((t) => t.id === pid))
                        .filter(Boolean)
                        .map((t) => ({ x: t!.x, y: t!.y })),
                    },
                  ]
                : []),
            ]}
            onSelectPath={(lid) => {
              SEL(lid);
              // 点线即切到「看这条线」，放弃未完成的连线草稿
              DRAFT([]);
              OB(true);
              OA(true);
            }}
            onHover={(x, y) => HOVER({ x, y })}
            height={560}
          />
        </div>

        <aside className="calib-poser">
          <b className="calib-poser-title">实时位姿</b>
          {/* 实时定位开关独立成行，与下面的坐标字段区分开 */}
          <div className="calib-live-row">
            <span className={"calib-live-dot" + (live ? " on" : "")} />
            <span className="calib-live-text">
              {live ? "实时定位已开启" : "实时定位已关闭"}
            </span>
            <Btn onClick={() => LIVE(!live)}>{live ? "关闭" : "开启"}</Btn>
          </div>
          {live && (
            <p className="muted calib-poser-live">
              {rover
                ? `位姿来源：${rover.name}（实时）`
                : "当前地图无在线机器人：请确认机器人已锁定该地图并处于在线状态"}
            </p>
          )}
          <div className="calib-poser-grid">
            <div>
              <span>X 坐标</span>
              <strong>{shownWorld.x.toFixed(2)}</strong>
            </div>
            <div>
              <span>Y 坐标</span>
              <strong>{shownWorld.y.toFixed(2)}</strong>
            </div>
            <div>
              <span>航偏角</span>
              <strong>{shown.yaw}</strong>
            </div>
          </div>
          <Btn
            primary
            onClick={() => {
              // 打点属于「单点」工具：其它工具下先切过去，避免与「直线 / 曲线不打点」相互打架
              if (tool !== "单点") TOOL("单点");
              addPointAt(pose.x, pose.y);
            }}
          >
            ＋ 添加到地图
          </Btn>

          {/* 选中定位点：基础参数（ID / 名称 / XYZ）+ 高级参数（点类型 / 楼层 / 楼层连接点） */}
          {selPoint && (
            <>
              <button className="calib-acc" onClick={() => OB(!openBasic)}>
                <span>基础参数</span>
                <span>{openBasic ? "⌄" : "›"}</span>
              </button>
              {openBasic && (
                <dl className="calib-params">
                  <div>
                    <dt>ID</dt>
                    <dd>{noOf(selPoint.id)}</dd>
                  </div>
                  <div>
                    <dt>名称</dt>
                    <dd>p_{noOf(selPoint.id)}</dd>
                  </div>
                  <div>
                    <dt>X 坐标</dt>
                    <dd>{pointWorld(selPoint).x.toFixed(3)} m</dd>
                  </div>
                  <div>
                    <dt>Y 坐标</dt>
                    <dd>{pointWorld(selPoint).y.toFixed(3)} m</dd>
                  </div>
                  <div>
                    <dt>Z 坐标</dt>
                    <dd>0 m</dd>
                  </div>
                </dl>
              )}
              <button className="calib-acc" onClick={() => OA(!openAdv)}>
                <span>高级参数</span>
                <span>{openAdv ? "⌄" : "›"}</span>
              </button>
              {openAdv && (
                <dl className="calib-params">
                  <div>
                    <dt>点类型</dt>
                    <dd>
                      <select
                        value={selPoint.pointType || "停靠点"}
                        onChange={(e) =>
                          act({
                            type: "UPDATE_TARGET",
                            mapId: m.id,
                            targetId: selPoint.id,
                            pointType: e.target.value,
                          })
                        }
                      >
                        {POINT_TYPES.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </dd>
                  </div>
                  <div>
                    <dt>楼层设置</dt>
                    <dd>
                      <input
                        value={String(selPoint.floor ?? 0)}
                        onChange={(e) =>
                          act({
                            type: "UPDATE_TARGET",
                            mapId: m.id,
                            targetId: selPoint.id,
                            floor: e.target.value,
                          })
                        }
                      />
                    </dd>
                  </div>
                  <div>
                    <dt>楼层连接点</dt>
                    <dd>
                      <input
                        value={String(selPoint.floorLink ?? 0)}
                        onChange={(e) =>
                          act({
                            type: "UPDATE_TARGET",
                            mapId: m.id,
                            targetId: selPoint.id,
                            floorLink: e.target.value,
                          })
                        }
                      />
                    </dd>
                  </div>
                </dl>
              )}
            </>
          )}

          {/* 选中线 / 弧：基础参数（ID / 名称 / 起点 ID / 终点 ID）+ 高级参数（速度 / 避障 / 道路…） */}
          {selPath && (
            <>
              <button className="calib-acc" onClick={() => OB(!openBasic)}>
                <span>基础参数</span>
                <span>{openBasic ? "⌄" : "›"}</span>
              </button>
              {openBasic && (
                <dl className="calib-params">
                  <div>
                    <dt>ID</dt>
                    <dd>{lineNo(selPath.id)}</dd>
                  </div>
                  <div>
                    <dt>名称</dt>
                    <dd>{selPath.name}</dd>
                  </div>
                  <div>
                    <dt>起点 ID</dt>
                    <dd>{noOf(selPath.pointIds[0])}</dd>
                  </div>
                  <div>
                    <dt>终点 ID</dt>
                    <dd>{noOf(selPath.pointIds[selPath.pointIds.length - 1])}</dd>
                  </div>
                </dl>
              )}

              {/* 经过节点：可删除画错的中间点 */}
              {selPath.pointIds.length > 0 && (
                <div className="calib-nodes">
                  <div className="calib-nodes-title">经过节点</div>
                  {selPath.pointIds.map((pid, idx) => {
                    const pIdx = noOf(pid);
                    const label = pIdx
                      ? `p_${pIdx}`
                      : pid;
                    return (
                      <div key={`${selPath.id}-${pid}-${idx}`} className="calib-node">
                        <span>
                          {idx + 1}. {label}
                        </span>
                        <button className="calib-node-del" onClick={() => removeNode(pid)}>
                          删除
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button className="calib-acc" onClick={() => OA(!openAdv)}>
                <span>高级参数</span>
                <span>{openAdv ? "⌄" : "›"}</span>
              </button>
              {openAdv && (
                <dl className="calib-params">
                  {PATH_FIELDS.map((f) => {
                    const cur = pathProps(selPath)[f.key];
                    return (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd>
                          {f.kind === "switch" ? (
                            <button
                              type="button"
                              className={"calib-switch" + (cur ? " on" : "")}
                              onClick={() =>
                                patchPath({ [f.key]: !cur } as Partial<RoadnetPathProps>)
                              }
                            >
                              <i />
                            </button>
                          ) : f.kind === "select" ? (
                            <select
                              value={String(cur)}
                              onChange={(e) =>
                                patchPath({
                                  [f.key]: e.target.value,
                                } as Partial<RoadnetPathProps>)
                              }
                            >
                              {(f.options || []).map((x) => (
                                <option key={x}>{x}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={String(cur)}
                              onChange={(e) =>
                                patchPath({
                                  [f.key]: Number(e.target.value) || 0,
                                } as Partial<RoadnetPathProps>)
                              }
                            />
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </>
          )}

          <div className="calib-poser-foot">
            <Btn primary onClick={save}>
              保存路网
            </Btn>
          </div>
        </aside>
      </div>

      {browse && (
        <aside className="calib-drawer" role="dialog" aria-label="元素浏览">
          <div className="calib-drawer-head">
            <b>元素浏览</b>
            <button
              type="button"
              className="calib-drawer-close"
              title="收起"
              onClick={() => BROWSE(false)}
            >
              ✕
            </button>
          </div>
          <div className="segmented" style={{ marginBottom: 8 }}>
            {(["点", "线", "弧"] as const).map((x) => (
              <button
                key={x}
                className={tab === x ? "active" : ""}
                onClick={() => TAB(x)}
              >
                {x}
              </button>
            ))}
          </div>
          <Table heads={["ID", "名称"]} rows={browseRows} />
        </aside>
      )}
    </>
  );
}
