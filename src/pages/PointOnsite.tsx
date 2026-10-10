/**
 * @file PointOnsite.tsx
 * @description 现场采集（跑图）新增巡检点（内置页）——**巡检点新增的唯一入口**，
 *              交付员工带机器实地跑图，走完机器即落一个巡检点：
 *   页面分两栏：**左栏固定不动（sticky 吸顶），右栏可上下拉动**
 *   左栏 ① 采集准备 / 巡检点参数（原 ① ② 合并为一张面板，中间一条分段线）：
 *        选当前带领的机器人（机器人与地图都要在现场确认）、巡检点名称 + 统一坐标
 *        （绑定点位由采集结果决定，只读回显）
 *   右栏 ③ 机器人实时位置：底图上随机器人移动刷新位置并留下跑图轨迹；带机器到点停稳后点
 *          「采集当前位置」——系统自动取当前位置坐标并分配定位ID
 *        ④ 巡检项列表：逐项「保存本项」，与编辑页同口径（复用 InspectItemDrawer 的 inline 常驻面板）
 * @interaction 入口：「巡检点管理」工具条「现场采集新增」（可带机器人 id 深链）；
 *              引擎 action：ONSITE_MOVE（跑图位移）/ CAPTURE_ONSITE_POINT（定格点位）/ SAVE_POINT（落巡检点）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Empty, Field, Note, Panel, Table } from "../components/UI";
import { MapImageCanvas, type ImageMarker } from "../components/MapImageCanvas";
import { InspectItemDrawer } from "../components/InspectItemDrawer";
import { BusinessTargetQuickAdd } from "../components/BusinessTargetQuickAdd";
import type { Candidate, InspectSpec } from "../data/types";
import { targetsOf } from "../data/mapCalibration";
import { mapVer } from "../data/versionLabel";
import { exportOnsiteWorkbook, type OnsiteExportPoint } from "../data/excel";

/** 跑图方向按钮（command 与引擎 ONSITE_MOVE 对齐） */
const DIRECTIONS = ["前进", "左移", "右移", "后退"];

/**
 * 取下一个现场采集定位ID
 * @description 延续标定文件里的 O 序列（O101 / O201 …）在**该地图现有最大编号上自增**，
 *              保证同一地图内定位ID唯一；空地图从 O101 起算
 * @param targets 该地图现有标定点
 * @returns 新的定位ID，如 O213
 */
function nextExternalId(targets: Candidate[]): string {
  const nums = targets
    .map((t) => /^O(\d+)$/.exec(t.externalId || ""))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]));
  const max = nums.length ? Math.max(...nums) : 100;
  return `O${String(max + 1).padStart(3, "0")}`;
}

