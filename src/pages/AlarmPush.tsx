/**
 * @file AlarmPush.tsx
 * @description 告警管理 › 告警推送：维护「哪些告警推送给谁」的人员名单。
 *              等级留空 = 接收全部等级；区域 / 设备两个绑定维度留空 = 不限该维度；
 *              推送通道按登录名定位账号、短信按手机号下发。
 * @interaction data/types.ts（AlarmPushStaff）、data/alarmPush.ts（选项与匹配口径）、
 *              engine.ts（SAVE_ALARM_PUSH / REMOVE_ALARM_PUSH）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { ALARM_LEVELS, type AlarmLevel, type AlarmPushStaff } from "../data/types";
import {
  areaScopeOptionsOf,
  deviceScopeOptionsOf,
  pushScopeLabel,
} from "../data/alarmPush";
import {
  Badge,
  Btn,
  Field,
  Modal,
  MultiSelect,
  Panel,
  Table,
} from "../components/UI";
import { FilterPanel } from "../components/FilterPanel";
import { Pager } from "../components/Business";

/** 新建一条空白名单（「+ 添加推送人员」用） */
const blankStaff = (): AlarmPushStaff => ({
  id: "",
  name: "",
  phone: "",
  login: "",
  dept: "",
  levels: [],
  areas: [],
  devices: [],
  sms: true,
});

