import type { State } from "./types";
import { releaseOutputs } from "./fieldControl";
import { constraints, transition } from "./engine";
import { planOccurrences } from "./planSchedule";
/** Browser-hosted scheduler: fixed Asia/Shanghai business clock; no catch-up flood. */
export function advanceAutomation(state: State, now = Date.now()): State {
  let s = state;
  if (
    s.sessions.some(
      (x) => !["已释放", "已超时"].includes(x.state) && x.expires <= now,
    )
  ) {
    s = structuredClone(s);
    for (const x of s.sessions.filter(
      (x) => !["已释放", "已超时"].includes(x.state) && x.expires <= now,
    )) {
      x.state = "已超时";
      const r = s.robots.find((r) => r.id === x.robotId);
      if (r?.state === "人工接管") r.state = "暂停";
    }
    releaseOutputs(s);
  }
  const apply = (a: Record<string, unknown> & { type: string }) => {
    s = transition(s, { ...a, now });
  };
  for (const plan of [...s.plans]) {
    if (plan.state !== "启用" || !plan.robotId) continue;
    const slot = planOccurrences(plan, now)
      .filter(
        (t) =>
          t <= now + plan.advance * 60000 &&
          t >= now - Math.max(plan.wait, 1) * 60000,
      )
      .sort((a, b) => a - b)[0];
    if (
      slot === undefined ||
      s.tasks.some(
        (t) => t.planId === plan.id && t.scheduleKey === String(slot),
      )
    )
      continue;
    try {
      apply({
        type: "GENERATE",
        id: plan.id,
        scheduledAt: new Date(slot).toISOString(),
      });
    } catch (e) {
      const reason = (e as Error).message;
      if (s.plans.find((p) => p.id === plan.id)?.generationError !== reason) {
        s = structuredClone(s);
        s.plans.find((p) => p.id === plan.id)!.generationError = reason;
      }
    }
  }
  for (const snapshot of [...s.tasks]) {
    if (
      !snapshot.autoRun ||
      !snapshot.robotId ||
      !["已分配", "下发中", "待执行", "执行中"].includes(snapshot.state)
    )
      continue;
    const t = s.tasks.find((t) => t.id === snapshot.id)!;
    const r = s.robots.find((r) => r.id === t.robotId);
    if (!r) continue;
    const reason = constraints(s, t, r, false, now).join("；");
    if (
      t.state !== "执行中" &&
      t.state !== "下发中" &&
      t.notBefore &&
      now > Date.parse(t.notBefore) + (t.allowedWait ?? 30) * 60000
    ) {
      apply({ type: "AUTO_EXPIRE", id: t.id });
      continue;
    }
    if (reason) {
      if (t.blockedReason !== reason) {
        s = structuredClone(s);
        s.tasks.find((x) => x.id === t.id)!.blockedReason = reason;
      }
      continue;
    }
    if (t.blockedReason) {
      s = structuredClone(s);
      s.tasks.find((x) => x.id === t.id)!.blockedReason = undefined;
    }
    try {
      if (t.state === "已分配") apply({ type: "DISPATCH", id: t.id });
      else if (t.state === "下发中") apply({ type: "RECEIPT", id: t.id });
      else if (
        t.state === "待执行" &&
        !constraints(s, t, r, true, now).length
      ) {
        const head = s.tasks.find(
          (x) =>
            x.robotId === r.id &&
            x.state === "待执行" &&
            (!x.notBefore || Date.parse(x.notBefore) <= now),
        );
        if (head?.id === t.id) apply({ type: "START", id: t.id });
      } else if (
        t.state === "执行中" &&
        !t.failure &&
        now >= (t.nextReportAt || 0)
      )
        apply({ type: "TICK", id: t.id });
    } catch (e) {
      s = structuredClone(s);
      s.tasks.find((x) => x.id === t.id)!.blockedReason = (e as Error).message;
    }
  }
  return s;
}
