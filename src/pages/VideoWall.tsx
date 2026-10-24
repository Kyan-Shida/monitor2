/**
 * @file VideoWall.tsx
 * @description 视频监控流大屏：左侧机器人列表（每台机器人下挂其相机能力）+ 右侧宫格视频墙（3/6/9 宫格切换）。
 *   用户从左侧拖拽某台机器人的某个相机能力到右侧宫格的空位或已占用位，实现视频源绑定。
 *   暗色主题，与管理驾驶舱 / 机器人监控同款风格（slate-950 底 + slate-900 卡片 + cyan-500 强调）。
 * @interaction 由 CockpitScreen 按 video 渲染；复用 components/Video.tsx 作为单个画面；
 *              数据源取自 data/store 的 robots 列表（capabilities 字段即该机器人的相机能力清单）
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, LayoutGrid, Maximize, Minimize, MonitorX, Thermometer, X } from "lucide-react";
import { useStore } from "../data/store";
import { ScreenTopBar, type CockpitId } from "../components/ScreenTopBar";
import { Video } from "../components/Video";

/** 宫格模式配置：布局类名 + 格子数 */
const GRID_MODES = [
  { key: "4", label: "4宫格", cols: 2, rows: 2, cells: 4 },
  { key: "6", label: "6宫格", cols: 3, rows: 2, cells: 6 },
  { key: "9", label: "9宫格", cols: 3, rows: 3, cells: 9 },
] as const;
type GridMode = (typeof GRID_MODES)[number]["key"];

/** 相机能力 → 展示图标与语义化名称（拖拽时显示） */
const CAP_META: Record<string, { label: string; hint: string; Icon: typeof Camera }> = {
  可见光: { label: "可见光相机", hint: "RGB 可见光", Icon: Camera },
  红外: { label: "红外热成像", hint: "温度分布", Icon: Thermometer },
  气体: { label: "气体探测", hint: "VOC / 有毒气体", Icon: MonitorX },
};

/** 宫格绑定槽位：空槽位为 null，已占用槽位记录来源机器人 + 相机能力 */
type Slot = { robotId: string; cap: string } | null;

