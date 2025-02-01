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
  dspBuleprint; // 游戏中的蓝图
  buleprint; // 原始蓝图
  matrix; // 图纸矩阵，二维数组
  constructor(title, buleprint) {
    // 计算size
    this.matrix = buleprint.generate();
    this.dspBuleprint = newBulprint(title, { x: this.matrix[0].length, y: this.matrix.length });
    this.buleprint = buleprint;
  }

  generate() {
    // 遍历矩阵，元素为空时表示空地，非空时表示建筑
    // 遍历时为建筑分配 index，从 0 开始，只有 index 为空时才分配，并将新分配 index 的建筑对象 加入到 buleprint.buildings 中
    let index = 0;
    const height = this.buleprint.recycleMode === 1 ? 11 : 15; // 回收模式为集装分拣器时，高度为11，否则为15
    this.matrix.forEach((row, y) => {
      const yOffset = Math.floor(y / height);
      row.forEach((building, x) => {
        if (building) {
          if (building.length) {
            building.forEach((b) => {
              if (b.index === -1) {
                b.index = index++;
                this.dspBuleprint.buildings.push(b);
                // 处理建筑的坐标偏移
                b.localOffset[0].y += yOffset * height;
                b.localOffset[1].y += yOffset * height;
              }
            });
          } else if (building.index === -1) {
            building.index = index++;
            this.dspBuleprint.buildings.push(building);
            // 处理建筑的坐标偏移
            building.localOffset[0].y += yOffset * height;
            building.localOffset[1].y += yOffset * height;
          }
        }
      });
    });
    // 最后删除所有建筑的 attribute
    this.dspBuleprint.buildings.forEach((building) => {
      delete building.attribute;
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
  }

  toStr() {
    this.generate();
    return toStr(this.dspBuleprint);
  }
}
