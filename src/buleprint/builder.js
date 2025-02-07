import { toStr } from "./parser";
import { INSERTER_TYPE, SMELTER, CHEMICAL, LAB, OIL_REFINERY, HADRON_COLLIDER, ASSEMBLER } from "./constant";

/**
 * 构建蓝图
 */
function newBulprint(title = "新蓝图", size = { x: 1, y: 1 }, dragBoxSize = size) {
  return {
    header: {
      layout: 10,
      icons: [0, 0, 0, 0, 0],
      time: new Date().toISOString(),
      gameVersion: "0.10.32.25552",
      shortDesc: title,
      desc: "",
    },
    version: 1,
    cursorOffset: {
      x: 6,
      y: 2,
    },
    cursorTargetArea: 0,
    dragBoxSize: dragBoxSize,
    primaryAreaIdx: 0,
    areas: [
      {
        index: 0,
        parentIndex: -1,
        tropicAnchor: 0,
        areaSegments: 200,
        anchorLocalOffset: {
          x: 0,
          y: 0,
        },
        size: size,
      },
    ],
    buildings: [],
  };
}

const inserterIds = [2011, 2012, 2013, 2014]; // 分拣器id
export const ROW_HEIGHT_1 = 10; // 集装分拣器回收时一行的高度
export const ROW_HEIGHT_2 = 15;

const SMELTER_SOLT_REVERSE = [-1, -1, -1, -1, -1, -1, 8, -1, 6];
const LAB_SOLT_REVERSE = [-1, -1, -1, -1, -1, -1, 8, 7, 6];
const ASSEMBLER_SOLT_REVERSE = [-1, -1, -1, -1, -1, -1, 8, -1, 6];
const CHEMICAL_SOLT_REVERSE = [2, 1, 0, -1, 6, 5, 4, -1]; // 左到右，上：0 1 2 7 下：6 5 4 3
const OIL_REFINERY_SOLT_REVERSE = [5, 4, 3, 2, 1, 0]; //上：5 4 3 下：0 1 2
const HADRON_COLLIDER_SOLT_REVERSE = [8, 7, 6, -1, -1, -1, 2, 1, 0];

// 反转建筑连接
function buildSlotReverse(factory, slot) {
  if (SMELTER.includes(factory)) {
    // 熔炉
    return SMELTER_SOLT_REVERSE[slot] === -1 ? slot : SMELTER_SOLT_REVERSE[slot];
  } else if (LAB.includes(factory)) {
    // 实验室
    return LAB_SOLT_REVERSE[slot] === -1 ? slot : LAB_SOLT_REVERSE[slot];
  } else if (ASSEMBLER.includes(factory)) {
    // 制造台
    return ASSEMBLER_SOLT_REVERSE[slot] === -1 ? slot : ASSEMBLER_SOLT_REVERSE[slot];
  } else if (CHEMICAL.includes(factory)) {
    // 化工厂
    return CHEMICAL_SOLT_REVERSE[slot] === -1 ? slot : CHEMICAL_SOLT_REVERSE[slot];
  } else if (OIL_REFINERY.includes(factory)) {
    // 原油精炼厂
    return OIL_REFINERY_SOLT_REVERSE[slot] === -1 ? slot : OIL_REFINERY_SOLT_REVERSE[slot];
  } else if (HADRON_COLLIDER.includes(factory)) {
    // 微型粒子对撞机
    return HADRON_COLLIDER_SOLT_REVERSE[slot] === -1 ? slot : HADRON_COLLIDER_SOLT_REVERSE[slot];
  } else {
    return slot;
  }
}
export class BlueprintBuilder {
  dspBuleprint; // 游戏中的蓝图
  buleprint; // 原始蓝图
  constructor(title, buleprint) {
    // 计算size
    buleprint.generate();
    this.dspBuleprint = newBulprint(title, { x: buleprint.matrix[0].length, y: buleprint.matrix.length });
    this.buleprint = buleprint;
  }

