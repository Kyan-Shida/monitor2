import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run, constraints } from "./engine";
import { deviceStats } from "./deviceMaster";
import { targetsOf } from "./mapCalibration";

/** 快速下发参数（与 engine.test 中通过的那组保持一致，便于对照） */
const quick = (points: string[], name = "临时复核") => ({
  type: "QUICK_DISPATCH",
  name,
  points,
  priority: "普通",
  robotId: "R01",
  taskType: "光学任务",
  atomicActions: ["拍照"],
});

test("设备清单导入直接生效：编码唯一、采集方式与单位受校验", () => {
  const s = seed();
  const count = s.devices!.length;
  assert.throws(
    () => run(s, { type: "IMPORT_DEVICES", devices: [{ id: "V007" }] }),
    /缺少设备名称/,
  );
  assert.throws(
    () => run(s, { type: "IMPORT_DEVICES", devices: [{ id: "V 007", name: "非法编码" }] }),
    /格式不合法/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "IMPORT_DEVICES",
        devices: [
          {
            id: "V008",
            name: "V008 新增储罐",
            items: [
              { id: "II-V008-L", target: "液位读数", kind: "可见光", unit: "" },
            ],
          },
        ],
      }),
    /缺少单位/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "IMPORT_DEVICES",
        devices: [
          {
            id: "V008",
            name: "V008 新增储罐",
            items: [
              { id: "II-V008-L", target: "液位读数", kind: "热成像", unit: "m" },
            ],
          },
        ],
      }),
    /采集方式不合法/,
  );
  // 校验失败不落库
  assert.equal(s.devices!.length, count);
});

test("设备清单导入支持同一设备多行（一设备多检测项）", () => {
  const item = (
    id: string,
    target: string,
    kind: string,
    unit: string,
  ) => ({ id, target, kind, unit, inspect: true, cycle: "每日", priority: "普通" });
  const s = run(seed(), {
    type: "IMPORT_DEVICES",
    devices: [
      { id: "V008", name: "V008 新增储罐", type: "储罐", items: [] },
      {
        id: "V008",
        name: "V008 新增储罐",
        items: [item("II-V008-1", "液位读数", "可见光", "m")],
      },
      {
        id: "V008",
        name: "V008 新增储罐",
        items: [
          item("II-V008-2", "罐壁温度", "红外", "℃"),
          // 同设备同检测目标重复行只保留一条
          item("II-V008-3", "罐壁温度", "红外", "℃"),
        ],
      },
    ],
  });
  const dev = s.devices!.find((d) => d.id === "V008")!;
  assert.deepEqual(
    dev.items.map((it) => it.target),
    ["液位读数", "罐壁温度"],
  );
});

test("设备清单导入即生效并推进设备清单版本", () => {
  let s = seed();
  const before = s.maps[0].deviceListVersion || 1;
  s = run(s, {
    type: "IMPORT_DEVICES",
    devices: [
      {
        id: "V008",
        name: "V008 新增储罐",
        type: "储罐",
        regionCode: "R-A03",
        locationDesc: "一期罐区",
        items: [
          {
            id: "II-V008-L",
            target: "液位读数",
            kind: "可见光",
            unit: "m",
            inspect: true,
            cycle: "每日",
            priority: "普通",
          },
        ],
      },
    ],
  });
  const imported = s.devices!.find((d) => d.id === "V008")!;
  assert.equal(imported.state, "在用");
  // 导入即生效：设备清单版本推进，供机器人同步比对（阶段⑧）
  assert.equal(s.maps[0].deviceListVersion, before + 1);
  // 台账统计：在用 = 设备总数 − 停用
  assert.equal(deviceStats(s).inUse, s.devices!.length - 1);
  assert.equal(deviceStats(s).stopped, 1); // V009（种子已停用）
});

test("设备停用后拦截任务创建与派单（原 extras.equipment 空转校验改为读设备主数据）", () => {
  let s = seed();
  assert.ok(!constraints(s, s.tasks[0], s.robots[0]).includes("所属设备已停用"));
  // 停用属高风险操作，需二次确认
  assert.throws(
    () => run(s, { type: "SET_DEVICE_STATE", deviceId: "DEV-V001", state: "停用" }),
    /二次确认/,
  );
  s = run(s, {
    type: "SET_DEVICE_STATE",
    deviceId: "DEV-V001",
    state: "停用",
    confirmed: true,
  });
  assert.equal(s.devices!.find((d) => d.id === "DEV-V001")!.state, "停用");
  assert.ok(constraints(s, s.tasks[0], s.robots[0]).includes("所属设备已停用"));
  assert.throws(() => run(s, quick(["P001"])), /已停用设备/);
  // 未受影响设备的点位仍可下发（P003 属 V002 缓冲罐，与停用的 V001 无关）
  assert.ok(run(s, quick(["P003"])).tasks.length > s.tasks.length);
  // P007 属装置区（装置区地图 MAP-B01）：跨区派单被拦，需装置区的机器人执行
  assert.throws(() => run(s, quick(["P007"])), /区域不匹配/);
  // 恢复启用后拦截解除
  s = run(s, { type: "SET_DEVICE_STATE", deviceId: "DEV-V001", state: "在用" });
  assert.ok(!constraints(s, s.tasks[0], s.robots[0]).includes("所属设备已停用"));
});

