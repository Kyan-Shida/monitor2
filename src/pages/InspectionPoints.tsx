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
 *              本页**不再挂左侧区域 › 设备树**：列表筛选走项目通用 `components/FilterPanel`
 *              （巡检点名称 / 巡检项名称 / 关联设备 / 状态），「筛选」触发按钮与
 *              「现场采集新增 / 批量导入」同排在「巡检点列表」面板头部**右侧**；
 *              筛选值无效时回退「全部」；列内「区域」仍按其覆盖设备的归属（`areaNameOf`）判定，
 *              无设备时回退该点所在地图区域
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go, usePageSize, useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Modal, Note, Panel, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { PointCalibration } from "../components/PointCalibration";
import { FilterPanel } from "../components/FilterPanel";
import {
  actionsOfPoint,
  areaNameOf,
  captureKindsOfPoint,
  devicesOfPoint,
} from "../data/deviceMaster";
import type { Point } from "../data/types";


export function InspectionPoints({ id }: { id?: string }) {
  const { s, act } = useStore();
  /** 巡检点导入抽屉：先选数据来源机器人，再拉取 / 上传表格文件（与「地图管理」并列的第二个模块） */
  const [calOpen, SETCAL] = useState(false);
  /** 筛选面板展开态：展开时才显示 FilterPanel（触发按钮在「巡检点列表」面板头部） */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  /** 筛选草稿：字段与 FilterPanel 的 fields 一一对应（点「查询」才写回生效值） */
  const [draft, DRAFT] = useState({
    name: "",
    item: "",
    dev: "全部",
    state: "全部",
  });
  /**
   * 列表筛选（生效值）：巡检点名称 / 巡检项名称 / 关联设备 / 状态。
   * 视图键用 `ip.filter.*` 新前缀：老的 `ip.q` / `ip.state` 已被本页废弃，
   * 若继续复用，sessionStorage 里的残留值会在没有对应控件的情况下把列表隐式筛空。
   */
  const [nameF, NAMEF] = useViewState("ip.filter.name", ""),
    [itemF, ITEMF] = useViewState("ip.filter.item", ""),
    [devF0, DEVF] = useViewState("ip.filter.dev", "全部"),
    [stateF0, ST] = useViewState("ip.filter.state", "全部"),
    [pager, PG] = useViewState("ip.page", 1),
    /** 每页条数：全站统一走 usePageSize（默认 5 条） */
    [pageSize, SETPAGESIZE] = usePageSize("ip.size");

  /** 巡检点状态只有两态：已启用 / 停用（原「待验证 / 待重新验证」过渡态已下线，不再作为筛选维度） */
  const stateNames = ["全部", "已启用", "停用"];
  /** 关联设备候选：设备台账里的设备名去重（本页已无区域树，直接取全量设备名） */
  const devNames = [
    "全部",
    ...Array.from(new Set((s.devices || []).map((d) => d.name))),
  ];
  /**
   * 筛选值兜底：筛选态存在 sessionStorage（`view:ip.*`），可能残留已不存在的选项
   * （如旧版本存过的状态值「待验证」）。无效值匹配不到任何 option 时，下拉只会显示
   * 第一项「全部」，过滤却仍按它执行 → 列表被筛空。这里统一回退「全部」。
   */
  const stateF = stateNames.includes(stateF0) ? stateF0 : "全部";
  const devF = devNames.includes(devF0) ? devF0 : "全部";
  const nameKw = nameF.trim();
  const itemKw = itemF.trim();
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
    if (stateF !== "全部" && p.state !== stateF) return false;
    const devs = devicesOfPoint(s, p);
    if (devF !== "全部" && !devs.some((d) => d.name === devF)) return false;
    if (nameKw && !p.name.includes(nameKw)) return false;
    if (
      itemKw &&
      !(p.inspectItems || []).some((sp) => (sp.name || "").includes(itemKw))
    )
      return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * pageSize, cur * pageSize);
  const specCount = s.points.reduce(
    (n, p) => n + (p.inspectItems?.length || 0),
    0,
  );
  /** 已生效的筛选条件数（「筛选」按钮上的计数） */
  const filterCount =
    (nameKw ? 1 : 0) +
    (itemKw ? 1 : 0) +
    (devF !== "全部" ? 1 : 0) +
    (stateF !== "全部" ? 1 : 0);
  /** 展开筛选面板：用当前生效值填充草稿（草稿值用未兜底的原始值，避免丢用户填的内容） */
  function toggleFilter() {
    if (!filterOpen)
      DRAFT({ name: nameF, item: itemF, dev: devF0, state: stateF0 });
    SETFILTEROPEN(!filterOpen);
  }
  /** 查询：草稿写回生效值、回到第 1 页并收起面板 */
  function applyFilter() {
    NAMEF(draft.name);
    ITEMF(draft.item);
    DEVF(draft.dev);
    ST(draft.state);
    PG(1);
    SETFILTEROPEN(false);
  }
  /** 重置：草稿与生效值一起清空，立即生效（不再要求再点一次「查询」） */
  function resetFilter() {
    const empty = { name: "", item: "", dev: "全部", state: "全部" };
    DRAFT(empty);
    NAMEF(empty.name);
    ITEMF(empty.item);
    DEVF(empty.dev);
    ST(empty.state);
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
        <div className="device-main">
          <Panel
            className="panel-filters-wrap"
            title="巡检点列表"
            extra={
              <div className="actions" style={{ justifyContent: "flex-end" }}>
                {/* 关键词搜索并入「筛选」面板：巡检点名称 / 巡检项名称 / 关联设备 / 状态 */}
                <Btn onClick={toggleFilter}>
                  {filterOpen ? "收起筛选" : "筛选"}
                  {filterCount ? `（${filterCount}）` : ""}
                </Btn>
                <Btn primary onClick={() => go("point-onsite")}>
                  现场采集新增
                </Btn>
                <Btn onClick={() => SETCAL(true)}>批量导入</Btn>
              </div>
            }
          >
            {filterOpen && (
              <FilterPanel
                fields={[
                  {
                    key: "name",
                    label: "巡检点名称",
                    placeholder: "名称关键字",
                  },
                  {
                    key: "item",
                    label: "巡检项名称",
                    placeholder: "巡检项关键字",
                  },
                  { key: "dev", label: "关联设备", options: devNames },
                  { key: "state", label: "状态", options: stateNames },
                ]}
                value={draft}
                onChange={(next) => DRAFT({ ...draft, ...next })}
                onSearch={applyFilter}
                onReset={resetFilter}
              />
            )}
            <Table
              heads={[
                "巡检点 ID",
                "巡检点名称",
                "统一坐标（米）",
                "区域",
                "巡检项名称",
                "覆盖设备",
                "状态",
                "操作",
              ]}
              rows={rows.map((p) => {
                const specs = p.inspectItems || [];
                const devs = devicesOfPoint(s, p);
                const w = p.world;
                return [
                  p.id,
                  p.name,
                  w ? `X ${w.x} · Y ${w.y} · Z ${w.z}` : "未写入统一坐标",
                  areasOfPoint(p).join(" / ") || "—",
                  specs.map((sp) => sp.name).join(" / ") || "—",
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
            <Pager
              page={cur}
              count={list.length}
              size={pageSize}
              onChange={PG}
              onSize={(n) => {
                SETPAGESIZE(n);
                PG(1);
              }}
            />
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
