/**
 * @file MapDetail.tsx
 * @description 地图详情（内置页，挂在「地图管理」目录下）：展示单张**纯点云地图**的信息与状态，
 *              并提供一个内嵌抽屉——**地图下发**（多选设备同步）。
 *              **本页不含任何定位ID与巡检点**：采集同批产出的「巡检点标定文件」归第二个模块
 *              ——「巡检点管理 › 导入巡检点标定文件」（components/PointCalibration.tsx）——
 *              导入，两者按**定位 ID**绑定。
 * @interaction 地图列表「详情」→ `#/robots/maps/detail/:id`；深链 `?tab=sync` 直达下发抽屉，
 *              旧深链 `?tab=workbench` 会提示标定已迁至巡检点管理
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { Badge, Btn, Modal, Note, Panel } from "../components/UI";
import { MapSpatialPreview } from "../components/MapSpatialPreview";
import { MapDispatch } from "../components/MapDispatch";

export function MapDetail({ id, tab }: { id?: string; tab?: string }) {
  const { s } = useStore();
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  /** 抽屉：空串表示关闭；深链 `?tab=sync` 可直接打开下发抽屉 */
  const [drawer, DRAWER] = useState(tab === "sync" ? "下发" : "");
  /** 草稿状态下的下发确认弹窗 */
  const [confirmDispatch, SETCONFIRM] = useState(false);
  if (!m) return <Note>地图不存在，请从地图列表进入。</Note>;
  /** 旧深链 `?tab=workbench`：地图工作台已不再属于地图管理 */
  const legacyWorkbench = tab === "workbench";

  const openDispatch = () => {
    if (m.state === "草稿") SETCONFIRM(true);
    else DRAWER("下发");
  };

  return (
    <>
      <div className="context-bar">
        <b>{m.name}</b>
        <span>
          {m.id} · {m.region} · m{m.version}
        </span>
        <Badge>{m.state}</Badge>
        {/* 地图管理只保留一个动作：地图下发（同步给设备）；巡检点标定不在这里 */}
        <div className="actions">
          <Btn primary onClick={openDispatch}>
            地图下发
          </Btn>
        </div>
      </div>

      {legacyWorkbench && (
        <Note>
          <b>地图工作台已下线：</b>巡检点标定归第二个模块——「巡检点管理 › 巡检点导入」；
          标定数据独立存储、与地图分开放，两者按<b>定位 ID</b>绑定。
          <Btn onClick={() => go("annotation", m.id)}>前往巡检点导入 →</Btn>
        </Note>
      )}

      {m.state === "草稿" && (
        <Note>
          <b>当前地图为草稿状态：</b>编辑内容尚未下发到设备，请点击「地图下发」定版并同步。
        </Note>
      )}

      {/* MAP-03：地图下发只下发点云底图；巡检点用坐标 + 业务数据单独下发 */}
      <Note>
        地图就是<b>纯点云</b>，只记录"机器人能走哪"，<b>不含任何定位ID与巡检点</b>。
        地图下发<b>只下发纯点云底图</b>；<b>巡检点</b>由同批采集产出的「巡检点标定文件」
        在「巡检点管理」导入后，用<b>坐标 + 业务数据单独下发</b>；
        标定数据与地图分开放（各自带版本 m / c）。
      </Note>

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
            空间版本 m{m.version}
            {m.deviceListVersion ? ` · 设备清单 c${m.deviceListVersion}` : ""}
            <small>点位标定数据带自己的版本 c，不改变地图空间版本</small>
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
          <dd>{m.image ? "已上传（纯点云底图）" : "未上传"}</dd>
        </dl>
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
      <Panel title="地图预览（纯点云底图）">
        <Note>
          <b>本页只预览纯点云底图</b>：定位ID、标定点、巡检点与巡检路线都不属于地图，
          统一在「巡检点管理」中导入 / 维护。
        </Note>
        <MapSpatialPreview
          map={m}
          points={[]}
          targets={[]}
          routes={[]}
          onSelect={() => go("annotation", m.id)}
        />
      </Panel>

      {drawer && (
        <Modal
          title={`${m.name} · 地图下发与机器同步`}
          drawer
          drawerWidth={920}
          onClose={() => DRAWER("")}
        >
          <MapDispatch mapId={m.id} />
        </Modal>
      )}

      {confirmDispatch && (
        <Modal title="草稿地图即将下发" onClose={() => SETCONFIRM(false)}>
          <p>
            当前地图处于<b>草稿</b>状态，点击「确认下发」后将自动定版为当前版本，并把
            m{m.version} 与最新标定数据同步给所选设备。
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
