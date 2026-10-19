/**
 * @file InterfaceLog.tsx
 * @description 接口日志：平台与外部系统 / 机器人之间的指令收发流水（下发 / 回执 / 同步），
 *   用于排查「哪条指令没收到、回执何时回来」；与其它列表页共用筛选面板 + 表格 + 分页。
 * @interaction 路由 `interface-log`（系统设置 › 系统与集成）；数据来自 state.logs
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { go, usePageSize, useViewState } from "../data/navigation";
import { Btn, Panel, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { FilterPanel } from "../components/FilterPanel";

/** 接口相关事件：同步 / 分步同步 / 指令下发 / 回执 */
const EVENTS = ["SYNC", "SYNC_STEP", "DISPATCH", "RECEIPT"] as const;

/** 事件中文名（协议里仍用英文码，页面并排显示） */
const EVENT_LABEL: Record<string, string> = {
  SYNC: "同步",
  SYNC_STEP: "分步同步",
  DISPATCH: "指令下发",
  RECEIPT: "回执",
};

/** 时间统一为 YYYY-MM-DD HH:mm:ss：缺日期按当天补，缺秒补 :00 */
function fmtTime(t: string) {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return `${today} ${t}`;
  if (/^\d{2}:\d{2}$/.test(t)) return `${today} ${t}:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t;
}

export function InterfaceLog() {
  const { s } = useStore();
  const [kw, KW] = useViewState("interface-log.query", "");
  const [event, EVENT] = useViewState("interface-log.event", "全部");
  const [page, PAGE] = useViewState("interface-log.page", 1);
  const [size, SIZE] = usePageSize("interface-log.size");
  /** 筛选面板草稿：点「查询」才写回生效值 */
  const [draft, DRAFT] = useState<Record<string, string>>({ kw, event });
  const [open, OPEN] = useState(false);

  const logs = s.logs.filter((l) => {
    if (!(EVENTS as readonly string[]).includes(l.action)) return false;
    if (event !== "全部" && l.action !== event) return false;
    const key = kw.trim();
    return !key || (l.object + l.action + l.detail).includes(key);
  });
  const pages = Math.max(1, Math.ceil(logs.length / size));
  const cur = Math.min(page, pages);
  const shown = logs.slice((cur - 1) * size, cur * size);
  const filterCount =
    (event !== "全部" ? 1 : 0) + (kw.trim() ? 1 : 0);

  return (
    <Panel
      className="panel-filters-wrap"
      title="接口日志"
      extra={
        <div className="actions">
          <Btn
            onClick={() => {
              if (!open) DRAFT({ kw, event });
              OPEN(!open);
            }}
          >
            {open ? "收起筛选" : "筛选"}
            {filterCount ? `（${filterCount}）` : ""}
          </Btn>
        </div>
      }
    >
      {open && (
        <FilterPanel
          fields={[
            {
              key: "event",
              label: "事件",
              options: [
                "全部",
                ...EVENTS.map((e) => ({
                  value: e,
                  label: `${e} · ${EVENT_LABEL[e]}`,
                })),
              ],
            },
            {
              key: "kw",
              label: "关键词",
              placeholder: "业务对象 / 详情",
            },
          ]}
          value={draft}
          onChange={(next) => DRAFT(next)}
          onSearch={() => {
            KW(draft.kw);
            EVENT(draft.event);
            PAGE(1);
            OPEN(false);
          }}
          onReset={() => {
            DRAFT({ kw: "", event: "全部" });
            KW("");
            EVENT("全部");
            PAGE(1);
          }}
        />
      )}
      <Table
        heads={["时间", "事件", "业务对象", "详情 / 反馈"]}
        rows={shown.map((l) => [
          fmtTime(l.time),
          `${l.action} · ${EVENT_LABEL[l.action] ?? ""}`,
          <button
            className="link"
            onClick={() =>
              go(s.tasks.some((t) => t.id === l.object) ? "tasks" : "maps", l.object)
            }
          >
            {l.object}
          </button>,
          l.detail,
        ])}
      />
      <Pager
        page={cur}
        count={logs.length}
        size={size}
        unit="条"
        onChange={PAGE}
        onSize={(n) => {
          SIZE(n);
          PAGE(1);
        }}
      />
    </Panel>
  );
}
