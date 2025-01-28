import { toStr } from "./parser";

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

export class BlueprintBuilder {
  buleprint;
  matrix; // 图纸矩阵，二维数组
  constructor(title, matrix) {
    // 计算size
    this.buleprint = newBulprint(title, { x: matrix[0].length, y: matrix.length });
    this.matrix = matrix;
  }

  generate() {
    // 遍历矩阵，元素为空时表示空地，非空时表示建筑
    // 遍历时为建筑分配 index，从 0 开始，只有 index 为空时才分配，并将新分配 index 的建筑对象 加入到 buleprint.buildings 中
    let index = 0;
    this.matrix.forEach((row, y) => {
      row.forEach((building, x) => {
        if (building) {
          if (building.length) {
            building.forEach((b) => {
              if (b.index === -1) {
                b.index = index++;
                this.buleprint.buildings.push(b);
              }
            });
          } else if (building.index === -1) {
            building.index = index++;
            this.buleprint.buildings.push(building);
          }
        }
      });
    });
    // 最后删除所有建筑的 attribute
    this.buleprint.buildings.forEach((building) => {
      delete building.attribute;
    });
    let unLinked = this.buleprint.buildings.filter((f) => typeof f.inputObjIdx === "object");
    while (unLinked.length) {
      unLinked = unLinked.filter((f) => {
        if (f.inputObjIdx.index !== -1) {
          f.inputObjIdx = f.inputObjIdx.index;
          return false;
        }
        return true;
      });
    }
  }

  toStr() {
    this.generate();
    return toStr(this.buleprint);
  }
}