export function PointOnsite({ id }: { id?: string }) {
  const { s, act } = useStore();
  const robots = s.robots || [];
  /** 本次带领的机器人：可由深链（机器人 id）带入 */
  const [robotId, ROBOT] = useState(id || robots[0]?.id || "");
  const r = robots.find((x) => x.id === robotId);
  const [mapId, MAP] = useState(r?.mapId || s.maps[0]?.id || "");
  const [name, NAME] = useState("");
  /** 已保存的巡检项（多个巡检项组成一个巡检点） */
  const [items, ITEMS] = useState<InspectSpec[]>([]);
  /** 正在编辑的巡检项草稿；null 表示不在编辑态 */
  const [draft, DRAFT] = useState<InspectSpec | null>(null);
  const [err, ERR] = useState("");
  /** 已定格（采集）的现场点位：自动分配的定位ID + 定格坐标 */
  const [picked, PICKED] = useState<{ id: string; externalId: string; x: number; y: number } | null>(
    null,
  );
  /** 本次跑图轨迹：机器人走过的位置（底图上连线） */
  const [track, TRACK] = useState<{ x: number; y: number }[]>([]);
  /** 跑图步长（1-9） */
  const [step, STEP] = useState(3);
  /** 保存成功回执 */
  const [saved, SAVED] = useState("");
  /** 「＋ 快速新建巡检目标台账」抽屉开关 */
  const [btOpen, BTO] = useState(false);
  /** 本次会话已采集并保存的巡检点（用于整批导出 Excel） */
  const [collected, COLLECT] = useState<OnsiteExportPoint[]>([]);

  const bts = s.businessTargets || [];
  const m = s.maps.find((x) => x.id === mapId);
  /** 该地图已有的标定点（含地图导入的定位ID与现场采集的点） */
  const mapTargets = targetsOf(s, mapId || "");
  const btOf = (bid: string) => bts.find((b) => b.id === bid);
  const insOf = (bid: string) => {
    const bid2 = btOf(bid)?.instrumentId;
    return s.instruments?.find((x) => x.id === bid2);
  };
  /** 业务目标一句话归属：区域 › 设备 › 仪表 · 巡检要求 */
  const labelOfBt = (bid: string) => {
    const b = btOf(bid);
    const ins = insOf(bid);
    const dev = s.devices?.find((d) => d.id === ins?.deviceId);
    const req = (s.requirements || []).find((r2) => r2.id === b?.requirementId);
    return `${dev?.region || "—"} › ${dev?.name || "—"} › ${ins?.name || "—"} · ${req?.name || ""}`;
  };
  /** 图面标记：该地图的标定点；本次采集到的点高亮 */
  const markers: ImageMarker[] = mapTargets.map((t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    label: t.externalId || t.id,
    kind: t.kind,
    state: t.id === picked?.id ? "已确认" : undefined,
    source: t.source,
  }));

  const upd = (patch: Partial<InspectSpec>) =>
    DRAFT((d) => (d ? { ...d, ...patch } : d));

  /** 换机器人 / 换地图：清掉上一轮的采集结果与轨迹，避免点位落到别的图上 */
  function resetRun(nextRobot?: string, nextMap?: string) {
    PICKED(null);
    TRACK([]);
    SAVED("");
    ERR("");
    if (nextRobot) {
      ROBOT(nextRobot);
      // 默认跟到该机器人已同步的地图，现场可再改
      const rb = robots.find((x) => x.id === nextRobot);
      MAP(rb?.mapId || s.maps[0]?.id || "");
      return;
    }
    if (nextMap) MAP(nextMap);
  }

  /** 跑图：按方向移动机器人一格，并把新位置追加进轨迹 */
  function move(command: string) {
    if (!r) return ERR("请先选择当前带领的机器人");
    ERR("");
    const from = { x: r.x, y: r.y };
    act({ type: "ONSITE_MOVE", robotId: r.id, command, step }, (st) => {
      const rr = st.robots.find((x) => x.id === r.id);
      if (!rr) return;
      TRACK((old) => (old.length ? [...old, { x: rr.x, y: rr.y }] : [from, { x: rr.x, y: rr.y }]));
    });
  }

  /** 停稳采集：取机器人当前位置坐标，自动分配定位ID并落成标定点 */
  function capture() {
    if (!r) return ERR("请先选择当前带领的机器人");
    if (!mapId) return ERR("请先选择地图");
    ERR("");
    SAVED("");
    const externalId = nextExternalId(mapTargets);
    const x = Math.round(r.x * 10) / 10;
    const y = Math.round(r.y * 10) / 10;
    act(
      { type: "CAPTURE_ONSITE_POINT", mapId, robotId: r.id, externalId, x, y },
      (st) => {
        const t = targetsOf(st, mapId).find((q) => q.externalId === externalId);
        if (t) PICKED({ id: t.id, externalId, x: t.x, y: t.y });
      },
    );
  }

  /** 新开一条巡检项草稿（默认带一个原子动作，参数取保守值） */
  function newItem() {
    ERR("");
    const first = bts[0];
    DRAFT({
      id: "",
      name: "",
      targetId: first?.id || "",
      actions: ["拍照"],
      pose: {
        ptz: { pan: 0, tilt: 0, zoom: 1 },
        light: 40,
        dwellSec: 5,
        viewDir: "",
        avoidPolicy: "标准",
      },
    });
  }
  /** 「保存本项」：编辑态覆盖、新增态追加；保存后回到巡检项列表 */
  function saveItem() {
    if (!draft) return;
    if (!draft.name.trim()) return ERR("请填写巡检项名称");
    if (!draft.targetId) return ERR("请选择巡检目标台账（检什么、怎么判）");
    if (!draft.actions.length) return ERR("请至少选择一个原子动作");
    const rec: InspectSpec = { ...draft, id: draft.id || "IP-" + Date.now().toString(36) };
    ITEMS((old) =>
      old.some((x) => x.id === rec.id)
        ? old.map((x) => (x.id === rec.id ? rec : x))
        : [...old, rec],
    );
    ERR("");
    DRAFT(null);
  }
  /** 保存巡检点：现场采集的点位 + 巡检点身份 + 巡检项一次性提交，提交后可直接采集下一个点 */
  function save() {
    if (draft) return ERR("请先「保存本项」或「取消本项」，再保存巡检点");
    if (!picked) return ERR("请先带机器到点停稳，点「采集当前位置」");
    if (!name.trim()) return ERR("请填写巡检点名称");
    if (!items.length) return ERR("请至少添加并保存一个巡检项");
    ERR("");
    const ok = act(
      {
        type: "SAVE_POINT",
        mapId,
        targetId: picked.id,
        name,
        inspectItems: items,
        // PT-02：现场采集的机器人与停靠位姿随巡检点存档
        calibrateRobot: r?.id,
        pose: { x: picked.x, y: picked.y, yaw: 0 },
      },
      (st) => {
        const p = st.points.find((q) => q.targetId === picked.id);
        SAVED(p ? `已保存巡检点 ${p.id} · ${p.name}` : "已保存巡检点");
        // 暂存到本次会话清单，供整批导出 Excel（标定点 + 巡检点 + 巡检项）
        COLLECT((old) => [
          ...old,
          {
            pointId: p ? p.id : "",
            name,
            mapId,
            mapName: m?.name || "",
            externalId: picked.externalId,
            x: picked.x,
            y: picked.y,
            robotId: r?.id,
            kind: "可见光",
            items: items.map((it) => ({
              name: it.name,
              targetLabel: labelOfBt(it.targetId),
              actions: it.actions,
              ptz: it.pose.ptz,
              light: it.pose.light,
              dwellSec: it.pose.dwellSec,
              viewDir: it.pose.viewDir,
              avoidPolicy: it.pose.avoidPolicy,
            })),
          },
        ]);
        // 一趟跑图通常要落多个点：保存后清空本点信息，机器人 / 地图 / 轨迹保留
        PICKED(null);
        NAME("");
        ITEMS([]);
      },
    );
    if (!ok) SAVED("");
  }

  return (
    <>
      <div className="context-bar">
        <b>现场采集 · 新增巡检点</b>
        <div className="actions">
          <Btn primary disabled={!picked} onClick={save}>
            保存巡检点
          </Btn>
          {collected.length > 0 && (
            <Btn onClick={() => exportOnsiteWorkbook(collected)}>
              导出 Excel（{collected.length}）
            </Btn>
          )}
        </div>
      </div>

      {err && (
        <p role="alert" className="reference-upload-error">
          {err}
        </p>
      )}

      {saved && (
        <div className="onsite-done">
          <b>{saved}</b>
          <span>机器人 / 地图保持不变，可继续带机器到下一个点采集。</span>
          <Btn onClick={() => go("annotation")}>去巡检点管理</Btn>
        </div>
      )}

      {/*
        页面分区（左栏固定不动 · 右栏可上下拉动）：
          左栏（sticky 吸顶）：① 采集准备 / ② 巡检点参数（合并为一张面板）
          右栏（随页面上下滚动）：③ 机器人实时位置 / 跑图 ｜ ④ 巡检项列表
      */}
      <div className="onsite-split">
        <div className="onsite-left">
          <Panel
            className="onsite-robot"
            title="采集准备 / 巡检点参数"
            extra={
              <div className="actions">
                <Badge>{r ? r.id : "未选机器人"}</Badge>
                <Badge>{picked ? picked.externalId : "待采集"}</Badge>
              </div>
            }
          >
            <Field label="当前带领的机器人">
              <select value={robotId} onChange={(e) => resetRun(e.target.value)}>
                {robots.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.id} · {x.name} · {x.state}
                  </option>
                ))}
              </select>
            </Field>
            <div className="onsite-readout">
              <span>
                当前位置 <b>X {r?.x ?? "—"} / Y {r?.y ?? "—"}</b>
              </span>
              <span>
                状态 <b>{r?.state || "—"}</b>
              </span>
              <span>
                电量 <b>{r?.battery ?? "—"}%</b>
              </span>
              <span>
                已同步版本 <b>{mapVer(r?.mapVersion)}</b>
              </span>
            </div>
            <div className="onsite-merge-sep" />

            <Field label="巡检点名称">
              <input
                value={name}
                placeholder="例如 一期罐区 A 排巡检点"
                onChange={(e) => NAME(e.target.value)}
              />
            </Field>
            <div className="point-section-h">绑定定位点</div>
            {picked ? (
              <>
                <Field label="本次采集的定位点（不可改）">
                  <select value={picked.id} disabled onChange={() => {}}>
                    <option value={picked.id}>{picked.externalId} · 现场采集</option>
                  </select>
                </Field>
                <p className="muted">
                  已绑定标定点：<b>{picked.externalId}</b> · 来源 平台新增 · 底图投影 {picked.x},{" "}
                  {picked.y} · 采集机器人 {r?.id} · 统一坐标 XYZ（{picked.x}, {picked.y}, 0）米
                </p>
              </>
            ) : (
              <p className="muted">
                尚未采集，先带机器到点停稳再点「采集当前位置」。
              </p>
            )}
          </Panel>
        </div>

        <div className="onsite-right">
          <Panel
            className="onsite-map"
            title="机器人实时位置 / 跑图"
            extra={<span>{track.length ? `${track.length} 个轨迹点` : "尚未移动"}</span>}
          >
            {/* 机器人当前所在位置：仅当它同步的就是本张地图时才在图面高亮 */}
            <MapImageCanvas
              image={m?.image}
              markers={markers}
              selected={picked?.id}
              track={track}
              height={380}
              showIds
              robot={
                r && m && r.mapId === m.id
                  ? { x: r.x, y: r.y, label: `X ${r.x} / Y ${r.y}` }
                  : undefined
              }
            />
            <div className="actions">
              <Btn primary disabled={!r} onClick={capture}>
                采集当前位置
              </Btn>
              <span className="muted">带机器到目标位停稳后点此按钮：自动取当前坐标并分配定位ID。</span>
            </div>
          </Panel>

          <Panel
            className="onsite-items"
            title={`巡检项（${items.length} 项）`}
            extra={
              <Btn primary disabled={!!draft} onClick={newItem}>
                ＋ 添加巡检项
              </Btn>
            }
          >
            <Table
              heads={["巡检项名称", "巡检目标台账", "原子动作", "云台 PTZ", "操作"]}
              rows={items.map((sp) => [
                <b>{sp.name}</b>,
                labelOfBt(sp.targetId),
                sp.actions.join(" / "),
                `P${sp.pose.ptz.pan}° / T${sp.pose.ptz.tilt}° / Z${sp.pose.ptz.zoom}`,
                <div className="actions">
                  <Btn disabled={!!draft} onClick={() => DRAFT({ ...sp })}>
                    编辑
                  </Btn>
                  <Btn
                    disabled={!!draft}
                    onClick={() => ITEMS((old) => old.filter((x) => x.id !== sp.id))}
                  >
                    删除
                  </Btn>
                </div>,
              ])}
            />
            {!items.length && !draft && (
              <Empty>
                还没有巡检项。点「＋ 添加巡检项」——巡检项 = 名称 + 巡检目标台账 + 机器操作内容。
              </Empty>
            )}
          </Panel>
        </div>
      </div>

      {draft && (
        <InspectItemDrawer
          draft={draft}
          onChange={upd}
          onSave={saveItem}
          onCancel={() => {
            DRAFT(null);
            ERR("");
          }}
          businessTargets={bts}
          labelOfBt={labelOfBt}
          onOpenBt={() => BTO(true)}
        />
      )}

      {btOpen && (
        <BusinessTargetQuickAdd
          instrumentId={insOf(draft?.targetId || "")?.id}
          onClose={() => BTO(false)}
        />
      )}
    </>
  );
}