  /**
   * 反转建筑
   * @param {*} building
   */
  buildingReverse(building, rowLength) {
    // 反转x坐标，
    if (INSERTER_TYPE.includes(building.itemName)) {
      // 分拣器
      this.inserterReverse(building, rowLength);
    } else if (OIL_REFINERY === building.itemName) {
      // 原油精炼厂
      building.localOffset[0].x = rowLength - building.localOffset[0].x;
      // building.localOffset[0].x += 1;
      building.yaw = [270, 270];
    } else if (HADRON_COLLIDER === building.itemName) {
      // 微型粒子对撞机
      building.localOffset[0].x = rowLength - building.localOffset[0].x;
      building.yaw = [180, 180];
    } else {
      building.localOffset[0].x = rowLength - building.localOffset[0].x;
    }
  }

  /**
   * 反转分拣器
   * @param {*} inserter
   * @param {*} rowLength
   */
  inserterReverse(inserter, rowLength) {
    inserter.localOffset[0].x = rowLength - inserter.localOffset[0].x;
    inserter.localOffset[1].x = rowLength - inserter.localOffset[1].x;
    if (inserter.localOffset[0].x === inserter.localOffset[1].x) {
      // 处理建筑连接
      if (inserter.inputObjIdx) {
        inserter.inputFromSlot = buildSlotReverse(inserter.inputObjIdx.itemName, inserter.inputFromSlot);
      }
      if (inserter.outputObjIdx) {
        inserter.outputToSlot = buildSlotReverse(inserter.outputObjIdx.itemName, inserter.outputToSlot);
      }
    } else {
      // 横向的还要调转方向
      inserter.yaw[0] = (inserter.yaw[0] + 180) % 360;
      inserter.yaw[1] = (inserter.yaw[1] + 180) % 360;
    }
  }

  generate() {
    // 遍历矩阵，元素为空时表示空地，非空时表示建筑
    // 反转偶数行建筑
    this.buleprint.matrix.forEach((row, i) => {
      if (Math.ceil((i + 1) / this.buleprint.height) % 2 === 0) {
        row.reverse();
      }
    });
    const buildingMap = new Map();
    const rowLength = this.buleprint.matrix[0].length;
    this.buleprint.buildingsMap.values().forEach((building) => {
      let key = `${building.itemName}-${building.localOffset[0].x}-${building.localOffset[0].y}-${building.localOffset[0].z}`;
      if (Math.ceil((building.localOffset[0].y + 1) / this.buleprint.height) % 2 === 0) {
        this.buildingReverse(building, rowLength);
        key = `${building.itemName}-${building.localOffset[0].x}-${building.localOffset[0].y}-${building.localOffset[0].z}`;
      }
      buildingMap.set(key, building);
    });
    this.buleprint.buildingsMap = buildingMap;

    // 遍历时为建筑分配 index，从 0 开始，只有 index 为空时才分配，并将新分配 index 的建筑对象 加入到 buleprint.buildings 中
    let index = 0;
    this.dspBuleprint.buildings = Array.from(this.buleprint.buildingsMap.values());
    this.dspBuleprint.buildings.forEach((building) => {
      building.index = index++;
      delete building.attribute;
      if (!inserterIds.includes(building.itemId)) {
        building.localOffset[1].x = building.localOffset[0].x;
        building.localOffset[1].y = building.localOffset[0].y;
        building.localOffset[1].z = building.localOffset[0].z;
      }
    });
    let unLinked = this.dspBuleprint.buildings.filter((f) => typeof f.inputObjIdx === "object");
    while (unLinked.length) {
      unLinked = unLinked.filter((f) => {
        if (f.inputObjIdx.index !== -1) {
          f.inputObjIdx = f.inputObjIdx.index;
          return false;
        }
        return true;
      });
    }
    unLinked = this.dspBuleprint.buildings.filter((f) => typeof f.outputObjIdx === "object");
    while (unLinked.length) {
      unLinked = unLinked.filter((f) => {
        if (f.outputObjIdx.index !== -1) {
          f.outputObjIdx = f.outputObjIdx.index;
          return false;
        }
        return true;
      });
    }
  }

  toStr() {
    this.generate();
    return toStr(this.dspBuleprint);
  }
}
