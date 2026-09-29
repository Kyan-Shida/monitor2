import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { captureKindOfPoint } from "./deviceMaster";
import type { State } from "./types";

/** 同步地图到指定机器人（三个阶段步进，与 engine.test 的辅助函数同口径） */
function syncTo(s: State, mapId: string, robotId: string) {
  s = run(s, { type: "SYNC", mapId, robotId });
  const id = s.syncs[0].id;
  for (let i = 0; i < 3; i++) s = run(s, { type: "SYNC_STEP", id });
  return s;
}

test("任务原子动作由「采集方式」推导，不由业务类型推导（G′3）", () => {
  let s = seed();
  // 口径来源：设备主数据巡检项的 kind（可见光 / 红外 / 气体 / 声音）
  assert.equal(
    captureKindOfPoint(s, s.points.find((p) => p.id === "P004")!),
    "可见光",
  );
  assert.equal(
    captureKindOfPoint(s, s.points.find((p) => p.id === "P006")!),
    "红外",
  );
  s = run(s, {
    type: "CREATE_TASK",
    name: "混合采集",
    points: ["P004", "P006"],
    priority: "普通",
    taskType: "综合巡检任务",
  });
  const t = s.tasks.find((x) => x.name === "混合采集")!;
  assert.deepEqual(t.atomicActions, ["拍照", "采集红外热像"]);
  // 每个点位快照都记录了"到位动作"
  assert.deepEqual(t.items.find((p) => p.id === "P004")!.actions, ["拍照"]);
  assert.deepEqual(t.items.find((p) => p.id === "P006")!.actions, [
    "采集红外热像",
  ]);
});

test("一个停靠位覆盖多种采集方式时，动作列表保留全部（不丢红外）", () => {
  let s = seed();
  const map = s.maps.find((x) => x.id === "MAP-A03")!;
  const targetId = map.targets[0].id;
  // 同一次停靠：出口压力表（可见光）+ 罐壁（红外）
  s = run(s, {
    type: "ANNOTATE",
    mapId: map.id,
    targetId,
    name: "V003 表盘 + 罐壁",
    device: "DEV-V003",
    objects: ["出口压力表", "罐壁"],
    requirement: "先拍表盘，再采集罐壁热像",
  });
  const p = s.points.find((x) => x.name === "V003 表盘 + 罐壁")!;
  // 本用例只验证动作推导：跳过"试验发布 → 同步 → 自主验证"（该链路由端到端用例覆盖），
  // 直接把新点位与地图恢复到可用于建任务的状态
  p.state = "已启用";
  // 注意：ANNOTATE 已把地图打回「草稿」（结构化克隆后需重新取引用）
  s.maps.find((x) => x.id === "MAP-A03")!.state = "已发布";
  s = run(s, {
    type: "CREATE_TASK",
    name: "多采集方式",
    points: [p.id],
    priority: "普通",
    taskType: "综合巡检任务",
  });
  const t = s.tasks.find((x) => x.name === "多采集方式")!;
  assert.deepEqual(t.atomicActions, ["拍照", "采集红外热像"]);
  assert.deepEqual(t.items[0].actions, ["拍照", "采集红外热像"]);
});

test("显式传入的原子动作优先（快速下发场景不受推导影响）", () => {
  const s = seed();
  assert.throws(
    () =>
      run(s, {
        type: "QUICK_DISPATCH",
        name: "未选动作",
        points: ["P001"],
        priority: "普通",
        robotId: "R01",
        taskType: "光学任务",
      }),
    /请至少选择一个原子动作/,
  );
});

test("巡检项配置的机器操作内容决定任务指令集；变更只影响新任务", () => {
  let s = seed();
  s = run(s, {
    type: "CREATE_TASK",
    name: "变更前",
    points: ["P004"],
    priority: "普通",
    taskType: "光学任务",
  });
  assert.deepEqual(
    s.tasks.find((x) => x.name === "变更前")!.atomicActions,
    ["拍照"],
  );
  // 把该巡检点的巡检项机器操作内容改成「拍照 + 采集红外热像」
  const before = s.points.find((p) => p.id === "P004")!;
  const spec = before.inspectItems![0];
  s = run(s, {
    type: "SAVE_POINT",
    pointId: "P004",
    mapId: "MAP-A03",
    targetId: before.targetId,
    name: before.name,
    inspectItems: [{ ...spec, actions: ["拍照", "采集红外热像"] }],
  });
  // 保存巡检点会把点位打回待验证、地图打回草稿：本用例只验证指令集来源，故先复位
  s.points.find((p) => p.id === "P004")!.state = "已启用";
  s.maps.find((m) => m.id === "MAP-A03")!.state = "已发布";
  s = run(s, {
    type: "CREATE_TASK",
    name: "变更后",
    points: ["P004"],
    priority: "普通",
    taskType: "综合巡检任务",
  });
  assert.deepEqual(
    s.tasks.find((x) => x.name === "变更后")!.atomicActions,
    ["拍照", "采集红外热像"],
  );
  // 旧任务仍按创建时的快照执行
  const old = s.tasks.find((x) => x.name === "变更前")!;
  assert.deepEqual(old.atomicActions, ["拍照"]);
  assert.deepEqual(old.items[0].actions, ["拍照"]);
});