export function AlarmPush() {
  const { s, act } = useStore();
  const list = s.alarmPushStaff || [];
  const [kw, KW] = useViewState("alarmPush.kw", "");
  const [lvF, LF] = useViewState("alarmPush.level", "全部");
  const [pn, PN] = useViewState("alarmPush.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("alarmPush.size");
  /** 告警推送筛选：复用全站 FilterPanel（草稿条件，点「查询」才生效） */
  const [pushDraft, SETPUSHDRAFT] = useState<Record<string, string>>({
    kw,
    level: lvF,
  });
  const applyPushFilter = () => {
    KW(pushDraft.kw ?? "");
    LF(pushDraft.level ?? "全部");
  };
  const resetPushFilter = () => {
    SETPUSHDRAFT({ kw: "", level: "全部" });
    KW("");
    LF("全部");
  };
  /** 筛选面板展开态：条件默认收起，点「筛选」才显示 */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  const [checked, SETCHECKED] = useState<string[]>([]);
  const [edit, E] = useState<AlarmPushStaff | null>(null);
  /** 绑定范围可选项：区域（主数据 ∪ 设备归属）/ 设备（设备台账） */
  const areaOptions = areaScopeOptionsOf(s);
  const deviceOptions = deviceScopeOptionsOf(s);

  /** 筛选：关键词（姓名 / 登录名 / 手机号 / 部门）+ 接收等级 */
  const keyword = kw.trim();
  const filtered = list.filter(
    (p) =>
      (lvF === "全部" || !p.levels.length || p.levels.includes(lvF as AlarmLevel)) &&
      (!keyword ||
        [p.name, p.login, p.phone, p.dept].join(" ").includes(keyword)),
  );
  // 分页切片：筛选后页数可能变少，当前页一律 clamp 到有效范围
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const toggleChecked = (id: string) =>
    SETCHECKED((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleLevel = (lv: AlarmLevel) =>
    edit &&
    E({
      ...edit,
      levels: edit.levels.includes(lv)
        ? edit.levels.filter((x) => x !== lv)
        : [...edit.levels, lv],
    });


  return (
    <Panel
      title="告警推送"
      extra={
        <div className="actions">
          <Btn onClick={() => SETFILTEROPEN(!filterOpen)}>
            {filterOpen ? "收起筛选" : "筛选"}
          </Btn>
          <Btn primary onClick={() => E(blankStaff())}>
            + 添加推送人员
          </Btn>
          <Btn
            danger
            disabled={!checked.length}
            onClick={() => {
              for (const id of checked) act({ type: "REMOVE_ALARM_PUSH", id });
              SETCHECKED([]);
            }}
          >
            删除
          </Btn>
        </div>
      }
    >
        {filterOpen && (
        <FilterPanel
          fields={[
            { key: "kw", label: "姓名 / 登录名 / 手机号", placeholder: "输入姓名、登录名或手机号" },
            { key: "level", label: "接收等级", options: ["全部", ...ALARM_LEVELS] },
          ]}
          value={pushDraft}
          onChange={(n) => SETPUSHDRAFT((p) => ({ ...p, ...n }))}
          onSearch={applyPushFilter}
          onReset={resetPushFilter}
        />
        )}
      <Table
        heads={[
          "",
          "姓名",
          "手机号",
          "用户登录名",
          "所属部门",
          "告警等级",
          "推送范围",
          "是否发送短信",
          "最后更新人",
          "更新时间",
        ]}
        rows={pageRows.map((p) => [
          <input
            type="checkbox"
            aria-label={`选择 ${p.name}`}
            checked={checked.includes(p.id)}
            onChange={() => toggleChecked(p.id)}
          />,
          // 姓名即编辑入口
          <button type="button" className="rt-link" onClick={() => E({ ...p })}>
            {p.name}
          </button>,
          p.phone,
          p.login,
          p.dept || "—",
          // 等级留空 = 接收全部等级
          p.levels.length
            ? p.levels.join(" / ")
            : <Badge tone="blue">全部等级</Badge>,
          // 未绑定任何维度 = 全部范围
          <span className="muted">{pushScopeLabel(p)}</span>,
          p.sms ? "是" : "否",
          p.updatedBy || "—",
          <span className="muted">{p.updatedAt || "—"}</span>,
        ])}
      />
      <Pager
        page={cur}
        count={filtered.length}
        size={pageSize}
        onChange={PN}
        onSize={(n) => {
          SETPAGESIZE(n);
          PN(1);
        }}
      />
      {edit && (
        <Modal
          title={edit.id ? "编辑推送人员" : "添加推送人员"}
          onClose={() => E(null)}
          footer={
            <div className="actions">
              <Btn
                primary
                disabled={!edit.name.trim() || !edit.login.trim() || !edit.phone.trim()}
                onClick={() => {
                  if (act({ type: "SAVE_ALARM_PUSH", staff: edit })) E(null);
                }}
              >
                保存
              </Btn>
              <Btn onClick={() => E(null)}>关闭</Btn>
            </div>
          }
        >
          <Field label="姓名" required>
            <input
              value={edit.name}
              placeholder="请输入姓名"
              onChange={(e) => E({ ...edit, name: e.target.value })}
            />
          </Field>
          <Field label="手机号" required>
            <input
              value={edit.phone}
              placeholder="短信接收手机号"
              onChange={(e) => E({ ...edit, phone: e.target.value })}
            />
          </Field>
          <Field label="用户登录名" required>
            <input
              value={edit.login}
              placeholder="推送通道按登录名定位账号"
              onChange={(e) => E({ ...edit, login: e.target.value })}
            />
          </Field>
          <Field label="所属部门">
            <input
              value={edit.dept}
              placeholder="例如 设备管理部"
              onChange={(e) => E({ ...edit, dept: e.target.value })}
            />
          </Field>
          <Field label="告警等级" required>
            <div className="radio-row">
              {ALARM_LEVELS.map((lv) => (
                <label key={lv}>
                  <input
                    type="checkbox"
                    checked={edit.levels.includes(lv)}
                    onChange={() => toggleLevel(lv)}
                  />
                  {lv}
                </label>
              ))}
            </div>
          </Field>
          {/* 绑定范围：选中即限定到该维度，不选 = 不限（与等级留空 = 全部等级同一口径）；
              候选值实时取自后台主数据 —— 区域配置 / 设备台账 */}
          <Field label="绑定范围 · 区域">
            <MultiSelect
              options={areaOptions}
              value={edit.areas || []}
              onChange={(v) => E({ ...edit, areas: v })}
            />
          </Field>
          <Field label="绑定范围 · 设备">
            <MultiSelect
              options={deviceOptions}
              value={edit.devices || []}
              onChange={(v) => E({ ...edit, devices: v })}
            />
          </Field>
          <Field label="是否发送短信" required>
            <input
              type="checkbox"
              checked={edit.sms}
              onChange={(e) => E({ ...edit, sms: e.target.checked })}
            />
          </Field>
        </Modal>
      )}
    </Panel>
  );
}
