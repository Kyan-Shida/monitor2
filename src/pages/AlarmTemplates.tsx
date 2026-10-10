/**
 * @file AlarmTemplates.tsx
 * @description 后台管理 › 告警模板管理：平台维护「告警触发逻辑」的唯一入口
 *              · 告警模板：把常用告警规则存为模板（名称、触发条件、处理流程）；
 *              · 告警规则库：新增 / 修改告警规则（名称、级别、类型、阈值、触发条件）；
 *              · 引用位置：模板与规则被哪些页面引用，改了会影响哪里。
 * @interaction 路由 `alarm-templates`（后台管理）；引擎动作 SAVE_ALARM_TEMPLATE / SAVE_ALARM_RULE_LIB；
 *              数据 data/alarmTemplates.ts；引用方「采集结果与告警规则」「巡检目标台账」「告警处置」
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Badge, Btn, Field, Modal, Note, Panel, Table } from "../components/UI";
import { ALARM_LEVELS, type AlarmLevel } from "../data/types";
import {
  APPLY_KINDS,
  logicText,
  templateRefCountOf,
  templatesOf,
  triggerText,
  type AlarmTemplate,
  type AlarmTrigger,
} from "../data/alarmTemplates";
import { rulesOf } from "../data/alarmRules";

/** 新模板 / 新规则的触发条件初值 */
const emptyTrigger = (): AlarmTrigger => ({
  type: "数值范围",
  unit: "",
  min: 0,
  max: 1,
  expected: "开启",
  mode: "单次即触发",
  consecutive: 2,
});
/**
 * 触发条件表单（模板与规则共用）
 * @description 类型 / 阈值 / 期望状态 / 触发逻辑（单次即触发 · 连续确认）四处即全部触发口径，
 *              保存后由点位规则引用生效，不在此页另立一份判定逻辑
 * @param value 当前草稿
 * @param onChange 草稿变更回调
 */
