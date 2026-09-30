/**
 * @file MapDetail.tsx
 * @description 地图详情（内置页，挂在「地图管理」目录下）：展示单张地图的详细信息与状态，
 *              并提供两个内嵌抽屉——**地图工作台**（管理巡航点）与**地图下发**（多选设备同步）。
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
  /** 草稿状态下的下发确认弹窗 */
  const [confirmDispatch, SETCONFIRM] = useState(false);
  if (!m) return <Note>地图不存在，请从地图列表进入。</Note>;
  const pts = s.points.filter((p) => p.mapId === m.id);

  const openWorkbench = () => DRAWER("工作台");
  const openDispatch = () => {
    if (m.state === "草稿") SETCONFIRM(true);
    else DRAWER("下发");
  };

  return (
    <>
      <div className="context-bar">
        <b>{m.name}</b>
        <span>
          {m.id} · {m.region} · m{m.version} / p{m.pointSet}
        </span>
        <Badge>{m.state}</Badge>
        {/* 详情页只保留两个动作：地图工作台（管理巡航点）与地图下发（同步给设备） */}
        <div className="actions">
          <Btn primary onClick={openWorkbench}>
            地图工作台
          </Btn>
          <Btn primary onClick={openDispatch}>
            地图下发
          </Btn>
        </div>
      </div>

      {m.state === "草稿" && (
        <Note>
          <b>当前地图为草稿状态：</b>编辑内容尚未下发到设备，请点击「地图下发」定版并同步。
        </Note>
      )}

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
        <Panel title="巡航点清单（带ID）">
          <p className="muted">
            巡航点即地图携带的定位标记（带ID）；在「地图工作台」增删改。业务化（绑定设备成为可执行巡检点）在「巡检点管理 / 巡检目标台账」完成。
          </p>
          <Table
            heads={["ID / 定位号", "来源", "类型", "坐标 (x,y)", "状态"]}
            rows={m.targets.map((t) => [
              t.externalId || t.id,
              t.source,
              t.kind,
              `(${t.x}, ${t.y})`,
              <Badge>{t.state}</Badge>,
            ])}
          />
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
        </Panel>
      </div>
      <Panel title="地图预览 · 巡航点">
        <MapSpatialPreview
          map={m}
          points={pts}
          cruiseOnly
          routes={(s.routes || []).filter((r) => r.mapId === m.id)}
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

      {confirmDispatch && (
        <Modal title="草稿地图即将下发" onClose={() => SETCONFIRM(false)}>
          <p>
            当前地图处于<b>草稿</b>状态，点击「确认下发」后将自动定版为当前版本，并把
            m{m.version} / p{m.pointSet} 同步给所选设备。
          </p>
          <div className="actions">
            <Btn onClick={() => SETCONFIRM(false)}>取消</Btn>
            <Btn
              primary
              onClick={() => {
                SETCONFIRM(false);
                DRAWER("下发");
              }}
            >
              确认下发
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
