import { SystemAlarmParameters } from "../components/SystemAlarmParameters";
import { go } from "../data/navigation";
import { useState, type ReactNode } from "react";
import { useStore } from "../data/store";
import { rulesOf, evaluateRule, type AlarmRule } from "../data/alarmRules";
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
            <b>告警设置只有一处入口</b>：「巡检目标台账 › 配业务逻辑与算法 › 告警设置」
            （告警开关 + 等级 + 通知），巡检点本身不配置告警。此处只查看该点位当前生效的判定与告警规则。
          </>
        ) : (
          <>
            检测标准与告警阈值共用此配置。每次有效结果按当时的规则版本判定；超出范围触发，正常复查结果恢复，人工填写依据后关闭。规则修改不重写历史证据。
          </>
        )}
      </Note>
      <div className="alarm-flow">
        <b>采集证据</b> → 识别为数值 / 状态 → 质量校验 → 按点位检测项规则判断 →
        异常生成告警 → 复查恢复 → 人工关闭
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
            r.type === "数值范围"
              ? `低于 ${r.min} 或高于 ${r.max} ${r.unit}`
              : `不等于 ${r.expected}`,
            r.level,
            <>
              <Badge>{r.enabled ? "启用" : "停用"}</Badge> v{r.version}
              <small>来源：{sourceOf(r)}</small>
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
        <p className="muted">这里只预览规则的判断结果，不会创建告警或修改任务数据。</p>
        <details>
          <summary>正式告警如何产生和恢复？</summary>
          <p className="muted">每次收到有效采集结果，按规则判断一次。同一点位重复出现的同类异常合并到未关闭的告警；处理后需复查结果正常，才能标记恢复，再由人工确认关闭。</p>
          <p className="muted">一期暂不支持“持续异常一段时间”或“连续异常多次”才告警。</p>
        </details>
      </Panel>
      {!pointId && <SystemAlarmParameters />}
      {!readOnly && edit && (
        <Editor title="告警规则 · 保存为新版本" onClose={() => E(undefined)}>
          <div className="form-grid">
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
                onChange={(e) => E({ ...edit, level: e.target.value })}
              >
                {["一般", "重要", "紧急"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="启用">
              <input
                type="checkbox"
                checked={edit.enabled}
                onChange={(e) => E({ ...edit, enabled: e.target.checked })}
              />
            </Field>
          </div>
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
