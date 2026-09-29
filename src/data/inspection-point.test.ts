import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import type { InspectSpec, State } from "./types";

/** 在示例地图上补一个"随地图文件带入定位ID"的空闲点位（供新建巡检点绑定） */
function freeTarget(s: State, id: string, externalId: string) {
  s.maps.find((m) => m.id === "MAP-A03")!.targets.push({
    id,
    externalId,
    source: "地图导入",
    kind: "可见光",
    x: 30,
    y: 40,
    state: "待确认",
  });
}
/** 一个巡检项：巡检项名称 + 业务巡检目标 + 机器操作内容 */
const spec = (
  name: string,
  targetId: string,
  actions: InspectSpec["actions"] = ["拍照"],
): InspectSpec => ({
  id: "",
  name,
  targetId,
  actions,
  pose: {
    ptz: { pan: 12, tilt: -6, zoom: 3 },
    light: 40,
    dwellSec: 5,
    viewDir: "正对目标",
  },
});
/** 把巡检点置为可下发状态（保存会打回待验证、地图回草稿，本用例只验证指令集来源） */
function enable(s: State, pointId: string) {
  s.points.find((p) => p.id === pointId)!.state = "已启用";
  s.maps.find((m) => m.id === "MAP-A03")!.state = "已发布";
}

test("添加巡检点：名称 + 地图 + 地图点位（带定位ID）+ 多个巡检项逐项保存", () => {
  const s0 = seed();
  freeTarget(s0, "T-NEW", "EXT-9001");
  const s = run(s0, {
    type: "SAVE_POINT",
    mapId: "MAP-A03",
    targetId: "T-NEW",
    name: "一期罐区 A 排巡检点",
    inspectItems: [
      spec("压力读数", "BT-II-V001-P", ["拍照", "采集红外热像"]),
      spec("阀门状态", "BT-II-V001-V"),
    ],
  });
  const p = s.points.find((x) => x.name === "一期罐区 A 排巡检点")!;
  assert.ok(p, "巡检点应写入点位集合（任务模板 / 临时任务据此下发）");
  assert.equal(p.mapId, "MAP-A03");
  assert.equal(p.targetId, "T-NEW");
  assert.equal(p.state, "待验证");
  // 多个巡检项共同组成一个巡检点：名称 / 业务目标 / 机器操作内容逐项保留
  assert.equal(p.inspectItems!.length, 2);
  assert.deepEqual(p.inspectItems![0].actions, ["拍照", "采集红外热像"]);
  assert.equal(p.inspectItems![1].targetId, "BT-II-V001-V");
  // 派生视图取首个巡检项：设备 / 检测目标 / 单位仍与旧页面兼容
  assert.equal(p.device, "V001 原料储罐");
  assert.equal(p.unit, "MPa");
  // 地图点位被占用（一对一），地图回到草稿、点位数 +1
  const t = s.maps[0].targets.find((x) => x.id === "T-NEW")!;
  assert.equal(t.pointId, p.id);
  assert.equal(t.state, "已确认");
  assert.equal(s.maps[0].state, "草稿");
  // 多个巡检项 → 内部派生多条逻辑点（不暴露给用户）
  assert.equal(p.logicalIds!.length, 2);
  assert.equal(
    s.logicalPoints!.filter((x) => x.physicalPointId === p.id).length,
    2,
  );
});

