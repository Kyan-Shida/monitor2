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
 *              巡检点统一到全局坐标系（`p.world`：X/Y/Z），列表筛选**不设地图维度**；
 *              从地图详情带 mapId 进入只用于预选「巡检点导入」的归属地图，不影响列表结果；
 *              筛选（区域 / 设备 / 状态 / 关键词）在「巡检点列表」面板头部；筛选值无效时回退「全部」；
 *              「区域」选项来自「后台管理 › 区域配置」主数据（`areaOptions`），
 *              点的区域按其覆盖设备的归属（`areaNameOf`）判定，无设备时回退该点所在地图区域
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Modal, Note, Panel, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { PointCalibration } from "../components/PointCalibration";
import { GlobalMapOverview } from "../components/GlobalMapOverview";
import { DeviceTree, deviceTreeRegions } from "../components/DeviceTree";
import { targetsOf } from "../data/mapCalibration";
import {
  actionsOfPoint,
  areaNameOf,
  captureKindsOfPoint,
  devicesOfPoint,
} from "../data/deviceMaster";
import type { Point } from "../data/types";

/** 列表每页条数 */
const PAGE_SIZE = 10;

export function InspectionPoints({ id }: { id?: string }) {
  const { s, act } = useStore();
  /** 巡检点导入抽屉：先选数据来源机器人，再拉取 / 上传表格文件（与「地图管理」并列的第二个模块） */
  const [calOpen, SETCAL] = useState(false);
  const [regionF0, REGION] = useViewState("ip.region", "全部"),
    [devF0, DEV] = useViewState("ip.dev", "全部"),
    [stateF0, ST] = useViewState("ip.state", "全部"),
    [kw, KW] = useViewState("ip.q", ""),
    [pager, PG] = useViewState("ip.page", 1),
    /** 全局地图总览面板折叠态：会话内记住，避免每次进来都被大画布占满首屏 */
    [ovOpen, SETOV] = useViewState("ip.overview.open", true);

  /**
   * 区域选项取自「后台管理 › 区域配置」的区域主数据（`areaOptions`：区域清单 ∪ 设备实际归属），
   * 不再从地图数据反推——地图只是底图，不承担区域字典的职责。
   */
  const regions = ["全部", ...deviceTreeRegions(s)];
  const deviceNames = ["全部", ...Array.from(new Set((s.devices || []).map((d) => d.name)))];
  /** 巡检点状态只有两态：已启用 / 停用（原「待验证 / 待重新验证」过渡态已下线，不再作为筛选维度） */
  const stateNames = ["全部", "已启用", "停用"];
  /**
   * 筛选值兜底：筛选态存在 sessionStorage（`view:ip.*`），可能残留已不存在的选项
   * （如旧版本存过的状态值「待验证」）。无效值匹配不到任何 option 时，下拉只会显示
   * 第一项「全部」，过滤却仍按它执行 → 列表被筛空。这里统一回退「全部」。
   */
  const regionF = regions.includes(regionF0) ? regionF0 : "全部";
  const devF = deviceNames.includes(devF0) ? devF0 : "全部";
  const stateF = stateNames.includes(stateF0) ? stateF0 : "全部";
  const keyword = kw.trim();
  /**
   * 巡检点所属区域：按**覆盖设备**的区域归属（与「后台管理 › 设备台账」同一口径 `areaNameOf`）；
   * 一个点覆盖多个区域时返回多个；无设备主数据时回退该点所在地图的区域，避免历史数据丢区域。
   */
  const areasOfPoint = (p: Point): string[] => {
    const hit = Array.from(
      new Set(
        devicesOfPoint(s, p)
          .map((d) => areaNameOf(s, d))
          .filter((x) => x && x !== "未分区"),
      ),
    );
    if (hit.length) return hit;
    const m = s.maps.find((x) => x.id === p.mapId);
    return m?.region ? [m.region] : [];
  };
  const list = s.points.filter((p) => {
    if (regionF !== "全部" && !areasOfPoint(p).includes(regionF)) return false;
    if (stateF !== "全部" && p.state !== stateF) return false;
    const devs = devicesOfPoint(s, p);
    if (devF !== "全部" && !devs.some((d) => d.name === devF)) return false;
    // 巡检点来自独立标定数据（与地图分开放）
    const mp = targetsOf(s, p.mapId).find((t) => t.id === p.targetId);
    const text =
      p.id +
      p.name +
      (mp?.externalId || "") +
      (p.inspectItems || []).map((sp) => sp.name).join("") +
      devs.map((d) => d.name).join("");
    return !keyword || text.includes(keyword);
  });
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  const specCount = s.points.reduce(
    (n, p) => n + (p.inspectItems?.length || 0),
    0,
  );
  /** 树选中值 ← 页面筛选（设备优先于区域），保证树高亮与列表口径一致 */
  const treeSel =
    devF !== "全部"
      ? "d:" + ((s.devices || []).find((d) => d.name === devF)?.id || "")
      : regionF !== "全部"
        ? "r:" + regionF
        : "";
  /**
   * 树选中 → 页面筛选
   * @description 区域与设备是同一组筛选维度（区域决定设备候选），故一次写两个：
   *              点区域 = 该区域下全部设备；点设备 = 该设备所属区域 + 单台设备
   * @param next 树选中值
   */
  function onTree(next: string) {
    if (next.startsWith("d:")) {
      const d = (s.devices || []).find((x) => x.id === next.slice(2));
      REGION(d ? areaNameOf(s, d) : "全部");
      DEV(d?.name || "全部");
    } else if (next.startsWith("r:")) {
      REGION(next.slice(2));
      DEV("全部");
    } else {
      REGION("全部");
      DEV("全部");
    }
    PG(1);
  }

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
      <div className="device-layout">
        {/* 左侧区域 › 设备树：与设备台账同一棵树，选中即落到页面既有的区域 / 设备筛选维度 */}
        <DeviceTree value={treeSel} onChange={onTree} ariaLabel="巡检点树" />
        <div className="device-main">
          <div className="toolbar" style={{ justifyContent: "flex-end" }}>
            <div className="actions">
              <Btn primary onClick={() => go("point-onsite")}>
                现场采集新增
              </Btn>
              <Btn onClick={() => SETCAL(true)}>
                批量导入
              </Btn>
            </div>
          </div>
          <Panel
            title="全局地图总览"
            extra={
              <div className="actions">
                <Btn
                  onClick={() => SETOV((v) => !v)}
                  title={ovOpen ? "收起总览画布" : "展开总览画布"}
                >
                  {ovOpen ? "收起" : "展开"}
                </Btn>
              </div>
            }
          >
            {/* 总览画布展示的是**全厂所有巡检点**在统一坐标系下的位置，不随列表筛选收敛 */}
            {ovOpen && <GlobalMapOverview points={s.points} />}
          </Panel>
          <Panel
            className="panel-filters-wrap"
            title="巡检点列表"
            extra={
              <div className="actions">
                <label className="inline-filter">
                  <span>状态：</span>
                  <select value={stateF} onChange={(e) => ST(e.target.value)}>
                    {stateNames.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <input
                  placeholder="搜索巡检点名称 / 定位ID / 巡检项 / 设备"
                  value={kw}
                  onChange={(e) => KW(e.target.value)}
                />
                <span>{list.length} 条</span>
              </div>
            }
          >
            <Table
              heads={[
                "巡检点名称",
                "统一坐标（米）",
                "区域",
                "巡检项名称",
                "操作内容",
                "覆盖设备",
                "状态",
                "操作",
              ]}
              rows={rows.map((p) => {
                const specs = p.inspectItems || [];
                const devs = devicesOfPoint(s, p);
                const w = p.world;
                return [
                  p.name,
                  w ? `X ${w.x} · Y ${w.y} · Z ${w.z}` : "未写入统一坐标",
                  areasOfPoint(p).join(" / ") || "—",
                  specs.map((sp) => sp.name).join(" / ") || "—",
                  actionsOfPoint(s, p).join(" / ") || "—",
                  devs.map((d) => d.name).join(" / ") || "—",
                  <Badge tone={p.state === "已启用" ? "green" : "amber"}>{p.state}</Badge>,
                  <div className="actions">
                    <Btn onClick={() => go("point-edit", p.id)}>编辑巡检点</Btn>
                    <Btn
                      onClick={() =>
                        act({ type: "TOGGLE_POINT_STATE", id: p.id })
                      }
                    >
                      {p.state === "停用" ? "启用" : "停用"}
                    </Btn>
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
        </div>
      </div>
      {/* 第二个模块：巡检点导入（先选机器人，再拉取 / 上传表格文件；与地图分开放） */}
      {calOpen && (
        <Modal
          title="巡检点导入"
          wide
          onClose={() => SETCAL(false)}
        >
          {/* 从地图详情带 mapId 进入时，导入抽屉默认选中该地图；列表本身不按地图筛选 */}
          <PointCalibration mapId={id} />
        </Modal>
      )}
    </>
  );
}
