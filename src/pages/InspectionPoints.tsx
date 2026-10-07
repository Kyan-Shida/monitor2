/**
 * @file InspectionPoints.tsx
 * @description 巡检点管理（菜单页）：**已配置的巡检点列表**（筛选 / 搜索 / 分页）
 *              +「巡检点导入」（先选数据来源机器人，再拉取 / 上传表格文件；与「地图管理」并列的第二个模块）。
 *              MAP-02 口径：现场一趟采集产出两件（点云地图文件 + 巡检点标定文件），
 *              两件分开上传：地图归「地图管理」，标定文件归本页，两者按**定位 ID**绑定。
 *              巡检点 = 巡检点名称 + 地图 + 标定点（定位ID）+ 多个巡检项；
 *              巡检项 = 巡检项名称 + 巡检目标台账 + 机器操作内容（原子动作 / 云台参数）。
 *              地图只提供纯点云底图；标定数据独立存储（data/mapCalibration.ts），与地图分开放。
 *              任务模板、临时任务都基于巡检点下发（本页是巡检点的唯一维护入口）。
 * @interaction 菜单「资源与地图 › 点位与对象 › 巡检点管理」（原「点位标注与验证工作台」槽位）；
 *              「巡检点导入」→ 导入抽屉（components/PointCalibration.tsx）；行内「编辑巡检点」→ 内置页 point-edit
 *              （列表操作列**不再提供「详情」入口**，避免与编辑页重复）；
 *              地图详情点选点位后带 mapId 进入本页（按该地图预筛）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Modal, Note, Panel, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { PointCalibration } from "../components/PointCalibration";
import { GlobalMapOverview } from "../components/GlobalMapOverview";
import { targetsOf } from "../data/mapCalibration";
import { actionsOfPoint, captureKindsOfPoint, devicesOfPoint } from "../data/deviceMaster";

/** 列表每页条数 */
const PAGE_SIZE = 10;
/** 状态筛选项（与 Point.state 对齐） */
const STATES = ["全部", "待验证", "已启用", "待重新验证", "停用"];

