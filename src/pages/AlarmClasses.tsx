/**
 * @file AlarmClasses.tsx
 * @description 告警管理 › 告警类别：平台维护「分类名称 + 告警大类 + 是否启用」的主数据。
 *              启用的分类是「告警设置 › 告警类型」下拉与「告警记录 › 分类筛选」的数据源；
 *              被台账告警设置引用的分类不允许删除（先在告警设置里改类型）。
 * @interaction data/alarmSettings.ts（读取口径）、engine.ts（SAVE_ALARM_CLASS / REMOVE_ALARM_CLASS）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { alarmClassesOf } from "../data/alarmSettings";
import {
  ALARM_CLASS_MAINS,
  type AlarmClass,
  type AlarmClassMain,
} from "../data/types";
import { Btn, Panel, Table, Field, Badge, Modal, Note } from "../components/UI";
import { FilterPanel } from "../components/FilterPanel";
import { Pager } from "../components/Business";

/** 新建一条空白分类（「+ 添加分类」用） */
const blankClass = (): AlarmClass => ({
  id: "",
  name: "",
  main: "业务预警",
  enabled: true,
});

export function AlarmClasses() {
  const { s, act } = useStore();
  const list = alarmClassesOf(s);
  const [kw, KW] = useViewState("alarmClasses.kw", "");
  const [mainF, MF] = useViewState("alarmClasses.main", "全部");
  const [stateF, SF] = useViewState("alarmClasses.state", "全部");
  /** 告警类别筛选：复用全站 FilterPanel（草稿条件，点「查询」才生效） */
  const [acDraft, SETACDRAFT] = useState<Record<string, string>>({
    kw,
    main: mainF,
    state: stateF,
  });
  const applyACFilter = () => {
    KW(acDraft.kw ?? "");
    MF(acDraft.main ?? "全部");
    SF(acDraft.state ?? "全部");
  };
  const resetACFilter = () => {
    SETACDRAFT({ kw: "", main: "全部", state: "全部" });
    KW("");
    MF("全部");
    SF("全部");
  };
  /** 勾选的分类 ID：删除操作按勾选批量执行 */
  const [checked, SETCHECKED] = useState<string[]>([]);
  const [edit, E] = useState<AlarmClass | null>(null);
  const [delOpen, DEL] = useState(false);
  /** 筛选面板展开态：条件默认收起，点「筛选」才显示 */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  const [pn, PN] = useViewState("alarmClasses.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("alarmClasses.size");

  const keyword = kw.trim();
  const filtered = list.filter(
    (c) =>
      (mainF === "全部" || c.main === mainF) &&
      (stateF === "全部" || (stateF === "已启用" ? c.enabled : !c.enabled)) &&
      (!keyword || c.name.includes(keyword)),
  );

  // 分页切片：筛选后页数可能变少，当前页一律 clamp 到有效范围
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const toggleChecked = (id: string) =>
    SETCHECKED((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Panel
      title="告警类别"
      extra={
        <div className="actions">
          <Btn onClick={() => SETFILTEROPEN(!filterOpen)}>
            {filterOpen ? "收起筛选" : "筛选"}
          </Btn>
          <Btn primary onClick={() => E(blankClass())}>
            + 添加分类
          </Btn>
          <Btn danger disabled={!checked.length} onClick={() => DEL(true)}>
            删除
          </Btn>
        </div>
      }
    >
        {filterOpen && (
        <FilterPanel
          fields={[
            { key: "kw", label: "分类名称", placeholder: "输入分类名称" },
            { key: "main", label: "告警大类", options: ["全部", ...ALARM_CLASS_MAINS] },
            { key: "state", label: "是否启用", options: ["全部", "已启用", "已停用"] },
          ]}
          value={acDraft}
          onChange={(n) => SETACDRAFT((p) => ({ ...p, ...n }))}
          onSearch={applyACFilter}
          onReset={resetACFilter}
        />
        )}
      <Table
        heads={[
          "",
          "分类名称",
          "告警大类",
          "是否启用",
          "更新时间",
        ]}
        rows={pageRows.map((c) => [
          <input
            type="checkbox"
            aria-label={`选择 ${c.name}`}
            checked={checked.includes(c.id)}
            onChange={() => toggleChecked(c.id)}
          />,
          // 分类名称即编辑入口：点开改名称 / 大类 / 启停
          <button type="button" className="rt-link" onClick={() => E({ ...c })}>
            {c.name}
          </button>,
          <Badge tone={c.main === "机器人预警" ? "blue" : undefined}>
            {c.main}
          </Badge>,
          // 是否启用直接落库：停用后不再出现在告警设置的可选类型与告警记录筛选项里
          <button
            type="button"
            role="switch"
            aria-checked={c.enabled}
            className={"switch-btn" + (c.enabled ? " on" : "")}
            onClick={() =>
              act({
                type: "SAVE_ALARM_CLASS",
                category: { ...c, enabled: !c.enabled },
              })
            }
          >
            {c.enabled ? "是" : "否"}
          </button>,
          <span className="muted">{c.updatedAt || "—"}</span>,
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
          title={edit.id ? "编辑告警类别" : "添加分类"}
          onClose={() => E(null)}
        >
          <Field label="分类名称" required>
            <input
              value={edit.name}
              placeholder="例如 环境安全"
              onChange={(e) => E({ ...edit, name: e.target.value })}
            />
          </Field>
          <Field label="告警大类" required>
            <select
              value={edit.main}
              onChange={(e) =>
                E({ ...edit, main: e.target.value as AlarmClassMain })
              }
            >
              {ALARM_CLASS_MAINS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="是否启用">
            <input
              type="checkbox"
              checked={edit.enabled}
              onChange={(e) => E({ ...edit, enabled: e.target.checked })}
            />
          </Field>
          <div className="modal-actions">
            <Btn onClick={() => E(null)}>取消</Btn>
            <Btn
              primary
              disabled={!edit.name.trim()}
              onClick={() => {
                if (act({ type: "SAVE_ALARM_CLASS", category: edit })) E(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}
      {delOpen && (
        <Modal title="删除告警类别" onClose={() => DEL(false)}>
          <Note>将删除已勾选的 {checked.length} 个告警类别。</Note>
          <div className="modal-actions">
            <Btn onClick={() => DEL(false)}>取消</Btn>
            <Btn
              danger
              onClick={() => {
                for (const id of checked)
                  act({ type: "REMOVE_ALARM_CLASS", id });
                SETCHECKED([]);
                DEL(false);
              }}
            >
              确认删除
            </Btn>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