function TriggerFields({
  value,
  onChange,
}: {
  value: AlarmTrigger;
  onChange: (t: AlarmTrigger) => void;
}) {
  return (
    <>
      <Field label="类型">
        <select
          value={value.type}
          onChange={(e) =>
            onChange({ ...value, type: e.target.value as AlarmTrigger["type"] })
          }
        >
          <option>数值范围</option>
          <option>期望状态</option>
        </select>
      </Field>
      {value.type === "数值范围" ? (
        <>
          <Field label="下限（含）">
            <input
              type="number"
              step="any"
              value={value.min}
              onChange={(e) => onChange({ ...value, min: +e.target.value })}
            />
          </Field>
          <Field label="上限（含）">
            <input
              type="number"
              step="any"
              value={value.max}
              onChange={(e) => onChange({ ...value, max: +e.target.value })}
            />
          </Field>
          <Field label="单位">
            <input
              value={value.unit}
              placeholder="如 MPa / ℃ / %LEL"
              onChange={(e) => onChange({ ...value, unit: e.target.value })}
            />
          </Field>
        </>
      ) : (
        <Field label="期望状态">
          <input
            value={value.expected}
            placeholder="如 开启"
            onChange={(e) => onChange({ ...value, expected: e.target.value })}
          />
        </Field>
      )}
      {/*
        触发逻辑 = 判定命中后「什么时候」生成告警，两种：
        · 识别即触发：本次识别到超限 / 状态不符就告警（默认，即"单次异常即告警"）
        · 连续确认：连续 N 次都命中才告警，用来抑制工况抖动造成的误报
      */}
      <Field label="触发逻辑">
        <select
          value={value.mode}
          onChange={(e) =>
            onChange({ ...value, mode: e.target.value as AlarmTrigger["mode"] })
          }
        >
          <option value="单次即触发">识别即触发（本次识别到异常就告警）</option>
          <option value="连续确认">连续确认（连续 N 次异常才告警）</option>
        </select>
      </Field>
      {value.mode === "连续确认" && (
        <Field label="连续确认次数">
          <input
            type="number"
            min={2}
            value={value.consecutive}
            onChange={(e) =>
              onChange({ ...value, consecutive: Math.max(2, +e.target.value) })
            }
          />
        </Field>
      )}
      <p className="muted">
        触发逻辑说的是"什么时候算触发"：判定命中即告警（识别即触发），或连续 N 次命中才告警（连续确认）。
        本模板当前的触发逻辑：{logicText(value)}
      </p>
    </>
  );
}
export function AlarmTemplates() {
  const { s, act } = useStore();
  const templates = templatesOf(s);
  const [tpl, SETTPL] = useState<AlarmTemplate | null>(null);
  /**
   * 模板被引用的处数 = 巡检目标台账（按 alarm.templateId）+ 点位判定规则（按 rule.templateId）
   * @description 模板与规则库合并后，「谁在引用」是判断改动影响面的唯一依据
   */
  const refsOf = (id: string) =>
    templateRefCountOf(s, id) +
    rulesOf(s).filter((r) => r.templateId === id).length;
  return (
    <>
      <Note>
        这里是平台配置<strong>告警触发逻辑</strong>的唯一入口：一条
        <strong>告警模板</strong>
        就包含触发条件（类型 / 阈值 / 期望状态）、触发逻辑（单次 / 连续确认）、声光报警时长、默认等级与处理流程
        —— 原「告警规则库」已并入本页（它的级别 / 类型 / 阈值 / 触发条件都是模板字段）。
        巡检目标台账、点位判定规则与告警处置页都<strong>引用</strong>
        此处配置；历史结果与已生成告警保留当时的快照，不会被改写。
      </Note>
      <Panel
        title="告警模板 · 触发条件 + 触发逻辑 + 声光报警 + 等级 + 处理流程"
        extra={
          <Btn
            primary
            disabled={s.roleId !== "admin"}
            onClick={() =>
              SETTPL({
                id: "",
                name: "",
                kinds: ["压力"],
                trigger: emptyTrigger(),
                level: "二级",
                flow: [""],
                alarmSeconds: 10,
                enabled: true,
                version: 0,
                updatedAt: "",
              })
            }
          >
            ＋ 新增告警模板
          </Btn>
        }
      >
        <Table
          heads={[
            "模板名称 / 适用检测类型",
            "触发条件",
            "触发逻辑",
            "声光报警",
            "默认等级",
            "处理流程",
            "状态 / 更新时间",
            "操作",
          ]}
          rows={templates.map((t) => [
            <>
              {t.name}
              <small>
                {t.kinds.join(" / ")} · 被引用 {refsOf(t.id)} 处
              </small>
            </>,
            triggerText(t.trigger),
            logicText(t.trigger),
            t.alarmSeconds ? `${t.alarmSeconds} 秒` : "不启用",
            <Badge tone={t.level === "一级" ? "red" : "amber"}>{t.level}</Badge>,
            <>
              {t.flow.length} 步
              <small title={t.flow.join("\n")}>第 1 步：{t.flow[0]}</small>
            </>,
            <>
              <Badge>{t.enabled ? "启用" : "停用"}</Badge>
              <small>更新时间 {t.updatedAt || "—"}</small>
            </>,
            <>
              <Btn
                disabled={s.roleId !== "admin"}
                onClick={() => SETTPL({ ...t })}
              >
                修改
              </Btn>
              <Btn
                disabled={s.roleId !== "admin"}
                onClick={() =>
                  act({
                    type: "SAVE_ALARM_TEMPLATE",
                    template: { ...t, enabled: !t.enabled },
                  })
                }
              >
                {t.enabled ? "停用" : "启用"}
              </Btn>
            </>,
          ])}
        />
        <p className="muted">
          停用模板 = 该检测类型不再自动套用（点位规则退回"未配置告警"，只记录结果不判定）。
          保存后立即生效；历史结果与已生成告警保留当时的规则快照，不会被改写。
        </p>
      </Panel>

      {tpl && (
        <Modal
          title={tpl.id ? "修改告警模板" : "新增告警模板"}
          wide
          onClose={() => SETTPL(null)}
        >
          <div className="form-grid">
            <Field label="告警模板名称">
              <input
                value={tpl.name}
                placeholder="如 压力超限告警"
                onChange={(e) => SETTPL({ ...tpl, name: e.target.value })}
              />
            </Field>
            <Field label="默认告警等级">
              <select
                value={tpl.level}
                onChange={(e) =>
                  SETTPL({ ...tpl, level: e.target.value as AlarmLevel })
                }
              >
                {ALARM_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <TriggerFields
              value={tpl.trigger}
              onChange={(trigger) => SETTPL({ ...tpl, trigger })}
            />
          </div>
          <Field label="适用检测类型（可多选）">
            <div className="check-row">
              {APPLY_KINDS.map((k) => (
                <label key={k}>
                  <input
                    type="checkbox"
                    checked={tpl.kinds.includes(k)}
                    onChange={(e) =>
                      SETTPL({
                        ...tpl,
                        kinds: e.target.checked
                          ? [...tpl.kinds, k]
                          : tpl.kinds.filter((x) => x !== k),
                      })
                    }
                  />
                  {k}
                </label>
              ))}
            </div>
          </Field>
          <Field label="处理流程（每行一个步骤，按顺序执行）">
            <textarea
              rows={5}
              value={tpl.flow.join("\n")}
              placeholder={"核对读数与识别值是否一致\n对照工艺卡片确认工况\n通知值班长并转现场处置"}
              onChange={(e) => SETTPL({ ...tpl, flow: e.target.value.split("\n") })}
            />
          </Field>
          {/* 声光报警时长：随告警下发到执行端 / 现场；0 = 不启动声光报警 */}
          <Field label="声光报警（秒）">
            <input
              type="number"
              min={0}
              value={tpl.alarmSeconds}
              placeholder="0 表示不启动声光报警"
              onChange={(e) =>
                SETTPL({ ...tpl, alarmSeconds: Math.max(0, +e.target.value) })
              }
            />
          </Field>
          <p className="muted">
            声光报警时长随告警一起下发到执行端 / 现场控制器：告警触发时按此秒数启动声光报警，
            0 表示不启动；处置页与告警记录都按此口径展示。
          </p>
          <Field label="启用">
            <input
              type="checkbox"
              checked={tpl.enabled}
              onChange={(e) => SETTPL({ ...tpl, enabled: e.target.checked })}
            />
          </Field>
          <div className="modal-actions">
            <Btn onClick={() => SETTPL(null)}>取消</Btn>
            <Btn
              primary
              onClick={() => {
                if (act({ type: "SAVE_ALARM_TEMPLATE", template: tpl }))
                  SETTPL(null);
              }}
            >
              保存告警模板
            </Btn>
          </div>
        </Modal>
      )}

    </>
  );
}
