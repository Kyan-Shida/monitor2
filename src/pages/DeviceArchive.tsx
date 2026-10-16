/**
 * @file DeviceArchive.tsx
 * @description 设备巡检档案（内置页）：主数据字段块 + 检测目标 / 历史结果 / 关联告警三个视图
 * @interaction 由「设备台账」行内「设备档案」进入；采集证据、巡检任务两个视图已下线
 */
import { useStore } from "../data/store";
import { useViewState } from "../data/navigation";
import { pointOf, judgeOf } from "../data/selectors";
import { Panel, Table, Badge, Note } from "../components/UI";
import { ObjectLink } from "../components/Business";
import { DeviceSummary } from "../components/DeviceSummary";
import { deviceOf } from "../data/deviceMaster";

/** 档案视图（顺序即 tab 顺序）；旧记忆值落在已下线视图上时回落到首个视图 */
const TABS = ["检测目标", "历史结果", "关联告警"];

export function DeviceArchive({ id }: { id?: string; tab?: string }) {
  const { s } = useStore();
  // 设备口径：以设备主数据为准（唯一来源）；严格按路由上的设备编码 / 主数据 id 绑定，
  // 查不到就明确提示（不退化到"第一台设备"，也不要求该设备已有巡检点）
  const picked = id ? deviceOf(s, id) : undefined;
  const device = picked?.name || "";
  const dev = picked;
  const points = device ? s.points.filter((p) => p.device === device) : [],
    results = device
      ? s.results.filter((r) => pointOf(s, r)?.device === device)
      : [],
    alarms = device
      ? s.alarms.filter((a) => points.some((p) => p.id === a.pointId))
      : [];
  // 视图状态按设备维度记忆：未绑定时先用占位 key，保证 Hook 调用顺序稳定
  const scope = device || "_";
  const [view, T] = useViewState("archive." + scope, TABS[0]);
  const tab = TABS.includes(view) ? view : TABS[0];
  // 未绑定到具体设备（缺 ID 或 ID 不存在）时直接说明，不展示别的设备的档案
  // 注：必须放在全部 Hook 之后，避免 Hook 调用数量随数据变化
  if (!device)
    return (
      <Note>
        未找到设备{id ? ` ${id}` : ""}，请从「设备台账」进入设备档案。
      </Note>
    );
  return (
    <>
      <div className="object-summary">
        {dev ? <DeviceSummary key={dev.id} dev={dev} /> : <h2>{device}</h2>}
      </div>
      <div className="local-tabs">
        {TABS.map((x) => (
          <button
            key={x}
            className={tab === x ? "active" : ""}
            onClick={() => T(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {tab === "检测目标" ? (
        <Panel title="设备检测目标与最新识别">
          <Table
            heads={[
              "检测目标",
              "业务点位",
              "观察项",
              "最新识别",
              "最新检测时间",
              "结果",
            ]}
            rows={points.map((p) => {
              const r = results.find((x) => x.pointId === p.id);
              return [
                p.object,
                <ObjectLink type="point" id={p.id}>
                  {p.name}
                </ObjectLink>,
                p.item,
                r ? `${r.final} ${r.unit}` : "尚未检测",
                r?.time || "—",
                r ? (
                  <ObjectLink type="review" id={r.id} to="result-detail">
                    {r.id}
                  </ObjectLink>
                ) : (
                  "无结果"
                ),
              ];
            })}
          />
        </Panel>
      ) : tab === "历史结果" ? (
        <Panel title="历史结果">
          <Table
            heads={["时间", "观察项", "值 / 来源", "判断", "证据详情"]}
            rows={results.map((r) => [
              r.time,
              r.item,
              `${r.final} ${r.unit}`,
              <Badge>{judgeOf(r)}</Badge>,
              <ObjectLink type="review" id={r.id} to="result-detail" />,
            ])}
          />
        </Panel>
      ) : (
        <Panel title="设备告警">
          <Table
            heads={["告警", "状态", "来源任务", "处置"]}
            rows={alarms.map((a) => [
              a.name,
              <Badge>{a.state}</Badge>,
              <ObjectLink type="task-detail" id={a.taskId} />,
              <ObjectLink type="alarm" id={a.id} to="alarm-detail">
                查看详情
              </ObjectLink>,
            ])}
          />
        </Panel>
      )}
    </>
  );
}
