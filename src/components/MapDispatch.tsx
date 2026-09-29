/**
 * @file MapDispatch.tsx
 * @description 地图下发与机器同步（地图管理内嵌抽屉）：**多选设备批量下发**，
 *              并跟踪每台的阶段回执（传输中 → 校验中 → 待激活 → 已同步）。
 * @interaction Maps.tsx → 地图详情 →「地图下发」抽屉
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Badge, Btn, Empty, Note, Panel, Table } from "./UI";

export function MapDispatch({ mapId }: { mapId: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === mapId);
  const [sel, SEL] = useState<string[]>([]);
  if (!m) return <Note>地图不存在。</Note>;
  const syncs = s.syncs.filter((x) => x.mapId === m.id);
  const done = (rid: string) =>
    s.syncs.some(
      (x) =>
        x.mapId === m.id &&
        x.robotId === rid &&
        x.state === "已同步" &&
        x.mapVersion === m.version &&
        x.pointSet === m.pointSet,
    );
  /**
   * 维护窗口：区域不匹配不可下发；任务中需等结束；非空闲需等待
   * @param r 机器人
   * @returns 一句话可用性说明
   */
  const windowOf = (r: (typeof s.robots)[number]) =>
    r.region !== m.region
      ? "不适用区域"
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
  return (
    <>
      <Note>
        下发只登记“传输中”，**传输完成不等于已同步**——需机器人激活回执确认版本一致后，
        平台才更新机器人实际版本；任务执行中需等待维护窗口。
      </Note>
      <Panel
        title={`选择设备下发 · 目标版本 m${m.version} / p${m.pointSet}`}
        extra={
          <div className="actions">
            <Btn onClick={() => SEL(s.robots.map((r) => r.id))}>全选</Btn>
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
              checked={!!s.robots.length && sel.length === s.robots.length}
              onChange={(e) =>
                SEL(e.target.checked ? s.robots.map((r) => r.id) : [])
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
              checked={sel.includes(r.id)}
              onChange={() => toggle(r.id)}
            />,
            <>
              {r.name}
              <small>{r.id}</small>
            </>,
            r.region,
            <Badge>{r.state}</Badge>,
            `${r.mapId} / m${r.mapVersion} / p${r.pointSet}`,
            windowOf(r),
            done(r.id) ? <Badge>已同步</Badge> : <span className="muted">—</span>,
          ])}
        />
      </Panel>
      <Panel title="下发记录与模拟回执" extra={<span>{syncs.length} 条</span>}>
        {syncs.length ? (
          <Table
            heads={["同步编号", "设备", "目标版本", "阶段", "反馈", "操作"]}
            rows={syncs.map((x) => [
              x.id,
              x.robotId,
              `m${x.mapVersion} / p${x.pointSet}`,
              <Badge>{x.state}</Badge>,
              x.reason || "—",
              <div className="actions">
                <Btn
                  disabled={x.state === "已同步"}
                  onClick={() => act({ type: "SYNC_STEP", id: x.id })}
                >
                  {x.state === "失败"
                    ? "重试"
                    : x.state === "待激活"
                      ? "确认激活回执"
                      : "模拟下一阶段回执"}
                </Btn>
                <Btn
                  disabled={x.state === "已同步" || x.state === "失败"}
                  onClick={() => act({ type: "SYNC_STEP", id: x.id, fail: true })}
                >
                  模拟失败
                </Btn>
              </div>,
            ])}
          />
        ) : (
          <Empty>还没有下发记录。选择设备后点「下发」即可登记传输任务。</Empty>
        )}
      </Panel>
    </>
  );
}