export function InspectionPoints({ id }: { id?: string }) {
  const { s } = useStore();
  /** 巡检点导入抽屉：先选数据来源机器人，再拉取 / 上传表格文件（与「地图管理」并列的第二个模块） */
  const [calOpen, SETCAL] = useState(false);
  const [mapF, MAP] = useViewState("ip.map", id || "全部"),
    [stateF, ST] = useViewState("ip.state", "全部"),
    [kw, KW] = useViewState("ip.q", ""),
    [pager, PG] = useViewState("ip.page", 1),
    /** 全局地图总览面板折叠态：会话内记住，避免每次进来都被大画布占满首屏 */
    [ovOpen, SETOV] = useViewState("ip.overview.open", true);

  const maps = ["全部", ...s.maps.map((m) => m.name)];
  const mapIdOfName = (name: string) => s.maps.find((m) => m.name === name)?.id;
  const keyword = kw.trim();
  const list = s.points.filter((p) => {
    if (mapF !== "全部" && p.mapId !== mapIdOfName(mapF)) return false;
    if (stateF !== "全部" && p.state !== stateF) return false;
    // 巡检点来自独立标定数据（与地图分开放）
    const mp = targetsOf(s, p.mapId).find((t) => t.id === p.targetId);
    const text =
      p.id +
      p.name +
      (mp?.externalId || "") +
      (p.inspectItems || []).map((sp) => sp.name).join("") +
      devicesOfPoint(s, p)
        .map((d) => d.name)
        .join("");
    return !keyword || text.includes(keyword);
  });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const specCount = s.points.reduce(
    (n, p) => n + (p.inspectItems?.length || 0),
    0,
  );

  return (
    <>
      <div className="metric-strip">
        <div>
          <span>巡检点</span>
          <strong>{s.points.length}</strong>
        </div>
        <div>
          <span>已启用</span>
          <strong>{s.points.filter((p) => p.state === "已启用").length}</strong>
        </div>
        <div>
          <span>待验证</span>
          <strong>
            {
              s.points.filter((p) =>
                ["待验证", "待重新验证"].includes(p.state),
              ).length
            }
          </strong>
        </div>
        <div>
          <span>巡检项</span>
          <strong>{specCount}</strong>
        </div>
      </div>
      {s.pendingCalibration && (
        <Note>
          <b>有 1 份巡检点标定文件待绑定：</b>
          {s.pendingCalibration.file} · {s.pendingCalibration.points.length} 个定位点 ·
          点「巡检点导入」并选择地图即可完成绑定。
        </Note>
      )}
      <div className="toolbar">
        <div className="actions">
          <label className="inline-filter">
            <span>地图：</span>
            <select value={mapF} onChange={(e) => MAP(e.target.value)}>
              {maps.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="inline-filter">
            <span>状态：</span>
            <select value={stateF} onChange={(e) => ST(e.target.value)}>
              {STATES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <input
            placeholder="搜索巡检点名称 / 定位ID / 巡检项 / 设备"
            value={kw}
            onChange={(e) => KW(e.target.value)}
          />
        </div>
        <div className="actions">
          <Btn primary onClick={() => SETCAL(true)}>
            巡检点导入
          </Btn>
        </div>
      </div>
      <Panel
        title="全局地图总览"
        extra={
          <div className="actions">
            <span>
              {list.length} 个巡检点 · {new Set(list.map((p) => p.mapId)).size} 张地图 ·
              统一坐标系
            </span>
            <Btn
              onClick={() => SETOV((v) => !v)}
              title={ovOpen ? "收起总览画布" : "展开总览画布"}
            >
              {ovOpen ? "收起" : "展开"}
            </Btn>
          </div>
        }
      >
        {ovOpen && (
          <>
            <details className="spec-note">
              <summary>口径说明：全局地图总览如何汇总多张地图</summary>
              把所有巡检点按<b>统一坐标系</b>汇总到同一张画布：多张分区地图各自是本地相对坐标系，
              无法直接叠加，故以 <b>world 统一坐标（全厂 XYZ）</b>为权威定位统一后展示；
              <b>地图 ID 仅作参考键</b>（决定分组与配色）。未写入统一坐标的点会回退本地坐标并标注。
              点击点位可直接跳转编辑。
            </details>
            <GlobalMapOverview points={list} />
          </>
        )}
      </Panel>
      <Panel title="巡检点列表" extra={<span>{list.length} 条</span>}>
        <details className="spec-note">
          <summary>口径说明：巡检点 / 巡检项 / 标定数据如何组织</summary>
          巡检点 = <b>巡检点名称 + 地图 + 标定点（定位ID）+ 多个巡检项</b>；
          巡检项 = 巡检项名称 + 巡检目标台账 + 机器操作内容（原子动作 / 云台参数）。
          <br />
          地图只提供<b>纯点云底图</b>（不含任何点位）；现场一趟采集产出的
          <b>巡检点标定文件</b>在本页导入，按<b>定位 ID</b>与地图绑定，
          标定数据<b>单独存储、与地图分开放</b>。任务模板与临时任务都基于巡检点下发。
        </details>
        <Table
          heads={[
            "巡检点名称",
            "地图 / 标定点",
            "巡检项",
            "机器操作内容",
            "覆盖设备",
            "状态",
            "操作",
          ]}
          rows={rows.map((p) => {
            const m = s.maps.find((x) => x.id === p.mapId);
            const mp = targetsOf(s, p.mapId).find((t) => t.id === p.targetId);
            const specs = p.inspectItems || [];
            const devs = devicesOfPoint(s, p);
            return [
              <>
                <b>{p.name}</b>
                <small>
                  {p.id} · v{p.version}
                </small>
              </>,
              <>
                {m?.name || p.mapId}
                <small>
                  {mp?.externalId ? `定位ID ${mp.externalId}` : "缺少定位ID（待补录）"}
                  {mp?.source ? ` · ${mp.source}` : ""}
                </small>
              </>,
              <>
                {specs.length} 项
                <small>{specs.map((sp) => sp.name).join(" / ") || "—"}</small>
              </>,
              <>
                {actionsOfPoint(s, p).join(" / ") || "—"}
                <small>{captureKindsOfPoint(s, p).join(" / ")}</small>
              </>,
              <>
                {devs.map((d) => d.name).join(" / ") || "—"}
                <small>
                  {devs.some((d) => d.state === "停用") ? (
                    <Badge>含已停用设备</Badge>
                  ) : (
                    `${devs.length} 台`
                  )}
                </small>
              </>,
              <>
                <Badge>{p.state}</Badge>
                {p.calibrate === "待校准" && <small>待校准</small>}
              </>,
              <div className="actions">
                <Btn onClick={() => go("point-edit", p.id)}>编辑巡检点</Btn>
              </div>,
            ];
          })}
        />
        {!rows.length && (
          <Empty>
            没有符合条件的巡检点，点「巡检点导入」绑定标定点并配置巡检项。
          </Empty>
        )}
        <Pager page={cur} count={list.length} size={PAGE_SIZE} onChange={PG} />
      </Panel>
      {/* 第二个模块：巡检点导入（先选机器人，再拉取 / 上传表格文件；与地图分开放） */}
      {calOpen && (
        <Modal
          title="巡检点导入"
          drawer
          drawerWidth={980}
          onClose={() => SETCAL(false)}
        >
          <PointCalibration mapId={mapIdOfName(mapF)} />
        </Modal>
      )}
    </>
  );
}
