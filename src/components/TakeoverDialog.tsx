import { TakeoverOutcome } from "./TakeoverOutcome";
/**
 * @file TakeoverDialog.tsx
 * @description 调度指挥驾驶舱的「接管会话」弹窗：就地走完 申请接管 → 暂停确认 → 人工遥控 → 退出 / 释放并恢复，
 *              不再跳到「人工操作与遥控」页（跳页会丢失当前选中设备与三栏上下文）
 * @interaction DispatchCockpit.tsx「当前设备」卡的「申请接管 / 接管会话」按钮
 * @note 形态取舍：曾试右侧抽屉，但大屏里抽屉的高度与底栏贴底依赖 .modal-body 的 flex 拉伸，
 *       在大屏 grid 容器内表现不稳（底栏停在内容之后、下方留白），因此改用居中弹窗 + 流内动作条
 * @note 状态机口径与 pages/Execution.tsx 的 ControlConsole 完全一致（TAKEOVER / CONTROL_ACK / CONTROL_EXIT /
 *       CONTROL_RELEASE / START），不另造流程；区别只有两点：① 会话用宽口径查找（含「待暂停确认 / 退出核对中」，
 *       否则"确认机器人已暂停"的入口出不来）② 恢复任务留在本页，不跳执行监控
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Badge, Btn, Modal, Note, Steps } from "./UI";
import { Can } from "./Can";
import { PERMS } from "../data/roles";

/** 接管须知：均为系统真实约束（engine 的会话校验），不是泛泛提示 */
const NOTES = [
  "接管期间该机器人暂停自主任务，控制权独占且有时效；",
  "离线设备不可申请接管，低电量设备会被执行约束拦截；",
  "退出接管后机器人保持暂停，需确认现场安全再释放控制权；",
  "释放后若原地有暂停任务，需明确恢复，否则不会自动继续。",
];

export function TakeoverDialog({
  robotId,
  onClose,
  onOpenConsole,
  onResume,
}: {
  /** 接管对象 */
  robotId: string;
  onClose: () => void;
  /** 次级入口：需要地图 / 视频 / 遥控回执等完整能力时，再进「人工操作与遥控」页 */
  onOpenConsole: () => void;
  /** 释放控制权后原地有暂停任务时，明确恢复该任务（留在本页，不跳页） */
  onResume: (taskId: string) => void;
}) {
  const { s, act } = useStore();
  const r = s.robots.find((x) => x.id === robotId)!;
  /** 在用会话：宽口径（含待暂停确认 / 退出核对中），与 ControlConsole 一致 */
  const x = s.sessions.find(
    (y) => y.robotId === r.id && !["已释放", "已超时"].includes(y.state),
  );
  const t = s.tasks.find((y) => y.id === r.current);
  /** 释放前的人工核对勾选：引擎要求 checked 为真才允许释放 */
  const [checked, C] = useState(false);
  const current = x
    ? x.state === "待暂停确认"
      ? 1
      : x.state === "已接管"
        ? 2
        : 3
    : 0;
  const until = new Date(x?.expires ?? 0).toLocaleTimeString("zh-CN", {
    hour12: false,
  });
  return (
    <Modal
      title={`接管会话 · ${r.id} ${r.name}`}
      onClose={onClose}
    >
      <div className="peek-head">
        <b>{r.name}</b>
        <Badge>{x ? x.state : "未接管"}</Badge>
        <span className="muted">
          {r.deviceType} · {r.region} · 电量 {r.battery}%
        </span>
      </div>
      <Steps
        items={["申请接管", "暂停确认", "人工遥控", "释放并恢复"]}
        current={current}
      />

      {!x && (
        <Note>
          接管后该机器人会暂停自主任务，控制权独占且有时效；现场确认机器人已停止后即可开始人工遥控。
        </Note>
      )}
      {x?.state === "待暂停确认" && (
        <Note>
          接管申请已提交，机器人正在暂停当前任务。请现场确认机器人已停止，再点下方按钮取得控制权。
        </Note>
      )}
      {x?.state === "已接管" && (
        <Note>
          已接管（会话 {x.id}，至 {until} 到期）。可直接在驾驶舱用「机器人导航 / 云台控制 /
          镜头调控 / 声光 · 语音」下发指令。
        </Note>
      )}
      {x?.state === "退出核对中" && (
        <Note>已退出人工接管，机器人保持暂停状态。确认现场安全后再释放控制权。</Note>
      )}
      {!x && t?.state === "暂停" && (
        <Note>
          该机器人上仍有暂停任务「{t.name}」，控制权释放后需明确恢复，否则不会自动继续。
        </Note>
      )}
      {x?.state === "退出核对中" && (
        <label className="takeover-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => C(e.target.checked)}
          />
          已确认现场安全，可释放控制权
        </label>
      )}

      {!x && (
        <>
          <h4 className="peek-title">接管须知</h4>
          <ul className="takeover-notes">
            {NOTES.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      )}

      <TakeoverOutcome robotId={r.id} />
      {/* 动作条随会话状态变化，始终保持"取消在左、主动作在右" */}
      <div className="modal-actions">
        <Btn onClick={onClose}>{x ? "关闭" : "取消"}</Btn>
        {!x && (
          <Can perm={PERMS.接管申请}>
            <Btn
              primary
              disabled={r.state === "离线"}
              onClick={() => act({ type: "TAKEOVER", robotId: r.id })}
            >
              {r.state === "离线" ? "设备离线，不可接管" : "申请接管"}
            </Btn>
          </Can>
        )}
        {x?.state === "待暂停确认" && (
          <Btn primary onClick={() => act({ type: "CONTROL_ACK", id: x.id })}>
            确认机器人已暂停
          </Btn>
        )}
        {x?.state === "已接管" && (
          <>
            <Btn onClick={onOpenConsole}>进入完整操控台 →</Btn>
            <Btn primary onClick={() => act({ type: "CONTROL_EXIT", id: x.id })}>
              退出人工接管
            </Btn>
          </>
        )}
        {x?.state === "退出核对中" && (
          <Btn
            primary
            disabled={!checked}
            onClick={() => act({ type: "CONTROL_RELEASE", id: x.id, checked })}
          >
            释放控制权
          </Btn>
        )}
        {!x && t?.state === "暂停" && (
          <Btn primary onClick={() => onResume(t.id)}>
            明确恢复任务
          </Btn>
        )}
      </div>
    </Modal>
  );
}
