/**
 * @file InspectionPoints.tsx
 * @description 巡检点管理（菜单页）：**已配置的巡检点列表**（筛选 / 搜索 / 分页）+「添加巡检点」。
 *              巡检点 = 巡检点名称 + 地图 + 地图点位（带定位ID）+ 多个巡检项；
 *              巡检项 = 巡检项名称 + 巡检目标台账 + 机器操作内容（原子动作 / 云台参数）。
 *              任务模板、临时任务都基于巡检点下发（本页是巡检点的唯一维护入口）。
 * @interaction 菜单「资源与地图 › 点位与对象 › 巡检点管理」（原「点位标注与验证工作台」槽位）；
 *              「＋ 添加巡检点」/ 行内「编辑」→ 内置页 point-edit；「详情」→ 内置页 point；
 *              地图详情点选点位后带 mapId 进入本页（按该地图预筛）
 */
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Panel, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { actionsOfPoint, captureKindsOfPoint, devicesOfPoint } from "../data/deviceMaster";

/** 列表每页条数 */
const PAGE_SIZE = 10;
/** 状态筛选项（与 Point.state 对齐） */
const STATES = ["全部", "待验证", "已启用", "待重新验证", "停用"];

export function InspectionPoints({ id }: { id?: string }) {
  const { s } = useStore();
  const [mapF, MAP] = useViewState("ip.map", id || "全部"),
    [stateF, ST] = useViewState("ip.state", "全部"),
    [kw, KW] = useViewState("ip.q", ""),
    [pager, PG] = useViewState("ip.page", 1);

  const maps = ["全部", ...s.maps.map((m) => m.name)];
  const mapIdOfName = (name: string) => s.maps.find((m) => m.name === name)?.id;
  const keyword = kw.trim();
  const list = s.points.filter((p) => {
    if (mapF !== "全部" && p.mapId !== mapIdOfName(mapF)) return false;
    if (stateF !== "全部" && p.state !== stateF) return false;
    const m = s.maps.find((x) => x.id === p.mapId);
    const mp = m?.targets.find((t) => t.id === p.targetId);
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
        <Btn primary onClick={() => go("point-edit", "new")}>
          ＋ 添加巡检点
        </Btn>
      </div>
      <Panel title="巡检点列表" extra={<span>{list.length} 条</span>}>
        <p className="muted">
          巡检点 = <b>巡检点名称 + 地图 + 地图点位（带定位ID）+ 多个巡检项</b>；
          巡检项 = 巡检项名称 + 巡检目标台账 + 机器操作内容（原子动作 / 云台参数）。
          任务模板与临时任务都基于巡检点下发。
        </p>
        <Table
          heads={[
            "巡检点名称",
            "地图 / 地图点位",
            "巡检项",
            "机器操作内容",
            "覆盖设备",
            "状态",
            "操作",
          ]}
          rows={rows.map((p) => {
            const m = s.maps.find((x) => x.id === p.mapId);
            const mp = m?.targets.find((t) => t.id === p.targetId);
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
                <Btn onClick={() => go("point", p.id)}>详情</Btn>
              </div>,
            ];
          })}
        />
        {!rows.length && (
          <Empty>
            没有符合条件的巡检点，点「＋ 添加巡检点」绑定地图点位并配置巡检项。
          </Empty>
        )}
        <Pager page={cur} count={list.length} size={PAGE_SIZE} onChange={PG} />
      </Panel>
    </>
  );
}