test("巡检点校验：必须带定位ID的点、至少一个巡检项、每项要有名称 / 业务目标 / 原子动作", () => {
  const s0 = seed();
  freeTarget(s0, "T-NEW", "EXT-9001");
  // 平台新增的点没有定位ID，不能绑巡检点
  s0.maps
    .find((m) => m.id === "MAP-A03")!
    .targets.push({ id: "T-PLAT", source: "平台新增", kind: "可见光", x: 10, y: 10, state: "待确认" });
  const base = { type: "SAVE_POINT", mapId: "MAP-A03", targetId: "T-NEW" as string };
  assert.throws(
    () =>
      run(s0, {
        ...base,
        targetId: "T-PLAT",
        name: "平台点",
        inspectItems: [spec("压力读数", "BT-II-V001-P")],
      }),
    /定位ID/,
  );
  assert.throws(
    () => run(s0, { ...base, name: "", inspectItems: [spec("压力读数", "BT-II-V001-P")] }),
    /巡检点名称/,
  );
  assert.throws(() => run(s0, { ...base, name: "空巡检点", inspectItems: [] }), /巡检项/);
  assert.throws(
    () =>
      run(s0, {
        ...base,
        name: "无动作",
        inspectItems: [{ ...spec("压力读数", "BT-II-V001-P"), actions: [] }],
      }),
    /原子动作/,
  );
  assert.throws(
    () => run(s0, { ...base, name: "目标不存在", inspectItems: [spec("压力读数", "BT-X")] }),
    /业务目标不存在/,
  );
});

test("一个定位ID点只绑一个巡检点：重复占用被拦截", () => {
  const s0 = seed();
  freeTarget(s0, "T-DUP", "EXT-9002");
  const s = run(s0, {
    type: "SAVE_POINT",
    mapId: "MAP-A03",
    targetId: "T-DUP",
    name: "先占的巡检点",
    inspectItems: [spec("压力读数", "BT-II-V001-P")],
  });
  assert.throws(
    () =>
      run(s, {
        type: "SAVE_POINT",
        mapId: "MAP-A03",
        targetId: "T-DUP",
        name: "后占的巡检点",
        inspectItems: [spec("阀门状态", "BT-II-V001-V")],
      }),
    /已被巡检点/,
  );
});

test("地图上 Mock 了一批空闲定位ID点，可直接被新巡检点绑定", () => {
  const s = seed();
  const m = s.maps.find((x) => x.id === "MAP-A03")!;
  const free = m.targets.filter((t) => t.externalId && !t.pointId);
  assert.ok(free.length >= 10, `应有可绑定的空闲定位ID点，实际 ${free.length}`);
  const t = free[0];
  const next = run(s, {
    type: "SAVE_POINT",
    mapId: "MAP-A03",
    targetId: t.id,
    name: "空闲点绑定的巡检点",
    inspectItems: [spec("压力读数", "BT-II-V001-P")],
  });
  const p = next.points.find((x) => x.name === "空闲点绑定的巡检点")!;
  assert.ok(p);
  assert.equal(
    next.maps[0].targets.find((x) => x.id === t.id)!.pointId,
    p.id,
  );
});

test("巡检点可被临时任务与任务模板引用，指令集按巡检项配置下发", () => {
  const s0 = seed();
  freeTarget(s0, "T-NEW", "EXT-9001");
  let s = run(s0, {
    type: "SAVE_POINT",
    mapId: "MAP-A03",
    targetId: "T-NEW",
    name: "双动作巡检点",
    inspectItems: [spec("压力读数", "BT-II-V001-P", ["拍照", "采集红外热像"])],
  });
  const pid = s.points.find((x) => x.name === "双动作巡检点")!.id;
  enable(s, pid);
  // 临时任务：基于巡检点勾选
  s = run(s, {
    type: "CREATE_TASK",
    name: "临时任务（基于巡检点）",
    points: [pid],
    priority: "普通",
    taskType: "综合巡检任务",
  });
  assert.deepEqual(
    s.tasks.find((x) => x.name === "临时任务（基于巡检点）")!.atomicActions,
    ["拍照", "采集红外热像"],
  );
  // 任务模板：同样以巡检点为最小单位
  s = run(s, {
    type: "SAVE_TEMPLATE",
    name: "模板（基于巡检点）",
    points: [pid],
    priority: "普通",
  });
  assert.deepEqual(s.templates.find((x) => x.name === "模板（基于巡检点）")!.points, [pid]);
});
