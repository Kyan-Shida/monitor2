/** Diagnostic reproduction only: records observed behavior without changing customer sources. */
import { seed } from "../src/data/seed";
import { transition, constraints } from "../src/data/engine";

const observations: Record<string, unknown>[] = [];

{
  let s = seed();
  s = transition(s, { type: "ENQUEUE", id: "T010", robotId: "R01" });
  s = transition(s, { type: "TASK_FINISHED", id: "T009" });
  observations.push({
    case: "busy robot queued task after current task finishes",
    robotState: s.robots.find((r) => r.id === "R01")!.state,
    robotCurrent: s.robots.find((r) => r.id === "R01")!.current ?? null,
    queuedTaskState: s.tasks.find((t) => t.id === "T010")!.state,
  });
}

{
  let s = seed();
  const r = s.robots.find((r) => r.id === "R01")!;
  r.mapVersion = 2;
  r.pointSet = 6;
  const before = constraints(s, s.tasks.find((t) => t.id === "T010")!, r, true);
  s = transition(s, { type: "ENQUEUE", id: "T010", robotId: "R01" });
  observations.push({
    case: "enqueue to busy robot with outdated map",
    constraints: before,
    resultingState: s.tasks.find((t) => t.id === "T010")!.state,
  });
}

{
  let s = seed();
  s = transition(s, { type: "ENQUEUE", id: "T010", robotId: "R01" });
  s = transition(s, { type: "REASSIGN", id: "T010", robotId: "R01", confirmed: true });
  let startError = "";
  try { transition(s, { type: "START", id: "T010" }); }
  catch (error) { startError = (error as Error).message; }
  observations.push({
    case: "reassigned task requires dispatch again before START",
    taskState: s.tasks.find((t) => t.id === "T010")!.state,
    startError,
    stateAfterDispatchAgain: transition(s, { type: "ENQUEUE", id: "T010", robotId: "R01" }).tasks.find((t) => t.id === "T010")!.state,
  });
}

{
  let s = seed();
  s = transition(s, { type: "TAKEOVER", robotId: "R01" });
  s = transition(s, { type: "CONTROL_ACK", id: s.sessions[0].id });
  s = transition(s, { type: "RETURN_HOME", robotId: "R01" });
  observations.push({
    case: "return home while a takeover session is active",
    robotState: s.robots.find((r) => r.id === "R01")!.state,
    sessionState: s.sessions[0].state,
    taskState: s.tasks.find((t) => t.id === "T009")!.state,
  });
}

console.log(JSON.stringify(observations, null, 2));
