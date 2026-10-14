/**
 * @file AlarmClasses.tsx
 * @description 告警管理 › 告警类别：平台维护「分类名称 + 告警大类 + 是否启用」的主数据。
 *              启用的分类是「告警设置 › 告警类型」下拉与「告警记录 › 分类筛选」的数据源；
 *              被台账告警设置引用的分类不允许删除（先在告警设置里改类型）。
 * @interaction data/alarmSettings.ts（读取口径）、engine.ts（SAVE_ALARM_CLASS / REMOVE_ALARM_CLASS）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { useViewState } from "../data/navigation";
import { alarmClassesOf } from "../data/alarmSettings";
import {
  ALARM_CLASS_MAINS,
  type AlarmClass,
  type AlarmClassMain,
} from "../data/types";
import { Btn, Panel, Table, Field, Badge, Modal, Note } from "../components/UI";

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
  /** 勾选的分类 ID：删除操作按勾选批量执行 */
  const [checked, SETCHECKED] = useState<string[]>([]);
  const [edit, E] = useState<AlarmClass | null>(null);
  const [delOpen, DEL] = useState(false);

  const keyword = kw.trim();
  const filtered = list.filter(
    (c) =>
      (mainF === "全部" || c.main === mainF) &&
      (stateF === "全部" || (stateF === "已启用" ? c.enabled : !c.enabled)) &&
      (!keyword || c.name.includes(keyword)),
  );
  const toggleChecked = (id: string) =>
    SETCHECKED((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <Panel
      title="告警类别"
      extra={
        <div className="actions">
          <Btn primary onClick={() => E(blankClass())}>
            + 添加分类
          </Btn>
          <Btn danger disabled={!checked.length} onClick={() => DEL(true)}>
            删除
          </Btn>
        </div>
      }
    >
      <div className="filter-bar">
        <Field label="分类名称">
          <input
            value={kw}
            onChange={(e) => KW(e.target.value)}
            placeholder="输入分类名称"
          />
        </Field>
        <Field label="告警大类">
          <select value={mainF} onChange={(e) => MF(e.target.value)}>
            {["全部", ...ALARM_CLASS_MAINS].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="是否启用">
          <select value={stateF} onChange={(e) => SF(e.target.value)}>
            {["全部", "已启用", "已停用"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Btn
          onClick={() => {
            KW("");
            MF("全部");
            SF("全部");
          }}
        >
          重置筛选
        </Btn>
      </div>
      <Table
        heads={[
          "",
          "分类名称",
          "告警大类",
          "是否启用",
          "更新时间",
        ]}
        rows={filtered.map((c) => [
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
      {edit && (
        <Modal
          title={edit.id ? "编辑告警类别" : "添加分类"}
          onClose={() => E(null)}
        >
          <Field label="分类名称">
            <input
              value={edit.name}
              placeholder="例如 环境安全"
              onChange={(e) => E({ ...edit, name: e.target.value })}
            />
          </Field>
          <Field label="告警大类">
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
