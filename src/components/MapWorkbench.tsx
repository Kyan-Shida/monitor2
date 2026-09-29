/**
 * @file MapWorkbench.tsx
 * @description 地图工作台（地图管理内嵌抽屉）：面向「用户上传的、自带定位ID与轨迹的地图」，
 *              展示地图自带点位与轨迹，并允许**继续新增**（点位 / 轨迹采样点）。
 *              定位ID即地图点位（`MapAsset.targets`），轨迹为 `trackSamples`；
 *              后续"标注点位"由「巡检点管理 › 添加巡检点」完成，本工作台只负责"地图上有什么"。
 * @interaction Maps.tsx → 地图详情 →「地图工作台」抽屉
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Badge, Btn, Empty, Note, Panel, Table } from "./UI";
import { MapBaseUpload } from "./MapBaseUpload";
import { MapImageCanvas } from "./MapImageCanvas";

/** 轨迹采样点类型（与 MapSurveyPanel / TrackSample.kind 同口径） */
const TRACK_KINDS = ["停靠点", "转弯点", "充电桩", "待机点"];

export function MapWorkbench({ mapId }: { mapId: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === mapId);
  /** 图面点击的落点用途：新增点位 / 继续追加轨迹采样点 */
  const [mode, MODE] = useState<"点位" | "轨迹">("点位");
  const [trackKind, TK] = useState("停靠点");
  if (!m) return <Note>地图不存在。</Note>;
  const targets = m.targets;
  const imported = targets.filter((t) => t.source !== "平台新增");
  const added = targets.filter((t) => t.source === "平台新增");
  const track = (s.trackSamples || [])
    .filter((x) => x.mapId === m.id)
    .sort((a, b) => a.seq - b.seq);
  const pointOf = (targetId: string) => s.points.find((p) => p.targetId === targetId);
  return (
    <>
      <Note>
        该地图随文件自带 <b>{imported.length}</b> 个定位ID 与 <b>{track.length}</b>{" "}
        个轨迹采样点。带上来的定位ID保持原样，仍可在图上<b>继续新增</b>点位或轨迹点；
        「检什么、怎么检」在「巡检点管理 › 添加/编辑巡检点」里完成。
      </Note>
      <Panel title="底图" extra={<span>{m.image ? "已上传" : "未上传"}</span>}>
        <MapBaseUpload mapId={m.id} />
      </Panel>
      <Panel
        title="地图内容"
        extra={
          <div className="actions">
            <label className="inline-filter">
              <span>图面点击用于：</span>
              <select value={mode} onChange={(e) => MODE(e.target.value as "点位" | "轨迹")}>
                <option>点位</option>
                <option>轨迹</option>
              </select>
            </label>
            {mode === "轨迹" && (
              <label className="inline-filter">
                <span>轨迹点类型：</span>
                <select value={trackKind} onChange={(e) => TK(e.target.value)}>
                  {TRACK_KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        }
      >
        <MapImageCanvas
          image={m.image}
          height={380}
          markers={targets
            .filter((t) => t.state !== "已剔除")
            .map((t) => ({
              id: t.id,
              x: t.x,
              y: t.y,
              label: t.externalId ? `${t.externalId} · ${t.kind}` : `${t.id} · ${t.kind}`,
              kind: t.kind,
              state: t.state,
              source: t.source,
            }))}
          track={track.map((x) => ({ x: x.x, y: x.y }))}
          onAdd={(x, y) =>
            mode === "点位"
              ? act({ type: "ADD_TARGET", mapId: m.id, x, y, kind: "仪表" })
              : act({ type: "TRACK_RECORD", mapId: m.id, x, y, kind: trackKind })
          }
        />
        <p className="muted">
          {mode === "点位"
            ? "在图面上点击即可新增一个地图点位（来源记为「平台新增」）。"
            : "在图面上点击即可追加一个轨迹采样点，按顺序连线显示。"}
        </p>
      </Panel>
      <Panel title="地图自带定位ID" extra={<span>{imported.length} 个</span>}>
        {imported.length ? (
          <Table
            heads={["定位ID（外部）", "用途标记", "坐标", "关联业务点位", "状态"]}
            rows={imported.map((t) => {
              const p = pointOf(t.id);
              return [
                <b>{t.externalId || t.id}</b>,
                t.kind,
                `${t.x}% / ${t.y}%`,
                p ? <span className="link">{p.name}</span> : <span className="muted">尚未标注</span>,
                <Badge>{t.state}</Badge>,
              ];
            })}
          />
        ) : (
          <Empty>该地图未自带定位ID，可在地图上继续新增。</Empty>
        )}
      </Panel>
      <Panel title="平台新增点位" extra={<span>{added.length} 个</span>}>
        {added.length ? (
          <Table
            heads={["点位ID（内部）", "用途标记", "坐标", "关联业务点位", "操作"]}
            rows={added.map((t) => {
              const p = pointOf(t.id);
              return [
                t.id,
                t.kind,
                `${t.x}% / ${t.y}%`,
                p ? <span className="link">{p.name}</span> : <span className="muted">尚未标注</span>,
                <Btn
                  disabled={!!p || t.state === "已剔除"}
                  title={p ? "已关联业务点位，请先维护点位" : "标记为不用于巡检"}
                  onClick={() => act({ type: "DISCARD_TARGET", mapId: m.id, targetId: t.id })}
                >
                  剔除
                </Btn>,
              ];
            })}
          />
        ) : (
          <Empty>还没有平台新增的点位。切换到「图面点击用于：点位」后在地图上点击即可新增。</Empty>
        )}
      </Panel>
      <Panel title="轨迹" extra={<span>{track.length} 个采样点</span>}>
        {track.length ? (
          <Table
            heads={["顺序", "类型", "坐标"]}
            rows={track.map((x) => [x.seq, <Badge>{x.kind}</Badge>, `${x.x}% / ${x.y}%`])}
          />
        ) : (
          <Empty>该地图暂无轨迹。切换到「图面点击用于：轨迹」后在地图上点击即可追加。</Empty>
        )}
      </Panel>
    </>
  );
}