test("无设备主数据时回落到 Point.kind 旧口径（兼容回退可用）", () => {
  let s = seed();
  s.devices = [];
  s.logicalPoints = [];
  assert.equal(
    captureKindOfPoint(s, s.points.find((p) => p.id === "P006")!),
    "红外",
  );
  // 旧口径里"仪表 / 阀门"属业务类型，一律视为可见光
  assert.equal(
    captureKindOfPoint(s, s.points.find((p) => p.id === "P004")!),
    "可见光",
  );
  s = run(s, {
    type: "CREATE_TASK",
    name: "旧口径回退",
    points: ["P004", "P006"],
    priority: "普通",
    taskType: "综合巡检任务",
  });
  assert.deepEqual(
    s.tasks.find((x) => x.name === "旧口径回退")!.atomicActions,
    ["拍照", "采集红外热像"],
  );
});

test("「怎么看」随点位快照进任务（G′5 动作序列数据面）", () => {
  let s = seed();
  s = run(s, {
    type: "CREATE_TASK",
    name: "带编排",
    points: ["P001"],
    priority: "普通",
    taskType: "光学任务",
  });
  const item = s.tasks.find((x) => x.name === "带编排")!.items[0];
  assert.equal(item.actionPlan!.ptz.pan, 12);
  assert.equal(item.actionPlan!.dwellSec, 6);
  assert.equal(item.actionPlan!.viewDir, "正对表盘");
  assert.deepEqual(item.actions, ["拍照"]);
});

test("端到端验收（K′4）：上传底图 → 图上标注（多选检测目标 + 动作编排）→ 发布 → 同步 → 生成可下发任务", () => {
  let s = seed();
  const MAP = "MAP-A03";
  const mapOf = () => s.maps.find((x) => x.id === MAP)!;
  // ① 上传/替换底图
  s = run(s, {
    type: "SET_MAP_IMAGE",
    mapId: MAP,
    image: "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22x%22%2F%3E",
  });
  assert.ok(mapOf().image);
  // ② 图面点击新增候选目标
  s = run(s, { type: "ADD_TARGET", mapId: MAP, x: 30, y: 70, kind: "仪表" });
  const target = mapOf().targets.at(-1)!;
  // ③ 标注：一次停靠覆盖 2 个检测目标 + 就地编排"怎么看"
  s = run(s, {
    type: "ANNOTATE",
    mapId: MAP,
    targetId: target.id,
    name: "V003 罐区综合点",
    device: "DEV-V003",
    objects: ["出口压力表", "罐壁"],
    requirement: "一次停靠采集表盘与罐壁热像",
    actionPlan: {
      ptz: { pan: 18, tilt: -8, zoom: 4 },
      viewDir: "先表盘后罐壁",
      light: 55,
      dwellSec: 8,
      avoidPolicy: "绕行优先",
      preset: "预置位 3",
    },
    taught: true,
  });
  const p = s.points.find((x) => x.name === "V003 罐区综合点")!;
  assert.equal(p.logicalIds!.length, 2);
  assert.equal(p.actionPlan!.ptz.pan, 18);
  assert.equal(p.taught, true);
  // ④ 单级定版（无试验 / 正式之分）→ 同步给验证机器人 → 自主验证
  s = run(s, { type: "PUBLISH", id: MAP });
  assert.equal(mapOf().state, "已发布");
  s = syncTo(s, MAP, "R02");
  s = run(s, { type: "VALIDATE", id: p.id, robotId: "R02" });
  assert.equal(s.points.find((x) => x.id === p.id)!.state, "已启用");
  // ⑤ 生成任务：动作来自采集方式，视角来自点位编排
  s = run(s, {
    type: "CREATE_TASK",
    name: "端到端下发",
    points: [p.id],
    priority: "普通",
    taskType: "综合巡检任务",
  });
  const t = s.tasks.find((x) => x.name === "端到端下发")!;
  assert.deepEqual(t.atomicActions, ["拍照", "采集红外热像"]);
  assert.deepEqual(t.items[0].actions, ["拍照", "采集红外热像"]);
  assert.equal(t.items[0].actionPlan!.dwellSec, 8);
  assert.equal(t.items[0].logicalIds!.length, 2);
});
