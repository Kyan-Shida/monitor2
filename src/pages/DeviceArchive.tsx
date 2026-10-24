/**
 * @file DeviceArchive.tsx
 * @description 设备巡检档案（内置页）：主数据字段块 + 检测结果 / 关联告警两个视图
 * @interaction 由「设备台账」行内「设备档案」进入；采集证据、巡检任务两个视图已下线
 * @description 「检测项」与「历史结果」已合并为「检测结果」：两者原来都是看结果，
 *              分开后要在两个 tab 间来回切才能知道——某个检测项当前什么值 / 哪次采到了什么；
 *              合并后按结果逐条列（含所属检测项），时间筛选 + 分页即可，最新在前
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { pointOf, judgeOf } from "../data/selectors";
import { Badge, Btn, Note, Panel, Table } from "../components/UI";
import { ObjectLink, Pager } from "../components/Business";
import { FilterPanel } from "../components/FilterPanel";
import { DeviceSummary } from "../components/DeviceSummary";
import { deviceOf } from "../data/deviceMaster";
import { fmtDateTime } from "../data/types";

/** 档案视图（顺序即 tab 顺序）；旧记忆值（含已合并的「检测项 / 历史结果」）回落到首个视图 */
const TABS = ["检测结果", "关联告警"];

/**
 * 一个视图的「时间范围 + 分页」状态
 * @description 两个视图各自独立记忆（键 = 设备维度 + 视图名），互不干扰；
 *              草稿值与生效值分开，点「查询」才生效，输入过程中列表不跳动
 */