export function VideoWall({
  onSwitch,
}: {
  /** 独立大屏窗口内的大屏切换 */
  onSwitch?: (id: CockpitId) => void;
}) {
  const { s } = useStore();
  const robots = s.robots;

  /** 宫格模式 */
  const [mode, SETM] = useState<GridMode>("6");
  /** 槽位数组：9 格（宫格模式决定实际渲染几格） */
  const [bindings, SETB] = useState<Slot[]>(() =>
    Array.from({ length: 9 }, () => null),
  );

  /** 当前拖拽携带的源：{robotId, cap}，开始拖拽时 set，放置/取消时清 */
  const [dragging, SETD] = useState<{ robotId: string; cap: string } | null>(null);
  /** 悬停高亮的宫格索引：拖过哪个格就标记哪个格 */
  const [over, SETO] = useState<number | null>(null);

  const active = GRID_MODES.find((g) => g.key === mode)!;

  /** 已被宫格占用的相机源集合：key = robotId|cap，用于左侧置灰 */
  const used = useMemo(() => {
    const set = new Set<string>();
    bindings.forEach((b) => {
      if (b) set.add(`${b.robotId}|${b.cap}`);
    });
    return set;
  }, [bindings]);

  /** 放置到宫格：若该格已有绑定则覆盖（用户确认即可） */
  const drop = (idx: number) => {
    if (!dragging) return;
    SETB((prev) => {
      const next = [...prev];
      next[idx] = { robotId: dragging.robotId, cap: dragging.cap };
      return next;
    });
    SETD(null);
    SETO(null);
  };

  /** 清空某个槽位 */
  const clearSlot = (idx: number) => {
    SETB((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
  };

  /** 清空所有槽位 */
  const clearAll = () => SETB(Array.from({ length: 9 }, () => null));

  // ── 全屏切换：与另外两个大屏共用 cockpit-screen:fullscreen CSS ──
  const [fs, FS] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onFs = () => FS(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) shellRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div className="cockpit-screen video-wall" ref={shellRef}>
      <ScreenTopBar
        current="video"
        onSwitch={onSwitch}
        extra={
          <button
            className="cs-nav-icon"
            title={fs ? "退出全屏" : "全屏展示"}
            onClick={toggleFullscreen}
          >
            {fs ? <Minimize size={15} /> : <Maximize size={15} />}
          </button>
        }
      />
      <div className="vw-body">
        {/* ── 左侧：机器人 + 相机能力 ── */}
        <aside className="vw-side">
          <div className="vw-side-head">
            <span className="vw-side-title">机器人相机源</span>
            <span className="vw-side-count">{robots.length} 台在线</span>
          </div>
          <div className="vw-robot-list">
            {robots.map((r) => (
              <div key={r.id} className="vw-robot">
                <div className="vw-robot-head">
                  <span className="vw-robot-dot" />
                  <b>{r.name}</b>
                  <small>{r.state}</small>
                </div>
                <div className="vw-cap-list">
                  {(r.capabilities?.length ? r.capabilities : ["可见光"]).map((cap) => {
                    const meta = CAP_META[cap] || { label: cap, hint: "自定义", Icon: Camera };
                    const Icon = meta.Icon;
                    const key = `${r.id}|${cap}`;
                    const isUsed = used.has(key);
                    const draggingThis = !isUsed && dragging?.robotId === r.id && dragging.cap === cap;
                    return (
                      <div
                        key={cap}
                        className={
                          "vw-cap" +
                          (draggingThis ? " dragging" : "") +
                          (isUsed ? " used" : "")
                        }
                        draggable={!isUsed}
                        onDragStart={(e) => {
                          if (isUsed) return;
                          SETD({ robotId: r.id, cap });
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", key);
                        }}
                        onDragEnd={() => {
                          SETD(null);
                          SETO(null);
                        }}
                        title={isUsed ? "该画面已被占用" : `拖拽到右侧宫格 · ${meta.hint}`}
                      >
                        <Icon size={14} />
                        <span>{meta.label}</span>
                        <small>{isUsed ? "已占用" : meta.hint}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="vw-side-tip">
            <b>操作提示</b>
            <p>从左侧<b>拖拽</b>相机源到右侧宫格；点击宫格右上角 ✕ 可移除。</p>
          </div>
        </aside>

        {/* ── 右侧：宫格视频墙 ── */}
        <section className="vw-main">
          <div className="vw-main-head">
            <div className="vw-grid-switch">
              {GRID_MODES.map((g) => (
                <button
                  key={g.key}
                  className={"vw-mode-btn" + (g.key === mode ? " active" : "")}
                  onClick={() => SETM(g.key)}
                  title={g.label}
                >
                  <LayoutGrid size={14} />
                  {g.label}
                </button>
              ))}
            </div>
            <div className="vw-main-actions">
              <button className="vw-clear-btn" onClick={clearAll} title="清空所有宫格">
                清空全部
              </button>
            </div>
          </div>

          <div
            className="vw-grid"
            style={{
              gridTemplateColumns: `repeat(${active.cols}, 1fr)`,
              gridTemplateRows: `repeat(${active.rows}, 1fr)`,
            }}
          >
            {bindings.slice(0, active.cells).map((slot, idx) => {
              const isOver = over === idx && !!dragging;
              return (
                <div
                  key={idx}
                  className={
                    "vw-cell" +
                    (slot ? " filled" : " empty") +
                    (isOver ? " hover" : "")
                  }
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    SETO(idx);
                  }}
                  onDragLeave={() => SETO((cur) => (cur === idx ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(idx);
                  }}
                >
                  {slot ? (
                    <div className="vw-cell-content">
                      <div className="vw-cell-label">
                        <span>
                          {CAP_META[slot.cap]?.label || slot.cap} ·{" "}
                          {robots.find((r) => r.id === slot.robotId)?.name || slot.robotId}
                        </span>
                        <button
                          className="vw-cell-close"
                          onClick={() => clearSlot(idx)}
                          title="移除该画面"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="vw-cell-video">
                        <Video
                          label={CAP_META[slot.cap]?.label || slot.cap}
                          robotId={robots.find((r) => r.id === slot.robotId)?.name}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="vw-cell-empty">
                      <MonitorX size={28} />
                      <span>拖拽视频源到此处</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
