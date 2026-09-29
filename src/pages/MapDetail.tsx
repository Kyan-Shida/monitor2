/**
 * @file MapDetail.tsx
 * @description 地图详情（内置页，挂在「地图管理」目录下）：展示单张地图的详细信息与状态，
 *              并提供两个内嵌抽屉——**地图工作台**（继续新增点位 / 轨迹）与**地图下发**（多选设备同步）。
 * @interaction 地图列表「详情」→ `#/robots/maps/detail/:id`；深链 `?tab=sync` / `?tab=workbench` 直达抽屉
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Modal, Note, Panel, Table } from "../components/UI";
import { MapSpatialPreview } from "../components/MapSpatialPreview";
import { MapWorkbench } from "../components/MapWorkbench";
import { MapDispatch } from "../components/MapDispatch";

export function MapDetail({ id, tab }: { id?: string; tab?: string }) {
  const { s } = useStore();
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  /** 抽屉：空串表示关闭；深链 tab 可直接打开对应抽屉 */
  const [drawer, DRAWER] = useState(
    tab === "sync" ? "下发" : tab === "workbench" ? "工作台" : "",
  );
  if (!m) return <Note>地图不存在，请从地图列表进入。</Note>;
  const pts = s.points.filter((p) => p.mapId === m.id);
  const imported = m.targets.filter((t) => t.source !== "平台新增");
  const added = m.targets.filter((t) => t.source === "平台新增");
  const track = (s.trackSamples || []).filter((x) => x.mapId === m.id);
  const synced = s.robots.filter(
    (r) =>
      r.mapId === m.id &&
      r.mapVersion === m.version &&
      r.pointSet === m.pointSet,
  );
  return (
    <>
      <div className="context-bar">
        <b>{m.name}</b>
        <span>
          {m.id} · {m.region} · m{m.version} / p{m.pointSet}
        </span>
        <Badge>{m.state}</Badge>
        {/* 详情页只保留两个动作：地图工作台（继续补充地图内容）与地图下发（同步给设备） */}
        <div className="actions">
          <Btn primary onClick={() => DRAWER("工作台")}>
            地图工作台
          </Btn>
          <Btn primary onClick={() => DRAWER("下发")}>
            地图下发
          </Btn>
        </div>
      </div>
      <Panel title="地图信息">
        <dl className="kv">
          <dt>地图编号 / 名称</dt>
          <dd>
            {m.id} · {m.name}
          </dd>
          <dt>所属区域</dt>
          <dd>{m.region}</dd>
          <dt>版本</dt>
          <dd>
            空间 m{m.version} · 点位集合 p{m.pointSet}
            {m.deviceListVersion ? ` · 设备清单 c${m.deviceListVersion}` : ""}
          </dd>
          <dt>状态</dt>
          <dd>
            <Badge>{m.state}</Badge>
            {m.state === "草稿" && (
              <small>内容尚未定版：下发时会自动定版为当前版本（平台不区分试验 / 正式版）</small>
            )}
          </dd>
          <dt>来源批次</dt>
          <dd>
            {m.batch} · {m.source}
          </dd>
          <dt>地图文件</dt>
          <dd>
            {m.file}
            <small>校验 {m.checksum} · 厂商格式解析待接入</small>
          </dd>
          <dt>原始资料</dt>
          <dd>
            {m.cloud || "点云缺失"} / {m.video || "视频缺失"}
          </dd>
          <dt>底图</dt>
          <dd>{m.image ? "已上传（可在地图工作台替换）" : "未上传"}</dd>
        </dl>
      </Panel>
      <div className="grid two">
        <Panel title="地图内容概览">
          <Table
            heads={["内容", "数量", "说明"]}
            rows={[
              [
                "地图自带定位ID",
                `${imported.length} 个`,
                "随地图文件带入，保持原样",
              ],
              [
                "平台新增点位",
                `${added.length} 个`,
                "在「地图工作台」继续新增",
              ],
              ["轨迹采样点", `${track.length} 个`, "按顺序连线，作为初始路线依据"],
              [
                "业务点位",
                `${pts.length} 个`,
                "在「巡检点管理」里绑定地图点位后成为可执行巡检点",
              ],
              [
                "版本一致的设备",
                `${synced.length} / ${s.robots.length} 台`,
                "以机器人激活回执为准",
              ],
            ]}
          />
          <div className="actions">
            <Btn onClick={() => DRAWER("工作台")}>打开地图工作台</Btn>
            <Btn onClick={() => DRAWER("下发")}>打开地图下发</Btn>
          </div>
        </Panel>
        <Panel title="版本历史">
          {m.history.length ? (
            m.history.map((h, i) => (
              <p className="event" key={i}>
                {h}
              </p>
            ))
          ) : (
            <p className="muted">暂无版本记录</p>
          )}
          <h4>点位版本清单</h4>
          {pts.length ? (
            pts.map((p) => (
              <p key={p.id}>
                {p.name} · v{p.version} <Badge>{p.state}</Badge>
              </p>
            ))
          ) : (
            <p className="muted">该地图还没有业务点位，去「地图工作台」补点位后再标注。</p>
          )}
        </Panel>
      </div>
      <Panel title="地图预览与业务目标">
        <MapSpatialPreview
          map={m}
          points={pts}
          onSelect={() => go("annotation", m.id)}
        />
      </Panel>

      {drawer && (
        <Modal
          title={`${m.name} · ${drawer === "工作台" ? "地图工作台" : "地图下发与机器同步"}`}
          drawer
          drawerWidth={920}
          onClose={() => DRAWER("")}
        >
          {drawer === "工作台" ? (
            <MapWorkbench mapId={m.id} />
          ) : (
            <MapDispatch mapId={m.id} />
          )}
        </Modal>
      )}

    </>
  );
}