function useTimePaged(scope: string, key: string) {
  const [from, HF] = useViewState(`${scope}.${key}.from`, "");
  const [to, HT] = useViewState(`${scope}.${key}.to`, "");
  const [draft, setDraft] = useState({ from, to });
  const [page, setPage] = useViewState(`${scope}.${key}.page`, 1);
  const [size, setSize] = usePageSize(`${scope}.${key}.size`);
  const [open, setOpen] = useState(false);
  return { from, to, draft, page, size, open, HF, HT, setDraft, setPage, setSize, setOpen };
}

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
  /** 两个视图各自的「时间范围 + 分页」：检测结果按结果时间、告警按发生时间 */
  const resF = useTimePaged(scope, "result");
  const alarmF = useTimePaged(scope, "alarm");
  // 未绑定到具体设备（缺 ID 或 ID 不存在）时直接说明，不展示别的设备的档案
  // 注：必须放在全部 Hook 之后，避免 Hook 调用数量随数据变化
  if (!device)
    return (
      <Note>
        未找到设备{id ? ` ${id}` : ""}，请从「设备台账」进入设备档案。
      </Note>
    );
  /** 只按日期比较（历史数据里可能混有带秒 / 斜杠的写法，统一格式化后取前 10 位） */
  const dayOf = (t?: string) => fmtDateTime(t).slice(0, 10);
  /** 时间范围命中：两端留空即不限 */
  const inRange = (f: { from: string; to: string }, day: string) =>
    (!f.from || day >= f.from) && (!f.to || day <= f.to);
  /** 结果所属巡检点（检测项 / 巡检点名称 / 观察项都取自它） */
  const pointOfResult = (r: (typeof results)[number]) =>
    points.find((p) => p.id === r.pointId);
  /** 最新在前：统一格式化后的 `YYYY-MM-DD HH:mm` 可直接按字符串比较 */
  const byTimeDesc = (a: (typeof results)[number], b: (typeof results)[number]) =>
    fmtDateTime(b.time) < fmtDateTime(a.time) ? -1 : 1;

  const resRows = results
    .filter((r) => inRange(resF, dayOf(r.time)))
    .slice()
    .sort(byTimeDesc);
  const resPages = Math.max(1, Math.ceil(resRows.length / resF.size));
  const resCur = Math.min(Math.max(1, resF.page), resPages);
  const resPage = resRows.slice((resCur - 1) * resF.size, resCur * resF.size);
  /** 尚未产出结果的检测项：合并后它们不再单独占行，这里给出计数，避免信息看着丢了 */
  const noResult = points.filter(
    (p) => !results.some((r) => r.pointId === p.id),
  ).length;

  const alarmRows = alarms.filter((a) => inRange(alarmF, dayOf(a.time)));
  const alarmPages = Math.max(1, Math.ceil(alarmRows.length / alarmF.size));
  const alarmCur = Math.min(Math.max(1, alarmF.page), alarmPages);
  const alarmPage = alarmRows.slice(
    (alarmCur - 1) * alarmF.size,
    alarmCur * alarmF.size,
  );

  /** 时间范围筛选条：两个视图同款（开始 / 结束日期 + 重置 / 查询） */
  const timeFilter = (f: ReturnType<typeof useTimePaged>) => (
    <FilterPanel
      fields={[
        { key: "from", label: "开始日期", type: "date" },
        { key: "to", label: "结束日期", type: "date" },
      ]}
      value={f.draft}
      onChange={(next) =>
        f.setDraft({ from: next.from ?? "", to: next.to ?? "" })
      }
      onSearch={() => {
        f.HF(f.draft.from);
        f.HT(f.draft.to);
        f.setPage(1);
        f.setOpen(false);
      }}
      onReset={() => {
        f.setDraft({ from: "", to: "" });
        f.HF("");
        f.HT("");
        f.setPage(1);
      }}
    />
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
      {tab === "检测结果" ? (
        <Panel
          title={`检测结果${resRows.length ? `（${resRows.length} 条）` : ""}`}
          extra={<Btn onClick={() => resF.setOpen(!resF.open)}>筛选</Btn>}
        >
          {resF.open && timeFilter(resF)}
          <Table
            heads={[
              "检测项",
              "巡检点名称",
              "观察项",
              "值 / 来源",
              "判断",
              "检测时间",
              "证据详情",
            ]}
            rows={resPage.map((r) => {
              const p = pointOfResult(r);
              return [
                p?.object || "—",
                p ? (
                  <ObjectLink type="point" id={p.id}>
                    {p.name}
                  </ObjectLink>
                ) : (
                  "—"
                ),
                p?.item || r.item,
                `${r.final} ${r.unit}`,
                <Badge>{judgeOf(r)}</Badge>,
                fmtDateTime(r.time),
                <ObjectLink type="review" id={r.id} to="result-detail" />,
              ];
            })}
          />
          {!resRows.length && (
            <Note>
              该时间段内没有检测结果
              {resF.from || resF.to ? "，可放宽时间范围或点「重置」。" : "。"}
            </Note>
          )}
          {/* 未采集过的检测项不在结果流里：单独说明，避免误以为设备没有检测项 */}
          {!!noResult && (
            <Note>
              该设备还有 <b>{noResult}</b> 个检测项尚未产生检测结果
              {resF.from || resF.to ? "（当前时间范围内）" : ""}
              。
            </Note>
          )}
          <Pager
            page={resCur}
            count={resRows.length}
            size={resF.size}
            onChange={resF.setPage}
            onSize={(n) => {
              resF.setSize(n);
              resF.setPage(1);
            }}
          />
        </Panel>
      ) : (
        <Panel
          title={`设备告警${alarmRows.length ? `（${alarmRows.length} 条）` : ""}`}
          extra={<Btn onClick={() => alarmF.setOpen(!alarmF.open)}>筛选</Btn>}
        >
          {alarmF.open && timeFilter(alarmF)}
          <Table
            heads={["告警", "状态", "发生时间", "来源任务", "处置"]}
            rows={alarmPage.map((a) => [
              a.name,
              <Badge>{a.state}</Badge>,
              fmtDateTime(a.time),
              <ObjectLink type="task-detail" id={a.taskId} />,
              <ObjectLink type="alarm" id={a.id} to="alarm-detail">
                查看详情
              </ObjectLink>,
            ])}
          />
          {!alarmRows.length && (
            <Note>
              该时间段内没有告警
              {alarmF.from || alarmF.to ? "，可放宽时间范围或点「重置」。" : "。"}
            </Note>
          )}
          <Pager
            page={alarmCur}
            count={alarmRows.length}
            size={alarmF.size}
            onChange={alarmF.setPage}
            onSize={(n) => {
              alarmF.setSize(n);
              alarmF.setPage(1);
            }}
          />
        </Panel>
      )}
    </>
  );
}
