import { toStr } from "./parser";
import { INSERTER_TYPE, SMELTER, CHEMICAL, LAB, OIL_REFINERY, HADRON_COLLIDER, ASSEMBLER, BELT_LEVEL } from "./constant";

/**
 * 构建蓝图
 */
function newBlueprint(title = "新蓝图", size = { x: 1, y: 1 }, dragBoxSize = size) {
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
  dspBlueprint; // 游戏中的蓝图
  blueprint; // 原始蓝图
  constructor(title, blueprint) {
    // 计算size
    blueprint.generate();
    this.dspBlueprint = newBlueprint(title, { x: blueprint.matrix[0].length, y: blueprint.matrix.length });
    this.blueprint = blueprint;
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

  // 连接每行传送带
  connectRows() {
    const matrix = this.blueprint.matrix;
    const firstRow = 0;
    const rowHeight = this.blueprint.height;
    const lastRow = matrix.length / rowHeight - 1;
    const rowLength = matrix[0].length + 1; //右侧多走一格
    const beltCount = this.blueprint.belt.belts.length;
    for (let i = 0; i < matrix.length; i += rowHeight) {
      const row = Math.round(i / rowHeight);
      const bottomLeft = matrix[i + 2].find(Boolean).find((f) => BELT_LEVEL.includes(f.itemName)).localOffset[0]; // 第一个带子
      const bottomRight = (matrix[i + 1].findLast(Boolean) || matrix[i + 2].findLast(Boolean)).find((f) => BELT_LEVEL.includes(f.itemName)).localOffset[0]; // 最后一个带子
      const topLeft = matrix[i + rowHeight - 1].find(Boolean).find((f) => BELT_LEVEL.includes(f.itemName)).localOffset[0]; // 第一个带子
      const topRight = matrix[i + rowHeight - 1].findLast(Boolean).find((f) => BELT_LEVEL.includes(f.itemName)).localOffset[0]; // 最后一个带子
      let nextBottomLeft;
      let nextBottomRight;
      let nextTopLeft;
      let nextTopRight;
      if (row !== lastRow) {
        try {
          const rowIdx = i + rowHeight + 2;
          const nextRow = matrix[rowIdx];
          if (!nextRow) throw new Error(`row undefined at index ${rowIdx}`);
          const firstNonEmpty = nextRow.find(Boolean);
          if (!firstNonEmpty) throw new Error(`no non-empty cell in row ${rowIdx}`);
          const beltObj = firstNonEmpty.find((f) => BELT_LEVEL.includes(f.itemName));
          if (!beltObj) {
            // 收集该 cell 中的 itemName 列表以便调试
            const names = Array.isArray(firstNonEmpty) ? firstNonEmpty.map((c) => c?.itemName).slice(0, 10) : String(firstNonEmpty);
            throw new Error(`no belt object found in first non-empty cell of row ${rowIdx}, cell items: ${JSON.stringify(names)}`);
          }
          if (!beltObj.localOffset || !beltObj.localOffset[0]) throw new Error(`belt object at row ${rowIdx} missing localOffset[0]`);
          nextBottomLeft = beltObj.localOffset[0]; // 第一个带子
        } catch (err) {
          const ctx = {
            rowIndex: i + rowHeight + 2,
            matrixLength: matrix.length,
            rowHeight,
            i,
          };
          // 抛出包含上下文和原始错误消息的错误，便于定位调用链哪一步失败
          throw new Error(`connectRows: failed to resolve nextBottomLeft. context=${JSON.stringify(ctx)}; cause=${err.message}`);
        }
        nextBottomRight = (matrix[i + rowHeight + 1].findLast(Boolean) || matrix[i + rowHeight + 2].findLast(Boolean)).find((f) =>
          BELT_LEVEL.includes(f.itemName)
        ).localOffset[0]; // 最后一个带子
        nextTopLeft = matrix[i + rowHeight * 2 - 1].find(Boolean).find((f) => BELT_LEVEL.includes(f.itemName)).localOffset[0]; // 第一个带子
        nextTopRight = matrix[i + rowHeight * 2 - 1].findLast(Boolean).find((f) => BELT_LEVEL.includes(f.itemName)).localOffset[0]; // 最后一个带子
      }

      if (row === firstRow) {
        // 第一行将右侧连接
        for (let beltIndex = 0; beltIndex < beltCount; beltIndex++) {
          this.blueprint.belt.generateBelt({ x: topRight.x, y: topRight.y, z: beltIndex + 1 }, { x: bottomRight.x, y: bottomRight.y, z: beltIndex + 1 });
        }
      }
      if (row % 2 === 0) {
        //单数行连接左侧
        // 左侧带子抬升
        for (let beltIndex = 0; beltIndex < beltCount; beltIndex++) {
          this.blueprint.belt.generateBelt(
            { x: bottomLeft.x, y: i + 2 - beltIndex, z: 0 },
            { x: 0, y: i + 2 - beltIndex, z: beltIndex + 1 },
            ["z", "x", "y"],
            "x"
          );
        }
        // 上游连接下一行
        if (row === firstRow && row === lastRow) {
          // 只有一行
          for (let beltIndex = 0; beltIndex < beltCount; beltIndex++) {
            this.blueprint.belt.generateBelt({ x: 0, y: i + 2 - beltIndex, z: beltIndex + 1 }, { x: 0, y: rowHeight - 1, z: beltIndex + 1 });
          }
        } else if (row !== lastRow) {
          //左侧下方带子连接
          for (let beltIndex = 0; beltIndex < beltCount; beltIndex++) {
            this.blueprint.belt.generateBelt(
              { x: 0, y: i + 2 - beltIndex, z: beltIndex + 1 },
              { x: nextBottomLeft.x, y: i + 2 - beltIndex + rowHeight, z: 0 },
              ["y", "z", "x"],
              "x"
            );
          }
          // 左侧上方带子连接
          if (nextTopLeft.x !== 2) {
            // 下一行的上部填充
            for (let beltIndex = 0; beltIndex < beltCount; beltIndex++) {
              this.blueprint.belt.generateBelt(
                { x: nextTopLeft.x, y: i + rowHeight * 2 - 1, z: beltIndex + 1 },
                { x: 2, y: i + rowHeight * 2 - 1, z: beltIndex + 1 }
              );
            }
            // 副产
            this.blueprint.surplus &&
              this.blueprint.belt.generateBelt(
                { x: nextTopLeft.x, y: i + rowHeight * 2 - 1, z: beltCount + 1 },
                { x: 2, y: i + rowHeight * 2 - 1, z: beltCount + 1 }
              );
          }
          for (let beltIndex = 0; beltIndex < beltCount; beltIndex++) {
            this.blueprint.belt.generateBelt({ x: 2, y: i + rowHeight * 2 - 1, z: beltIndex + 1 }, { x: 2, y: i + rowHeight - 1, z: beltIndex + 1 });
          }
          // 副产
          this.blueprint.surplus &&
            this.blueprint.belt.generateBelt({ x: 2, y: i + rowHeight * 2 - 1, z: beltCount + 1 }, { x: 2, y: i + rowHeight - 1, z: beltCount + 1 });
        }

        if (row === lastRow) {
          // 最后一行是单数时，左侧连接
          for (let beltIndex = 0; beltIndex < this.blueprint.belt.belts.length; beltIndex++) {
            this.blueprint.belt.generateBelt(
              { x: 0, y: i + 2 - beltIndex, z: beltIndex + 1 },
              { x: topLeft.x, y: i + rowHeight - 1, z: beltIndex + 1 },
              ["y", "z", "x"],
              "x"
            );
          }
        }
      } else {
        // 双数行连接右侧
        // 否则连接下一行
        if (row !== lastRow) {
          for (let beltIndex = 0; beltIndex < beltCount; beltIndex++) {
            //抬升下方带子
            this.blueprint.belt.generateBelt(
              { x: bottomRight.x, y: i + 2 - beltIndex, z: 0 },
              { x: rowLength - 1, y: i + 2 - beltIndex, z: beltIndex + 1 },
              ["x", "z", "y"],
              "x",
              1
            );
            // 下方带子连接下一行
            this.blueprint.belt.generateBelt(
              { x: rowLength - 1, y: i + 2 - beltIndex, z: beltIndex + 1 },
              { x: nextBottomRight.x, y: i + 2 + rowHeight - beltIndex, z: 0 },
              ["y", "z", "x"],
              "x"
            );

            this.blueprint.belt.generateBelt(
              { x: nextTopRight.x, y: i + rowHeight * 2 - 1, z: beltIndex + 1 },
              { x: rowLength - 3, y: i + rowHeight - 1, z: beltIndex + 1 },
              ["x", "z", "y"]
            );
            // 副产
            this.blueprint.surplus &&
              this.blueprint.belt.generateBelt(
                { x: nextTopRight.x, y: i + rowHeight * 2 - 1, z: beltCount + 1 },
                { x: rowLength - 3, y: i + rowHeight - 1, z: beltCount + 1 },
                ["x", "z", "y"]
              );
            // 填充
            if (topRight.x !== rowLength - 3) {
              this.blueprint.belt.generateBelt(
                { x: rowLength - 3, y: i + rowHeight - 1, z: beltIndex + 1 },
                { x: topRight.x, y: i + rowHeight - 1, z: beltIndex + 1 }
              );
              // 副产
              this.blueprint.belt.generateBelt(
                { x: rowLength - 3, y: i + rowHeight - 1, z: beltCount + 1 },
                { x: topRight.x, y: i + rowHeight - 1, z: beltCount + 1 }
              );
            }
          }
        } else {
          // 最后一行是双数时，右侧连接，先抬升
          for (let beltIndex = 0; beltIndex < beltCount; beltIndex++) {
            this.blueprint.belt.generateBelt(
              { x: bottomRight.x, y: i + 2 - beltIndex, z: 0 },
              { x: rowLength - 1, y: i + 2 - beltIndex, z: beltIndex + 1 },
              ["x", "z", "y"],
              "x",
              1
            );
            this.blueprint.belt.generateBelt(
              { x: rowLength - 1, y: i + 2 - beltIndex, z: beltIndex + 1 },
              { x: topRight.x, y: topRight.y, z: beltIndex + 1 },
              ["y", "z", "x"],
              "x"
            );
          }
        }
      }
    }
  }

  connectRows4Dir() {
    const matrix = this.blueprint.matrix;
    const rowHeight = this.blueprint.height;
    const rowLength = matrix[0].length;
    const left = matrix[1].find(Boolean).find((f) => BELT_LEVEL.includes(f.itemName)).localOffset[0].x; // 第一个带子
    const right = matrix[5].findLast(Boolean).find((f) => BELT_LEVEL.includes(f.itemName)).localOffset[0].x; // 最后一个带子
    const virtualRowX = 2;
    const nextLeft = matrix[rowHeight + 1].find(Boolean)?.find((f) => BELT_LEVEL.includes(f.itemName))?.localOffset?.[0]?.x || virtualRowX; // 第一个带子
    const nextRight = matrix[rowHeight + 1].findLast(Boolean)?.find((f) => BELT_LEVEL.includes(f.itemName))?.localOffset?.[0]?.x || virtualRowX; // 最后一个带子
    // 连接左侧
    this.blueprint.belt.generateBelt({ x: left, y: 1, z: 0 }, { x: 0, y: rowHeight, z: 0 }, ["x", "y", "z"]);
    this.blueprint.belt.generateBelt({ x: 0, y: rowHeight, z: 0 }, { x: nextLeft, y: rowHeight + 1, z: 0 }, ["y", "x", "z"]);
    // 连接右侧
    this.blueprint.belt.generateBelt({ x: nextRight, y: rowHeight + 1, z: 0 }, { x: rowLength, y: rowHeight, z: 0 }, ["x", "y", "z"]);
    this.blueprint.belt.generateBelt({ x: rowLength, y: rowHeight, z: 0 }, { x: right, y: 5, z: 0 }, ["y", "x", "z"]);
  }

  generate() {
    // 遍历矩阵，元素为空时表示空地，非空时表示建筑
    // 反转偶数行建筑
    this.blueprint.matrix.forEach((row, i) => {
      if (Math.ceil((i + 1) / this.blueprint.height) % 2 === 0) {
        row.reverse();
      }
    });
    const buildingMap = new Map();
    const rowLength = this.blueprint.matrix[0].length;
    Array.from(this.blueprint.buildingsMap.values()).forEach((building) => {
      let key = `${building.itemName}-${building.localOffset[0].x}-${building.localOffset[0].y}-${building.localOffset[0].z}`;
      if (Math.ceil((building.localOffset[0].y + 1) / this.blueprint.height) % 2 === 0) {
        this.buildingReverse(building, rowLength);
        key = `${building.itemName}-${building.localOffset[0].x}-${building.localOffset[0].y}-${building.localOffset[0].z}`;
      }
      buildingMap.set(key, building);
    });
    this.blueprint.buildingsMap = buildingMap;

    if (this.blueprint.recycleMode === 1) {
      this.connectRows();
    } else {
      this.connectRows4Dir();
    }

    // 遍历时为建筑分配 index，从 0 开始，只有 index 为空时才分配，并将新分配 index 的建筑对象 加入到 blueprint.buildings 中
    let index = 0;
    this.dspBlueprint.buildings = Array.from(this.blueprint.buildingsMap.values());
    this.dspBlueprint.buildings.forEach((building) => {
      building.index = index++;
      delete building.attribute;
      if (!inserterIds.includes(building.itemId)) {
        building.localOffset[1].x = building.localOffset[0].x;
        building.localOffset[1].y = building.localOffset[0].y;
        building.localOffset[1].z = building.localOffset[0].z;
      }
    });
    let unLinked = this.dspBlueprint.buildings.filter((f) => typeof f.inputObjIdx === "object");
    let unlinkLength;
    while (unLinked.length) {
      unlinkLength = unLinked.length;
      unLinked = unLinked.filter((f) => {
        if (f.inputObjIdx.index !== -1) {
          f.inputObjIdx = f.inputObjIdx.index;
          return false;
        }
        return true;
      });
      if (unlinkLength === unLinked.length) {
        throw new Error("存在连接异常的建筑");
      }
    }
    unLinked = this.dspBlueprint.buildings.filter((f) => typeof f.outputObjIdx === "object");
    while (unLinked.length) {
      unlinkLength = unLinked.length;
      unLinked = unLinked.filter((f) => {
        if (f.outputObjIdx.index !== -1) {
          f.outputObjIdx = f.outputObjIdx.index;
          return false;
        }
        return true;
      });
      if (unlinkLength === unLinked.length) {
        throw new Error("存在连接异常的建筑");
      }
    }
  }

  toStr() {
    this.generate();
    return toStr(this.dspBlueprint);
  }
}