test("关闭「是否巡检」的检测目标不进任务指令集", () => {
  let s = seed();
  s = run(s, {
    type: "SET_INSPECT_FLAG",
    deviceId: "DEV-V001",
    itemId: "II-V001-P",
    inspect: false,
  });
  assert.equal(
    s.devices![0].items.find((i) => i.id === "II-V001-P")!.inspect,
    false,
  );
  // 全部点位被关闭 → 拒绝生成空任务
  assert.throws(() => run(s, quick(["P001"])), /关闭「是否巡检」/);
  // 部分关闭 → 只把开启的检测目标带进任务
  s = run(s, quick(["P001", "P002"], "多点位部分过滤"));
  const t = s.tasks.find((x) => x.name === "多点位部分过滤")!;
  assert.equal(t.items.length, 1);
  assert.equal(t.items[0].id, "P002");
});

test("标注页「＋快速新建」的设备直接生效，建完即可标注（单页闭环）", () => {
  let s = seed();
  const before = s.maps[0].deviceListVersion;
  s = run(s, {
    type: "IMPORT_DEVICES",
    devices: [
      {
        id: "V010",
        name: "V010 现场补录储罐",
        type: "储罐",
        regionCode: "R-A03",
        locationDesc: "一期罐区",
        items: [
          {
            id: "II-V010-L",
            target: "液位计",
            kind: "可见光",
            unit: "m",
            inspect: true,
            cycle: "每日",
            priority: "普通",
          },
        ],
      },
    ],
  });
  const d = s.devices!.find((x) => x.id === "V010")!;
  assert.equal(d.state, "在用");
  // 人工新增即生效：设备清单版本同样推进
  assert.equal(s.maps[0].deviceListVersion, (before || 1) + 1);
  // 建完即可直接用于标注：检测项与单位按检测目标自动推导
  s = run(s, {
    type: "ANNOTATE",
    mapId: s.maps[0].id,
    targetId: targetsOf(s, s.maps[0].id)[0].id,
    name: "V010 液位点",
    device: "V010",
    objects: ["液位计"],
    requirement: "表盘清晰",
  });
  const p = s.points.find((x) => x.name === "V010 液位点")!;
  assert.equal(p.device, "V010 现场补录储罐");
  assert.equal(p.item, "液位读数");
  assert.equal(p.unit, "m");
});

test("一次停靠可覆盖多个检测目标：逻辑点由系统派生且不暴露给用户", () => {
  let s = seed();
  const m = s.maps[0];
  const targetId = targetsOf(s, m.id)[0].id;
  s = run(s, {
    type: "ANNOTATE",
    mapId: m.id,
    targetId,
    name: "V001 罐区综合点",
    device: "DEV-V001",
    objects: ["出口压力表", "出口阀门"],
    requirement: "一次停靠采集表盘与阀位",
  });
  const p = s.points.find((x) => x.name === "V001 罐区综合点")!;
  assert.equal(p.device, "V001 原料储罐");
  assert.equal(p.object, "出口压力表");
  assert.equal(p.item, "压力读数");
  assert.equal(p.unit, "MPa");
  assert.equal(p.logicalIds!.length, 2);
  assert.equal(
    s.logicalPoints!.filter((x) => x.physicalPointId === p.id).length,
    2,
  );
  // 再次标注幂等：不累积逻辑点
  s = run(s, {
    type: "ANNOTATE",
    mapId: m.id,
    targetId,
    pointId: p.id,
    name: p.name,
    device: "DEV-V001",
    objects: ["出口阀门"],
    requirement: "改为只采集阀位",
  });
  assert.equal(
    s.logicalPoints!.filter((x) => x.physicalPointId === p.id).length,
    1,
  );
  // 不在主数据中的设备、已停用的设备都不能标注
  assert.throws(
    () =>
      run(s, {
        type: "ANNOTATE",
        mapId: m.id,
        targetId,
        name: "野生设备点",
        device: "V999 不存在的罐",
        objects: ["出口压力表"],
        requirement: "x",
      }),
    /不在设备主数据中/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "ANNOTATE",
        mapId: m.id,
        targetId,
        name: "停用设备点",
        device: "DEV-V009",
        objects: ["出口压力表"],
        requirement: "x",
      }),
    /已停用/,
  );
});

test("设备形态：清单导入与新增设备按设备类型推导，显式填写以填写值为准", () => {
  const item = (id: string) => ({
    id,
    target: "液位读数",
    kind: "可见光",
    unit: "m",
    inspect: true,
    cycle: "每日",
    priority: "普通",
  });
  let s = seed();
  // 种子已归类：储罐 → 实体设备；管廊（区域 / 空间类）→ 虚拟设备
  assert.equal(s.devices!.find((d) => d.id === "DEV-V001")!.deviceKind, "实体设备");
  assert.equal(s.devices!.find((d) => d.id === "DEV-PLA")!.deviceKind, "虚拟设备");
  s = run(s, {
    type: "IMPORT_DEVICES",
    devices: [
      // 未填设备形态 → 按设备类型推导（管廊 → 虚拟设备）
      { id: "V021", name: "V021 管廊", type: "管廊", items: [item("II-V021-1")] },
      // 显式填写优先于推导
      {
        id: "V022",
        name: "V022 储罐",
        type: "储罐",
        deviceKind: "虚拟设备",
        items: [item("II-V022-1")],
      },
    ],
  });
  assert.equal(s.devices!.find((d) => d.id === "V021")!.deviceKind, "虚拟设备");
  assert.equal(s.devices!.find((d) => d.id === "V022")!.deviceKind, "虚拟设备");
  // 新增设备：未指定按类型推导，非法值被拦截
  s = run(s, { type: "ADD_DEVICE", id: "V023", name: "V023 管廊", deviceType: "管廊" });
  assert.equal(s.devices!.find((d) => d.id === "V023")!.deviceKind, "虚拟设备");
  assert.throws(
    () =>
      run(s, {
        type: "ADD_DEVICE",
        id: "V024",
        name: "V024 储罐",
        deviceType: "储罐",
        deviceKind: "半实体",
      }),
    /设备形态.*不合法/,
  );
});
