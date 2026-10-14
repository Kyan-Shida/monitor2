import { SystemAlarmParameters } from "../components/SystemAlarmParameters";
import { go } from "../data/navigation";
import { useState, type ReactNode } from "react";
import { useStore } from "../data/store";
import { ALARM_LEVELS, type AlarmLevel } from "../data/types";
import { rulesOf, evaluateRule, type AlarmRule } from "../data/alarmRules";
import {
  alarmText,
  logicText,
  templatesOf,
  triggerText,
} from "../data/alarmTemplates";
import { Panel, Table, Btn, Modal, Field, Badge, Note } from "../components/UI";
function InlineEditor({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Panel title={title} extra={<Btn onClick={onClose}>收起编辑</Btn>}>
      {children}
    </Panel>
  );
}
function RuleTrial({ rule }: { rule?: AlarmRule }) {
  const [value, setValue] = useState(rule?.type === "期望状态" ? rule.expected : "0.92");
  const result = evaluateRule(rule, value);
  const isState = rule?.type === "期望状态";
  const states = Array.from(new Set([rule?.expected, "开启", "关闭"].filter((v): v is string => !!v)));
  return (
    <>
      <Field label={isState ? "模拟识别状态" : `模拟采集数值${rule?.unit ? `（${rule.unit}）` : ""}`}>
        {isState ? (
          <select aria-label="模拟识别状态" value={value} onChange={(e) => setValue(e.target.value)}>
            {states.map((state) => <option key={state} value={state}>{state}</option>)}
            <option value="">无法识别</option>
          </select>
        ) : (
          <input aria-label="模拟采集数值" type="number" step="any" placeholder="请输入采集数值" value={value} onChange={(e) => setValue(e.target.value)} />
        )}
      </Field>
      <div className="alarm-flow" role="status" aria-live="polite">
        <Badge>{!result.valid ? "待复核" : result.abnormal ? "异常 · 会触发告警" : "正常 · 不触发告警"}</Badge>
        <p>{!result.valid
          ? isState && !value && rule?.enabled ? "未识别出有效状态，需人工复核，不判定为正常或异常。" : result.reason
          : isState
            ? `模拟状态“${value}”${result.abnormal ? "与" : "符合"}期望状态“${rule?.expected}”${result.abnormal ? "不一致。" : "。"}`
            : `${result.reason}。${result.abnormal ? "采集值超出正常范围。" : "采集值在正常范围内（包含上下限）。"}`}</p>
      </div>
    </>
  );
}
export function AlarmConfiguration({
  pointId,
  embedded = false,
  readOnly = false,
}: {
  pointId?: string;
  embedded?: boolean;
  /**
   * 只读模式：点位侧（巡检点详情 / 规则查看）只能查看生效中的规则，
   * 因为**平台唯一的告警配置入口是「巡检目标台账 › 配业务逻辑与算法 › 告警设置」**
   */
  readOnly?: boolean;
}) {
  const Editor = embedded ? InlineEditor : Modal;
  const { s, act } = useStore();
  const rules = rulesOf(s).filter((r) => !pointId || r.pointId === pointId);
  const [edit, E] = useState<AlarmRule>(),
    [picked, P] = useState(rules[0]?.id);
  const rule = rules.find((r) => r.id === picked) || rules[0];
  /** 规则来源：巡检目标台账的告警设置，或历史保存的规则版本 */
  const sourceOf = (r: AlarmRule) =>
    s.alarmRules?.some((x) => x.id === r.id) ? "规则版本" : "巡检目标台账";
  return (
    <>
      <Note>
        {readOnly ? (
          <>
            <b>告警设置在台账侧统一维护</b>：「巡检目标台账 › 3、告警规则」或
            「告警管理 › 告警设置」（同一份数据），巡检点本身不配置告警。
            此处只查看该点位当前生效的判定与告警规则。
          </>
        ) : (
          <>
            检测标准与告警阈值共用此配置。每次有效结果按当时的规则版本判定；超出范围触发后进入告警事件，由人工填写处理意见。规则修改不重写历史证据。
          </>
        )}
      </Note>
      <div className="alarm-flow">
        <b>采集证据</b> → 识别为数值 / 状态 → 质量校验 → 按点位检测项规则判断 →
        异常生成告警 → 人工处理（受理 / 忽略 + 是否误报）
      </div>
      <Note>
        采集失败、无有效识别值或规则未启用，进入复核，不视为正常。数值等于上下限属于正常；状态不等于期望值触发告警。试算只验证规则，正式告警由任务执行产生。
      </Note>
      <Panel title="巡检点 · 采集结果判定规则">
        <Table
          heads={[
            "巡检点 / 检测项 / 规则",
            "触发条件",
            "等级",
            "版本 / 状态",
            "操作",
          ]}
          rows={rules.map((r) => [
            <>
              {s.points.find((p) => p.id === r.pointId)?.name}
              <small>
                {r.pointId} · {s.points.find((p) => p.id === r.pointId)?.item} ·{" "}
                {r.name}
              </small>
            </>,
            <>
              {r.type === "数值范围"
                ? `低于 ${r.min} 或高于 ${r.max} ${r.unit}`
                : `不等于 ${r.expected}`}
              {/* 触发逻辑来自后台管理的告警模板（引用关系直接写在行内，避免"改了没生效"） */}
              <small>
                触发逻辑：
                {r.triggerMode || "单次即触发"}
                {r.triggerMode === "连续确认"
                  ? `（连续 ${Math.max(2, r.consecutive || 2)} 次）`
                  : ""}
              </small>
            </>,
            r.level,
            <>
              <Badge>{r.enabled ? "启用" : "停用"}</Badge> 第 {r.version} 版
              <small>
                来源：{sourceOf(r)}
                {r.templateId ? ` · 引用模板 ${r.templateId}` : ""}
              </small>
            </>,
            readOnly ? (
              <Btn onClick={() => go("points")}>去配置告警</Btn>
            ) : (
              <Btn disabled={s.roleId !== "admin"} onClick={() => E({ ...r })}>
                配置规则
              </Btn>
            ),
          ])}
        />
      </Panel>
      <Panel title="告警规则试算 · 不产生正式告警">
        <Field label="试算规则">
          <select aria-label="试算规则" value={rule?.id || ""} onChange={(e) => P(e.target.value)}>
            {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        {rule ? <RuleTrial key={`${rule.id}-${rule.version}-${rule.type}`} rule={rule} /> : <p className="muted">暂无可试算的规则，请先配置巡检点规则。</p>}
      </Panel>
      {/* 引用方：告警模板统一在「告警管理 › 告警模板管理」维护，此处只读展示引用关系 */}
      {!pointId && (
        <Panel
          title="告警模板 · 引用自告警管理"
          extra={
            <Btn
              disabled={s.roleId !== "admin"}
              onClick={() => go("alarm-templates")}
            >
              去告警模板维护 →
            </Btn>
          }
        >
          <Table
            heads={[
              "告警模板",
              "触发条件",
              "触发逻辑",
              "声光报警",
              "默认等级",
              "处理流程",
              "状态",
            ]}
            rows={templatesOf(s).map((t) => [
              t.name,
              triggerText(t.trigger),
              logicText(t.trigger),
              alarmText(t.alarmSeconds),
              t.level,
              `${t.flow.length} 步`,
              <Badge>{t.enabled ? "启用" : "停用"}</Badge>,
            ])}
          />
          <Note>
            点位未绑「巡检目标台账 › 告警设置」时，判定规则按检测类型引用启用模板的触发条件与等级；
            规则编辑弹窗里可一键套用告警模板，套用即生成该点位规则的新版本。
          </Note>
        </Panel>
      )}
      {!pointId && <SystemAlarmParameters />}
      {!readOnly && edit && (
        <Editor title="告警规则 · 保存为新版本" onClose={() => E(undefined)}>
          <div className="form-grid">
            {/* 套用后台管理维护的告警模板：填充触发条件、等级与触发逻辑（仍保存为本站点位规则） */}
            <Field label="套用告警模板">
              <select
                value=""
                onChange={(e) => {
                  const tpl = templatesOf(s).find((x) => x.id === e.target.value);
                  if (!tpl) return;
                  E({
                    ...edit,
                    name: tpl.name,
                    type: tpl.trigger.type,
                    unit: tpl.trigger.unit || edit.unit,
                    min: tpl.trigger.min,
                    max: tpl.trigger.max,
                    expected: tpl.trigger.expected || edit.expected,
                    level: tpl.level,
                    templateId: tpl.id,
                    triggerMode: tpl.trigger.mode,
                    consecutive: tpl.trigger.consecutive,
                  });
                }}
              >
                <option value="">不套用 · 手动填写</option>
                {templatesOf(s)
                  .filter((t) => t.enabled)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}（{t.level} · {logicText(t.trigger)}）
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="名称">
              <input
                value={edit.name}
                onChange={(e) => E({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field label="类型">
              <select
                value={edit.type}
                onChange={(e) =>
                  E({ ...edit, type: e.target.value as AlarmRule["type"] })
                }
              >
                <option>数值范围</option>
                <option>期望状态</option>
              </select>
            </Field>
            {edit.type === "数值范围" ? (
              <>
                <Field label="下限（含）">
                  <input
                    type="number"
                    value={edit.min}
                    onChange={(e) => E({ ...edit, min: +e.target.value })}
                  />
                </Field>
                <Field label="上限（含）">
                  <input
                    type="number"
                    value={edit.max}
                    onChange={(e) => E({ ...edit, max: +e.target.value })}
                  />
                </Field>
                <Field label="单位（来自检测项）">
                  <input readOnly value={edit.unit} />
                </Field>
              </>
            ) : (
              <Field label="期望状态">
                <input
                  value={edit.expected}
                  onChange={(e) => E({ ...edit, expected: e.target.value })}
                />
              </Field>
            )}
            <Field label="告警等级">
              <select
                value={edit.level}
                onChange={(e) =>
                  E({ ...edit, level: e.target.value as AlarmLevel })
                }
              >
                {ALARM_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            {/* 触发逻辑：识别即触发 / 连续确认（连续 N 次命中才告警），随规则版本落库，采集时按此判定 */}
            <Field label="触发逻辑">
              <select
                value={edit.triggerMode || "单次即触发"}
                onChange={(e) =>
                  E({
                    ...edit,
                    triggerMode: e.target.value as AlarmRule["triggerMode"],
                  })
                }
              >
                <option value="单次即触发">识别即触发（本次识别到异常就告警）</option>
                <option value="连续确认">连续确认（连续 N 次异常才告警）</option>
              </select>
            </Field>
            {edit.triggerMode === "连续确认" && (
              <Field label="连续确认次数">
                <input
                  type="number"
                  min={2}
                  value={edit.consecutive || 2}
                  onChange={(e) =>
                    E({ ...edit, consecutive: Math.max(2, +e.target.value) })
                  }
                />
              </Field>
            )}
            <Field label="启用">
              <input
                type="checkbox"
                checked={edit.enabled}
                onChange={(e) => E({ ...edit, enabled: e.target.checked })}
              />
            </Field>
          </div>
          {edit.templateId && (
            <Note>
              引用模板 {edit.templateId}，处置流程：
              {(
                templatesOf(s).find((t) => t.id === edit.templateId)?.flow || []
              ).join(" → ") || "—"}
            </Note>
          )}
          <div className="modal-actions">
            <Btn onClick={() => E(undefined)}>取消</Btn>
            <Btn
              primary
              onClick={() => {
                if (act({ type: "SAVE_ALARM_RULE", rule: edit })) E(undefined);
              }}
            >
              保存规则版本
            </Btn>
          </div>
        </Editor>
      )}
    </>
  );
}
