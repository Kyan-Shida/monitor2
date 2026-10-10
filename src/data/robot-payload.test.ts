/**
 * @file robot-payload.test.ts
 * @description 机器人上装能力（后台管理）引擎动作回归：编码唯一、一个上装可定义多种采集方式、
 *              每组动作必须与该组采集方式一致、同采集方式不可重复、机型必须存在，
 *              以及新增 / 停用 / 删除的落库效果。
 * @interaction 被测对象：engine.ts 的 ADD_ROBOT_PAYLOAD / UPDATE_ROBOT_PAYLOAD /
 *              SET_ROBOT_PAYLOAD_STATE / DELETE_ROBOT_PAYLOAD
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";

test("上装能力：编码唯一、动作与采集方式必须一致、机型合法", () => {
  const s = seed();
  const count = s.robotPayloads!.length;
  // 编码重复
  assert.throws(
    () =>
      run(s, {
        type: "ADD_ROBOT_PAYLOAD",
        id: "PL-VIS",
        name: "重复编码",
        abilities: [{ kind: "可见光", actions: ["拍照"] }],
        models: [],
      }),
    /已存在/,
  );
  // 「拍照」属于可见光采集，不能挂在红外能力组下
  assert.throws(
    () =>
      run(s, {
        type: "ADD_ROBOT_PAYLOAD",
        id: "PL-X",
        name: "动作与采集方式不符",
        abilities: [{ kind: "红外", actions: ["拍照"] }],
        models: [],
      }),
    /不一致/,
  );
  // 未选动作 / 空能力组 / 重复采集方式 / 机型不存在
  assert.throws(
    () =>
      run(s, {
        type: "ADD_ROBOT_PAYLOAD",
        id: "PL-Y",
        name: "未选动作",
        abilities: [{ kind: "可见光", actions: [] }],
        models: [],
      }),
    /至少选择一个支持动作/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "ADD_ROBOT_PAYLOAD",
        id: "PL-Y",
        name: "空能力组",
        abilities: [],
        models: [],
      }),
    /至少配置一种采集能力/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "ADD_ROBOT_PAYLOAD",
        id: "PL-Y",
        name: "重复采集方式",
        abilities: [
          { kind: "可见光", actions: ["拍照"] },
          { kind: "可见光", actions: ["录像片段"] },
        ],
        models: [],
      }),
    /不能重复配置/,
  );
  assert.throws(
    () =>
      run(s, {
        type: "ADD_ROBOT_PAYLOAD",
        id: "PL-Z",
        name: "机型不存在",
        abilities: [{ kind: "可见光", actions: ["拍照"] }],
        models: ["飞机"],
      }),
    /机型/,
  );
  // 校验失败不落库
  assert.equal(s.robotPayloads!.length, count);
});

test("上装能力：新增（含多采集方式）→ 编辑 → 停用 → 删除", () => {
  let s = seed();
  s = run(s, {
    type: "ADD_ROBOT_PAYLOAD",
    id: "PL-LIDAR",
    name: "双光云台",
    abilities: [
      { kind: "可见光", actions: ["拍照"] },
      { kind: "红外", actions: ["采集红外热像"] },
    ],
    models: ["机器狗"],
  });
  const added = s.robotPayloads!.find((p) => p.id === "PL-LIDAR")!;
  assert.equal(added.state, "启用");
  assert.deepEqual(added.models, ["机器狗"]);
  // 多采集方式被完整落库
  assert.deepEqual(added.abilities, [
    { kind: "可见光", actions: ["拍照"] },
    { kind: "红外", actions: ["采集红外热像"] },
  ]);

  s = run(s, {
    type: "UPDATE_ROBOT_PAYLOAD",
    id: "PL-LIDAR",
    name: "双光云台 Pro",
    abilities: [{ kind: "可见光", actions: ["拍照", "录像片段"] }],
    models: ["机器狗", "四轮车"],
  });
  const updated = s.robotPayloads!.find((p) => p.id === "PL-LIDAR")!;
  assert.equal(updated.name, "双光云台 Pro");
  assert.deepEqual(updated.abilities, [
    { kind: "可见光", actions: ["拍照", "录像片段"] },
  ]);

  s = run(s, { type: "SET_ROBOT_PAYLOAD_STATE", id: "PL-LIDAR", state: "停用" });
  assert.equal(s.robotPayloads!.find((p) => p.id === "PL-LIDAR")!.state, "停用");

  s = run(s, { type: "DELETE_ROBOT_PAYLOAD", id: "PL-LIDAR" });
  assert.equal(s.robotPayloads!.some((p) => p.id === "PL-LIDAR"), false);
});
