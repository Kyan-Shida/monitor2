/**
 * @file MapDispatch.tsx
 * @description 地图下发与机器同步（地图管理内嵌抽屉）：**多选设备批量下发**，
 *              并跟踪每台的阶段回执（传输中 → 校验中 → 待激活 → 已同步）。
 *              下发记录**只列本图**（最新在前）：这张图发给了哪几台机器、
 *              发的是哪个版本、走到哪一步、失败原因是什么，一眼可查。
 * @interaction Maps.tsx → 地图详情 →「地图下发」抽屉
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { mapVer } from "../data/versionLabel";
import { Badge, Btn, Empty, Note, Panel, Table } from "./UI";

export function MapDispatch({ mapId }: { mapId: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === mapId);
  const [sel, SEL] = useState<string[]>([]);
  if (!m) return <Note>地图不存在。</Note>;
  /** 该地图的标定数据版本 c{n}（来自独立标定集合，与地图空间版本解耦） */
  /**
   * 本图的下发记录（最新在前，写入时 unshift；老缓存可能缺该集合，故兜底空数组）
   * @description 记录只归到所属地图的详情页：每条含发给了哪台机器、发的哪个版本、
   *              走到哪一步、什么时间、反馈是什么
   */
  const syncs = (s.syncs || []).filter((x) => x.mapId === m.id);
  /** 可下发 = 区域已一致，或未分配区域（首次下发即归入本图区域） */
  const dispatchable = s.robots.filter((r) => !r.region || r.region === m.region);
  /** 该机器是否已持有「本图当前版本」的激活回执 */
  const synced = (rid: string) =>
    syncs.some(
      (x) =>
        x.robotId === rid &&
        x.state === "已同步" &&
        x.mapVersion === m.version,
    );
  /**
   * 维护窗口：区域不匹配不可下发；任务中需等结束；非空闲需等待
   * @param r 机器人
   * @returns 一句话可用性说明
   */
  const windowOf = (r: (typeof s.robots)[number]) =>
    r.region && r.region !== m.region
      ? "不适用区域"
      : !r.region
        ? "首次下发即归属本区域"
        : r.current
          ? "任务结束后"
          : r.state === "空闲"
            ? "当前可维护"
            : "等待空闲";
  const toggle = (rid: string) =>
    SEL((old) => (old.includes(rid) ? old.filter((x) => x !== rid) : [...old, rid]));
  const send = () => {
    if (act({ type: "SYNC_BATCH", mapId: m.id, robotIds: sel })) SEL([]);
  };
  /** 机器人名 / 地图名（记录里只有 id，展示时补上名称便于现场核对） */
  const nameOf = (rid: string) =>
    s.robots.find((r) => r.id === rid)?.name || rid;
  const mapNameOf = (mid: string) =>
    s.maps.find((x) => x.id === mid)?.name || mid;
  return (
    <>
      <Panel
        title={`选择设备下发 · 目标版本 ${m.name} ${mapVer(m.version)}`}
        extra={
          <div className="actions">
            <Btn onClick={() => SEL(dispatchable.map((r) => r.id))}>全选可下发</Btn>
            <Btn onClick={() => SEL([])}>清空</Btn>
            <Btn primary disabled={!sel.length} onClick={send}>
              下发 {sel.length || ""} 台
            </Btn>
          </div>
        }
      >
        <Table
          heads={[
            <input
              type="checkbox"
              aria-label="全选设备"
              checked={
                !!dispatchable.length && sel.length === dispatchable.length
              }
              onChange={(e) =>
                SEL(e.target.checked ? dispatchable.map((r) => r.id) : [])
              }
            />,
            "设备",
            "区域",
            "当前状态",
            "实际版本",
            "维护窗口",
            "版本一致",
          ]}
          rows={s.robots.map((r) => [
            <input
              type="checkbox"
              aria-label={`选择 ${r.name}`}
              disabled={!!r.region && r.region !== m.region}
              checked={sel.includes(r.id)}
              onChange={() => toggle(r.id)}
            />,
            <>
              {r.name}
              <small>{r.id}</small>
            </>,
            r.region || "未分配",
            <Badge>{r.state}</Badge>,
            r.mapId
              ? `${mapNameOf(r.mapId)} ${mapVer(r.mapVersion)}`
              : "未分配地图",
            windowOf(r),
            r.region && r.region !== m.region ? (
              <span className="muted">不适用</span>
            ) : synced(r.id) ? (
              <Badge>已同步</Badge>
            ) : (
              <Badge tone="amber">待更新</Badge>
            ),
          ])}
        />
      </Panel>
      <Panel
        title="下发记录"
        extra={
          <span>
            {syncs.length} 条 · 覆盖 {new Set(syncs.map((x) => x.robotId)).size}{" "}
            台设备
          </span>
        }
      >
        {syncs.length ? (
          <Table
            heads={["设备", "版本", "阶段", "下发时间", "反馈", "操作"]}
            rows={syncs.map((x) => [
              <>
                {nameOf(x.robotId)}
                <small>{x.robotId}</small>
              </>,
              mapVer(x.mapVersion),
              <Badge>{x.state}</Badge>,
              x.at || "—",
              x.reason || "—",
              x.state === "已同步" ? (
                <span className="muted">—</span>
              ) : (
                <div className="actions">
                  <Btn onClick={() => act({ type: "SYNC_STEP", id: x.id })}>
                    {x.state === "失败"
                      ? "重试"
                      : x.state === "待激活"
                        ? "确认激活回执"
                        : "模拟下一阶段回执"}
                  </Btn>
                  <Btn
                    disabled={x.state === "失败"}
                    onClick={() =>
                      act({ type: "SYNC_STEP", id: x.id, fail: true })
                    }
                  >
                    模拟失败
                  </Btn>
                </div>
              ),
            ])}
          />
        ) : (
          <Empty>还没有下发记录。选择设备后点「下发」即可登记传输任务。</Empty>
        )}
      </Panel>
    </>
  );
}
