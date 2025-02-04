/**
 * 混带蓝图生成器
 */
/*
// 一个生产单元，量化计算结果的一行就是一个生产单元
interface ProduceUnit {
  factory: string; // 工厂名
  factoryNumber: number; // 工厂数量
  grossOutput: number; // 实际输出产物数量
  isMineralized: boolean; // 是否源矿
  item: string; // 产物名称
  proNum: number; // 喷涂等级，0-无
  recipe: number; // 配方下标，不是配方ID，下标+1=ID
  sideProducts: Record<string, string>; // 副产物：<产物名称, 数量 字符串形式>
  theoryOutput: number; // 理论产出的产物数量，包含其它配方的副产物数量
}

// 配方
interface Recipe {
  ID: number; // 下标+1
  Type: number; // -1 为黑雾产出
  Factories: number[]; // 工厂
  Name: string; // 配方名称
  Items: number[]; // 原料id
  ItemCounts: number[]; //
  Results: number[]; //产物id
  ResultCounts: number[];
  Proliferator: number; // 喷涂类型：1-仅加速，3-可加速与增产
  IconName: string; // 图标
}
*/

import { recipes, items } from "../data/Vanilla.json";
import { buildings, inserterSettings } from "../data/Buildings.json";
import { BlueprintBuilder, ROW_HEIGHT_1, ROW_HEIGHT_2 } from "./buleprint/builder";

const RAW_FACTORY = ["采矿机", "大型采矿机", "轨道采集器", "行星基地", "抽水站", "射线接收站", "原油萃取站"]; // 产出原矿的工石

const ITEM_NAME_MAP = items.reduce((a, b) => a.set(b.Name, b), new Map());
const ITEM_ID_MAP = items.reduce((a, b) => a.set(b.ID, b), new Map());
const RECIPE_ID_MAP = recipes.reduce((a, b) => a.set(b.ID, b), new Map());
const PRO_LIST = ["增产剂 Mk.I", "增产剂 Mk.IIf", "增产剂 Mk.III"];
const INSERTER_TYPE = ["分拣器", "高速分拣器", "极速分拣器", "集装分拣器"];
const BELT_LEVEL = ["传送带", "高速传送带", "极速传送带"];
const SMELTER = ["电弧熔炉", "位面熔炉", "负熵熔炉"];
const CHEMICAL = ["化工厂", "量子化工厂"];
const LAB = ["矩阵研究站", "自演化研究站"];
const STATION = "行星内物流运输站";
const HADRON_COLLIDER = "微型粒子对撞机";
const OIL_REFINERY = "原油精炼厂";
const BELT_SHARE_SIZE = [23, 47, 119]; // 传送带容量，理论最大值-1

const BUILDINGS_STRING = new Map();
for (const k in buildings) {
  BUILDINGS_STRING.set(k, JSON.stringify(buildings[k]));
}

/**
 * 计算需要的分拣器数量
 * @param {*} share
 */
function getInserterScheme(share, inserterLevel = 2) {
  const scheme = [];
  const settings = inserterSettings.filter((setting, i) => setting.level <= inserterLevel && i !== 7);
  if (share % 2 === 1) {
    share -= 3;
    scheme.push(inserterSettings[7]);
  }
  while (share > 0) {
    for (const setting of settings) {
      if (share >= setting.share) {
        scheme.push(setting);
        share -= setting.share;
        break;
      }
    }
  }
  return scheme.sort((a, b) => b.share - a.share);
}

/**
 * 将矩阵推入到矩阵中
 * @param {*} matrix
 * @param {*} matrix2
 */
function pushMatrix(matrix, buildings) {
  buildings.forEach((building) => {
    if (building.localOffset[0].x === -1 || building.localOffset[0].y === -1) {
      throw new Error("存在未初始化的建筑");
    }
    // 建筑的 x 和 y 是建筑的中心点，如果建筑的宽、高大于1，则将建筑的 x 和 y 作为建筑的中心点
    for (
      let x = Math[BELT_LEVEL.includes(building.itemName) ? "ceil" : "floor"](building.localOffset[0].x - building.attributes.area[0]);
      x < Math.ceil(building.localOffset[0].x + building.attributes.area[0]);
      x++
    ) {
      for (
        let y = Math[BELT_LEVEL.includes(building.itemName) ? "ceil" : "floor"](building.localOffset[0].y - building.attributes.area[1]);
        y < Math.ceil(building.localOffset[0].y + building.attributes.area[1]);
        y++
      ) {
        if (matrix[y][x] !== building) {
          if (matrix[y][x]) {
            BELT_LEVEL.includes(building.itemName) ? matrix[y][x].push(building) : matrix[y][x].unshift(building); // 传送带放最上
          } else {
            matrix[y][x] = [building];
          }
        }
      }
    }
  });
}

export function computeBlueprint({ allProduceUnits, surplusList, produces, beltType, sorterType, recycleType, rows, stackSize }) {
  try {
    const produceUnits = mergeProduceUnits(allProduceUnits, surplusList, produces);
    const { order, rawMaterial } = orderRecipe(produceUnits);
    console.log("原料:", rawMaterial);
    console.log("订单:", order);
    const buleprint = new MixedConveyerBeltBuleprint(
      Object.keys(produces)[0],
      Object.values(produces)[0],
      produceUnits,
      surplusList,
      order,
      rawMaterial,
      rows,
      beltType,
      sorterType,
      recycleType,
      stackSize
    );
    buleprint.compute();
    return buleprint;
  } catch (e) {
    console.error(e.stack);
    alert(e.message);
  }
}

export function generateBlueprint(buleprint) {
  try {
    const bp = new BlueprintBuilder("新蓝图", buleprint);
    const str = bp.toStr();
    // 将s加入到剪切板
    // navigator.clipboard.writeText(str);
    return str;
  } catch (e) {
    console.error(e.stack);
    alert(e.message);
  }
}

/**
 * 取整
 * @param {*} obj
 */
function round(obj) {
  for (const k in obj) {
    switch (typeof obj[k]) {
      case "number":
        obj[k] = Math.ceil(Number(obj[k].toFixed(2)));
        break;
      case "object":
        round(obj[k]);
        break;
    }
  }
}

/**
 * 配方排序
 * @param {*} produceUnits
 */
function orderRecipe(produceUnits) {
  const sortedItem = new Set(); // 已排序的配方包含的物品
  const sortRecipes = []; // 配方排序
  // 未排序的配方
  let unSortedRecipes = produceUnits.filter((unit) => unit.grossOutput > 0 && !unit.isMineralized).map((unit) => RECIPE_ID_MAP.get(unit.recipeId));
  const rawMaterial = {}; // 原料
  // 源矿加入已排序的配方
  produceUnits
    .filter((unit) => RAW_FACTORY.includes(unit.factory) || unit.isMineralized)
    .forEach((unit) => {
      sortedItem.add(ITEM_NAME_MAP.get(unit.item).ID);
      unit.grossOutput > 0 && (rawMaterial[unit.item] = unit.grossOutput);
    });
  while (unSortedRecipes.length) {
    const failRecipes = [];
    const lastUnSortedLength = unSortedRecipes.length;
    unSortedRecipes.forEach((recipe) => {
      if (recipe.Items.find((id) => !sortedItem.has(id))) {
        // 存在未排序的原料
        failRecipes.push(recipe);
      } else {
        // 所有原料都已排序，将产物加入到已排序
        recipe.Results.forEach((id) => sortedItem.add(id));
        sortRecipes.push(recipe);
      }
    });
    unSortedRecipes = failRecipes;
    console.log("unSortedRecipes:", lastUnSortedLength, unSortedRecipes.length);
    if (lastUnSortedLength === unSortedRecipes.length) {
      break;
    }
  }
  const order = sortRecipes.filter((r) => r.Type !== -1).reverse(); // Recipe， 过滤黑雾生成并倒序返回
  return { order, rawMaterial };
}

// 校验与整理
function mergeProduceUnits(allProduceUnits, surplusList = {}, produces) {
  if (Object.entries(produces).length !== 1) {
    throw new Error("只支持生产一种物品。");
  }
  const producePro = PRO_LIST.find((item) => produces[item]);
  if (!producePro && allProduceUnits.find((unit) => PRO_LIST.includes(unit.item) && !unit.isMineralized)) {
    throw new Error("必须将增产剂设置为原矿。");
  }
  if (Object.keys(surplusList).length > 1) {
    throw new Error("副产物只能有一种。");
  }
  round(allProduceUnits); // 取整，防止精度问题

  const unitH = allProduceUnits.find((unit) => unit.item === "氢");
  if (unitH) {
    const hasSurplusH = (unitH.grossOutput ? 1 : 0) + Object.entries(unitH.sideProducts || {}).length; // 两种以上氢来源，就认为有副产氢
    if (hasSurplusH > 1 && Object.keys(surplusList).length && !surplusList["氢"]) {
      throw new Error("氢有多种来源时，不能有副产物。");
    }
  }
  if (allProduceUnits.find((unit) => unit.factory === "分馏塔")) {
    throw new Error("分馏塔不能加入蓝图。");
  }
  allProduceUnits.forEach((unit) => {
    unit.recipeId = recipes[unit.recipe].ID; // 传入的 recipe 是下标，比ID少1，此处换为ID
  });
  return allProduceUnits;
}

/**
 * 图片蓝图生成器
 */
class MixedConveyerBeltBuleprint {
  recycleMode = 1; // 回收方式: 1-"集装分拣器"，2-"四向分流器"
  stackCount = 4; // 堆叠数量: 1 | 2 | 4
  inserterMixLevel = 2; // 输入混带的最高级别：0-分拣器，1-高速分拣器，2-极速分拣器, 3-集装分拣器
  proliferatorLevel = 0; // 喷涂：0-无，1-MK.1，2-MK.2，3-MK.3
  beltLevel = 2; // 传送带级别：0-黄带，1-绿带，2-蓝带
  multiple = 1; // 蓝图倍数
  height = 0; // 蓝图高度，固定值
  surplus; // 副产物，当氢有多个来源时，副产物就是氢
  surplusId; //
  surplusCount = 0; // 副产物溢出数量，负数表示不足，正数表示溢出，0表示刚好够用
  surplusJoinProduct = false; // 副产物是否参与生产
  extraBeltItem; // 额外传送带物品
  // 配方详情
  // 序号生成器
  // 计算供电站位置
  rowCount = 1; // 行数
  buildingsRow = []; // 建筑行数，一行一个数组。下标为行数，值为建筑单元，建筑的方向由所以的行数决定，下标是双行的1，单数数行为-1。
  // 传送带方向：1-逆时针，-1-顺时针

  produceUnits; // 生产单元
  rawMaterial; // 原料
  shareSize = 60; // 一份的大小
  produce; // 蓝图产物
  produceId; // 产物id
  produceCount; // 产物数量

  buildings = []; // 建筑单元
  stations = []; // 物流塔单元
  belt; // 传送带单元

  matrix; // 地图二维数组
  buildingsMap = new Map();

  constructor(
    produce, // string，蓝图生产目标物品
    produceCount,
    produceUnits,
    surplusList,
    order, // Recipe, 订单排序
    rawMaterial, // Record<string, number> 原矿列表
    rowCount = 1, // 行数
    beltType = 2, // 传送带级别：0-黄带，1-绿带，2-蓝带
    sorterType = 2, // 输入混带的最高级别：0-分拣器，1-高速分拣器，2-极速分拣器
    recycleType = 1, // 回收方式: 1-"集装分拣器"，2-"四向分流器"
    stackSize = 4 // 堆叠数量: 1 | 2 | 4
  ) {
    this.produce = produce;
    this.produceId = ITEM_NAME_MAP.get(produce).ID;
    this.produceCount = produceCount;
    this.produceUnits = produceUnits;
    this.rawMaterial = rawMaterial;
    this.rowCount = rowCount;
    this.beltLevel = beltType;
    this.inserterMixLevel = recycleType === 1 ? 3 : sorterType;
    this.recycleMode = recycleType;
    this.stackCount = stackSize;
    this.proliferatorLevel = Math.min(
      produceUnits.reduce((a, b) => Math.max(a, b.proNum), 0),
      3
    ); // 选择的喷涂级别没有3，4为MK.III，修改为3
    this.belt = new BeltUnit(this);
    this.shareSize = this.stackCount * 15; // 一份的容量

    const produceMap = produceUnits.filter((unit) => unit.grossOutput > 0).reduce((a, b) => a.set(b.recipeId, b), new Map());
    this.buildings = order.map((recipe) => new BuildingUnit(this, recipe, produceMap.get(recipe.ID)));

    // 计算副产，明面的副产
    for (const item in surplusList) {
      this.surplus = item;
      this.surplusCount = Math.round(Number(surplusList[item]));
    }
    // 无副产：氢有多种来源，氢单一来源
    const unitH = produceUnits.find((unit) => unit.item === "氢");
    if (!this.surplus && unitH) {
      if ((unitH.grossOutput ? 1 : 0) + Object.entries(unitH.sideProducts || {}).length > 1) {
        // 两种以上氢来源，就认为有副产氢
        this.surplus = "氢";
        if (unitH.grossOutput) {
          // 不足，需要补氢，只有氢是副产时才需要考虑补充
          this.surplusCount = unitH.grossOutput - unitH.theoryOutput;
        } else {
          // 正好足够
          this.surplusCount = 0;
        }
      }
    }

    if (this.surplus) {
      // 有副产，加带子
      this.surplusId = ITEM_NAME_MAP.get(this.surplus).ID;
      this.extraBeltItem = this.surplus;
      const surplusID = ITEM_NAME_MAP.get(this.surplus).ID;
      const surplusUnits = produceUnits.filter((unit) => RECIPE_ID_MAP.get(unit.recipeId).Items.includes(surplusID));
      this.surplusJoinProduct = surplusUnits.length > 0;
    }

    // 副产是否参与生产
    console.log(`副产: ${this.surplus}, 副产数量:${this.surplusCount}, 副产参与生产:${this.surplusJoinProduct}, 外加带子:${this.extraBeltItem}`);

    // 物流塔物品种类数：喷涂 + 产出 + 副产 + 原矿 ...
    const stationItems = [
      this.proliferatorLevel > 0
        ? {
            item: PRO_LIST[this.proliferatorLevel - 1],
            type: 2,
          }
        : {
            type: 2,
          }, //第一个固定是喷涂，如果未选择喷涂留空
      { item: produce, type: 1 },
    ]; // {item, type}, 物流塔，type 1-需求，2供应
    // 加入副产
    if (this.surplus && this.surplusCount !== 0) {
      stationItems.push({
        item: this.surplus,
        type: this.surplusCount > 0 ? 1 : 2, // 氢溢出时供应
      });
    }
    // 加入原矿
    for (const item in rawMaterial) {
      item !== this.surplus &&
        !PRO_LIST.includes(item) &&
        stationItems.push({
          item,
          type: 2,
        });
    }
    // 分配物流塔
    for (let i = 0; i < stationItems.length; i += 4) {
      this.stations.push(new StationUnit(this, stationItems.slice(i, i + 4), this.stations.length));
    }
  }

  /**
   * 计算利用率
   */
  compute() {
    this.belt.compute();
    console.log("传送带利用率：", this.belt.beltUsageRate);
    this.stations.forEach((station) => station.compute());
    this.buildings.forEach((building) => building.compute());
    // 将建筑分配到行：物流站必须在第一行，一个建筑单元不可跨行
    // 分配原则：先计算总宽度，除以行数向上取整是一行的最大宽度
    // 当超过宽度时，此行结束，下一个建筑从下一行开始
    const totalWidth = this.stations.reduce((a, b) => a + b.width, 0) + this.buildings.reduce((a, b) => a + b.width, 0);
    for (let i = 0; i < this.rowCount; i++) {
      this.buildingsRow.push([]);
    }
    let aggWidth = totalWidth / this.rowCount;
    let i = 0,
      rowWidth = 0;
    this.buildingsRow[0].unshift(...this.stations);
    rowWidth = this.stations.reduce((a, b) => a + b.width, 0);
    if (rowWidth > aggWidth) {
      console.log(`第${i}行，宽度：${rowWidth}, aggWidth:${aggWidth}, 建筑：`, this.buildingsRow[i]);
      aggWidth = (aggWidth + rowWidth) / 2;
      i++;
      rowWidth = 0;
    }
    this.buildings.forEach((building) => {
      building.setDirection(i); //
      this.buildingsRow[i].unshift(building);
      rowWidth += building.width;
      if (rowWidth > aggWidth) {
        console.log(`第${i}行，宽度：${rowWidth}, aggWidth:${aggWidth}, 建筑：`, this.buildingsRow[i]);
        aggWidth = (aggWidth + rowWidth) / 2;
        i++;
        rowWidth = 0;
      }
    });
    console.log(`第${i}行，宽度：${rowWidth}, aggWidth:${aggWidth}, 建筑：`, this.buildingsRow[i]);
  }

  /**
   * 获取建筑蓝图信息
   * @param {*} name
   */
  createBuildingInfo(matrix, name, localOffset = { x: 0, y: 0, z: 0 }) {
    const building = JSON.parse(BUILDINGS_STRING.get(name));
    building.localOffset[0].x = localOffset.x;
    building.localOffset[0].y = localOffset.y;
    building.localOffset[0].z = localOffset.z ?? 0;
    this.buildingsMap.set(`${name}-${localOffset.x}-${localOffset.y}-${localOffset.z}`, building);
    pushMatrix(matrix, [building]);
    return building;
  }

  // 查询建筑
  getBuildingInfo(name, localOffset = { x: 0, y: 0, z: 0 }) {
    const key = `${name}-${localOffset.x}-${localOffset.y}-${localOffset.z}`;
    if (this.buildingsMap.has(key)) {
      return this.buildingsMap.get(key);
    }
  }

  /**
   * 生成地图二维数组
   */
  generate() {
    // 1. 物流塔、输出传送带
    // 2. 工厂建筑、输出传送带
    // 3. 总线传送带
    // 4. 喷涂机
    // 5. 电线杆
    // 5. 工厂输入分拣器
    // 6. 工厂输出分拣器
    // 8. 传送带对接总线
    // 右上角是坐标(0,0)，建筑坐标是建筑右上角的起点
    // 区域大小为从右上角开始到最左侧建筑的开始点，到最下侧建筑的开始点，区域大小是左下建筑开始点 x+1, y+1
    // localOffset 是建筑的起点与终点，只对传送带、分拣器有效

    // 找到最长的行
    const maxWidth = this.buildingsRow.map((unit) => unit.reduce((a, b) => a + b.width, 0)).reduce((a, b) => Math.max(a, b), 0);
    const matrixBlock = this.buildingsRow.map((buildings) => {
      // 初始化一行 12 x maxRow 的二维数组
      const length = this.recycleMode === 1 ? ROW_HEIGHT_1 : ROW_HEIGHT_2;
      const rowMatrix = Array.from({ length }, () => Array(maxWidth).fill(null));
      this.belt.beltLinks = []; // 清空环线带子
      let beginX = 0;
      buildings.forEach((building) => {
        building.generateDownstream(rowMatrix, beginX); // 生成下游传送带，需要从左向右生成
        building.generate(rowMatrix, beginX);
        building.generateSurplusBelt(rowMatrix, beginX); // 生成副产传送带
        beginX += building.width;
      });
      for (let i = buildings.length - 1; i >= 0; i--) {
        const building = buildings[i];
        beginX -= building.width;
        building.generateUpstream(rowMatrix, beginX); // 生成上游传送带，需要从右向左生成
        if (building.produce?.item === this.produce) {
          building.generateProductBelt(rowMatrix, beginX); // 最终产物
        }
      }
      return rowMatrix;
    });

    // 每一行坐标都是从0计算，然后合并到 matrix 中时增加偏移量即可。
    const matrix = [];

    matrixBlock.forEach((rowMatrix, i) => {
      matrix.push(...rowMatrix);
      rowMatrix.forEach((row) =>
        console.log(
          row
            .map((factory) => {
              if (!factory) {
                return "口";
              }
              if (factory.length) {
                return factory[0]?.itemName?.[0] || "口";
              }
              return factory?.itemName?.[0] || "口";
            })
            .join("")
        )
      ); // 打印一行
      console.log(`===============${i}===================`);
    });
    return matrix;
  }
}

/**
 * 建筑单元
 */
class BuildingUnit {
  buleprint;
  factoryId;
  itemId;
  factoryInfo;
  inserters = [];
  factories = []; // 建筑列表
  width;
  // 角度
  // 位置: x, y
  // width，只要宽度即可，高度固定，由蓝图决定
  // 计算输入物品位置
  // 输出物品：
  // 计算输出物品位置
  // 副产品：物品、数量
  // 计算副产品输出位置，蓝图有副产，输出到物流塔，否则输出到传送带
  // 增产 | 加速
  direction = 1; // 方向：1-逆时针，-1-顺时针
  // 单元内传送带和建筑的方向相反时，为镜像反向
  recycleMode = 1; // 回收方式: 1-"集装分拣器"，2-"四向分流器" //
  recipe; // 配方： Recipe
  produce; // 生产要素:ProduceUnit
  constructor(buleprint, recipe, produce) {
    this.buleprint = buleprint;
    this.recipe = recipe;
    this.produce = produce;
    this.factoryId = ITEM_NAME_MAP.get(produce.factory).ID;
    this.itemId = ITEM_NAME_MAP.get(produce.item).ID;
    this.factoryInfo = buildings[this.produce.factory];

    console.log(
      `生产 ${produce.item}[${this.itemId}] ${produce.theoryOutput}个 需 ${produce.factory}[${this.factoryId}] ${
        produce.factoryNumber
      }个，原料：${recipe.Items.join()}, 产出：${recipe.Results.join()}`
    );
  }

  setDirection(rowNumber) {
    this.direction = rowNumber % 2 === 0 ? 1 : -1;
  }

  compute() {
    this.inserters = getInserterScheme(Math.ceil(this.produce.grossOutput / this.buleprint.shareSize), this.buleprint.inserterMixLevel);
    this.itemId = ITEM_NAME_MAP.get(this.produce.item).ID;
    // 计算宽度
    if (this.buleprint.recycleMode === 1) {
      this.width = this.produce.factoryNumber * buildings[this.produce.factory].attributes.area[0] * 2; // 建筑宽
      if (LAB.includes(this.produce.factory)) {
        this.width = buildings[this.produce.factory].attributes.area[0] * 2; // 研究站可堆叠
      } else if (["原油精炼厂", ...SMELTER, ...CHEMICAL].includes(this.produce.factory) && this.recipe.Results.includes(this.buleprint.produceId)) {
        // 是最终产物时
        this.width += 1;
      } else if (this.produce.item !== this.buleprint.produce) {
        this.width += this.inserters.length; // 加分拣器宽度
      }
      this.width += 1; // 加1格输入到总线
    } else {
      this.width = this.buleprint.width * 2;
    }

    console.log(`建筑：${this.produce.factory}, 输出：${this.produce.item}, 副产：${this.buleprint.surplus}, 宽度：${this.width}, 分拣器：`, this.inserters);
  }

  // 生成研究站
  generateLab(matrix, beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let begin = beginX;
    // 生成建筑
    let lastFactory;
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.buleprint.createBuildingInfo(matrix, this.produce.factory, {
        x: begin + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: beginY + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
        z: this.factoryInfo.attributes.area[2] * i, // 建筑高度
      });
      if (lastFactory) {
        factoryObj.inputObjIdx = lastFactory; // 输入
      }
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      lastFactory = factoryObj;
    }
    beginY += this.factoryInfo.attributes.area[1] * 2;

    this.generateOutputBelt(matrix, beginX, beginY, ["z", "x", "y"], "x"); // 生成回路
    // 生成分拣器
  }

  // 生成粒子对撞机
  generateHadronCollider(matrix, beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let begin = beginX + 1;
    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // beginX += 1; // 左侧有1格空隙
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.buleprint.createBuildingInfo(matrix, this.produce.factory, {
        x: begin + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: beginY + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      begin += factoryObj.attributes.area[0] * 2 + 1;
    }
    beginY += this.factoryInfo.attributes.area[1] * 2 + 1;
    this.generateOutputBelt(matrix, beginX, beginY, ["z", "x", "y"], "x", 1); // 生成回路
    //副产回收
    if (this.getSurplus()) {
      const y = (this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 : ROW_HEIGHT_2) - 1; // 总线点结束
      this.factories.forEach((factory, index) => {
        this.buleprint.belt.generateBelt(
          matrix,
          { x: beginX + index * (factory.attributes.area[0] * 2 + 1), y: 4, z: 0 },
          { x: beginX + index * (factory.attributes.area[0] * 2 + 1), y, z: this.buleprint.belt.belts.length + 1, outputToSlot: 2 },
          ["y", "z", "x"],
          "y",
          2
        );
      });
    }
    // 生成分拣器
  }

  // 生成原油精炼厂
  generateOilRefinery(matrix, beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let begin = beginX;
    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.buleprint.createBuildingInfo(matrix, this.produce.factory, {
        x: begin + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: beginY + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      begin += factoryObj.attributes.area[0] * 2;
    }
    beginY += this.factoryInfo.attributes.area[1] * 2 + 1;
    this.generateOutputBelt(matrix, beginX, beginY); // 生成回路
    //副产回收
    if (this.getSurplus()) {
      const y = (this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 : ROW_HEIGHT_2) - 1; // 总线点结束
      this.buleprint.belt.generateBelt(
        matrix,
        { x: beginX + 3, y: beginY + 1, z: 0 },
        { x: beginX + this.width - 2, y: y, z: this.buleprint.belt.belts.length + 1, outputToSlot: 2 },
        ["x", "z", "y"],
        "x"
      );
    }
    // 生成分拣器
  }

  // 生成化工厂
  generateChemicalPlant(matrix, beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let begin = beginX;
    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.buleprint.createBuildingInfo(matrix, this.produce.factory, {
        x: begin + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: beginY + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      begin += factoryObj.attributes.area[0] * 2;
    }
    beginY += this.factoryInfo.attributes.area[1] * 2 + 1;
    this.generateOutputBelt(matrix, beginX, beginY, ["y", "z", "x"], "x"); // 生成回路
    //副产回收
    if (this.getSurplus()) {
      const y = (this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 : ROW_HEIGHT_2) - 1; // 总线点结束
      this.buleprint.belt.generateBelt(
        matrix,
        { x: beginX + 3, y: beginY + 1, z: 0 },
        { x: beginX + this.width - 2, y: y, z: this.buleprint.belt.belts.length + 1, outputToSlot: 2 },
        ["x", "z", "y"],
        "x"
      );
    }

    // 生成分拣器
  }

  // 熔炉、制造台
  generateDefault(matrix, beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let begin = beginX;
    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.buleprint.createBuildingInfo(matrix, this.produce.factory, {
        x: begin + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: beginY + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      begin += factoryObj.attributes.area[0] * 2;
    }
    beginY += this.factoryInfo.attributes.area[1] * 2;
    if (SMELTER.includes(this.produce.factory)) {
      beginY += 1; // 熔炉需要多1格
    }

    this.generateOutputBelt(matrix, beginX, beginY); // 生成回路
    // 生成分拣器
  }

  /**
   * 生成主产物回路
   * @param {*} matrix
   * @param {*} beginX
   * @param {*} beginY
   * @param {*} priority 输入总线的带子优先级
   * @param {*} zDirection 输入总线的带子方向
   * @param {*} interval 建筑之间的间隔，对撞机为1，其它是0
   */
  generateOutputBelt(matrix, beginX, beginY, priority = ["z", "y", "x"], zDirection = "y", interval = 0) {
    // 生成回路
    if (this.produce.item === this.buleprint.produce) {
      this.buleprint.belt.generateBelt(matrix, { x: beginX + 1, y: beginY, z: 0 }, { x: beginX + this.width - 1, y: beginY, z: 0 }); // 最终产物进塔的第4个槽
    } else {
      const y = (this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 : ROW_HEIGHT_2) - 2; // 总线下方一格开始
      const z = this.buleprint.belt.getBeltIndex(this.getProduce().Name) + 1; // 从总线回收的带子，产物所在带子的z轴
      this.buleprint.belt.generateBelt(matrix, { x: beginX + 1, y, z }, { x: beginX + this.width - 1, y: beginY, z: 0 }, priority, zDirection);
      this.buleprint.belt.generateBelt(
        matrix,
        { x: beginX + this.width - this.inserters.length + this.factories.length * interval - 1, y: beginY - 3, z: 0 }, // x:建筑右侧开始, y:建筑输出位置为第4格, z: 0
        { x: beginX + this.width, y: y + 1, z, outputToSlot: 2 }, // 连接到总线
        ["x", "z", "y"], // 先横向
        "y" // 延y轴方向上升
      );
    }
  }

  // 最终产物进塔
  generateProductBelt(matrix, beginX) {
    let beginY = 6;
    if (LAB.includes(this.produce.factory)) {
      beginY = 8;
    } else if (CHEMICAL.includes(this.produce.factory)) {
      beginY = 7;
    } else if (HADRON_COLLIDER === this.produce.factory) {
      beginY = 8;
    }
    this.buleprint.belt.generateBelt(
      matrix,
      { x: beginX + this.width - 1, y: beginY, z: 0 },
      { x: beginX + this.width + this.buleprint.stations[0].getLeftWidth(), y: 5, z: 0, stationSlot: 4 },
      ["y", "x", "z"]
    ); // 最终产物进塔的第4个槽
  }

  // 生成下游传送带
  generateDownstream(matrix, beginX) {
    const y = this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 - 1 : ROW_HEIGHT_2 - 1;
    for (let z = 0; z < this.buleprint.belt.belts.length; z++) {
      for (let x = 1; x <= this.width; x++) {
        this.buleprint.belt.createBelt(matrix, z, { x: beginX + x, y, z: z + 1 });
      }
    }
  }

  // 生成上游传送带
  generateUpstream(matrix, beginX) {
    for (let y = 0; y < this.buleprint.belt.belts.length; y++) {
      for (let x = this.width - 1; x >= 0; x--) {
        this.buleprint.belt.createBelt(matrix, y + this.buleprint.belt.belts.length, { x: beginX + x, y: 2 - y, z: 0 });
      }
    }
  }

  // 生成副产带子
  generateSurplusBelt(matrix, beginX) {
    // if (!surplusBeltCreated) {
    //   // 副产带子起点
    //   if (this.produce.factory === "微型粒子对撞机") {
    //     beginX = this.width - 1;
    //   } else {
    //     beginX = this.width - 1;
    //   }
    // }
    if (this.buleprint.surplus) {
      const y = this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 - 1 : ROW_HEIGHT_2 - 1;
      const z = this.buleprint.belt.belts.length + 1;
      for (let x = 0; x < this.width; x++) {
        this.buleprint.belt.createBelt(matrix, z + this.buleprint.belt.belts.length, { x: beginX + x, y, z }); // 副产带子在最后
      }
    }
  }
  // 生成建筑
  generate(matrix, beginX) {
    let beginY = 2; // 建筑从3开始，由于计算偏移时会向上取整，所以虽然是第4行，但是仍然从3开始
    switch (this.produce.factory) {
      case "矩阵研究站":
      case "自演化研究站":
        this.generateLab(matrix, beginX, beginY);
        break;
      case "微型粒子对撞机":
        this.generateHadronCollider(matrix, beginX, beginY);
        break;
      case "原油精炼厂":
        this.generateOilRefinery(matrix, beginX, beginY);
        break;
      case "化工厂":
      case "量子化工厂":
        this.generateChemicalPlant(matrix, beginX, beginY);
        break;
      default:
        this.generateDefault(matrix, beginX, beginY);
    }
  }

  getProduce() {
    return ITEM_ID_MAP.get(this.recipe.Results.find((id) => ITEM_ID_MAP.get(id).Name !== this.buleprint.surplus));
  }

  getSurplus() {
    if (this.recipe.Results.includes(this.buleprint.surplusId)) {
      return ITEM_ID_MAP.get(this.buleprint.surplusId);
    }
  }
}

/**
 * 物流塔单元
 */
class StationUnit {
  buleprint;
  stationIndex;
  stationId = 2103; // 物流塔id
  stationObj; // 物流塔信息
  requireItems = []; // 需求列表
  provideItems = []; // 供应列表
  items = [];
  // 是否有物流塔
  // 配方
  // 建筑名稱
  // id
  // 角度
  // 位置: x, y
  width;
  // 配方
  // 输入物品：物品、数量
  // 计算输入物品位置
  // 输出物品：
  // 输出物品位置：
  //  第一个塔时：1-左上-喷涂剂、2-左中为主产物不，3-左下和右下都处理副产，4-右上
  //  不是第一个；1-左上、2-左下、3-右下、4-右上
  constructor(buleprint, items, stationIndex) {
    // todo：蓝图计算物流塔分配，StationUnit 只负责生成建筑
    this.stationIndex = stationIndex;
    this.buleprint = buleprint;
    this.items = items;
    items.filter((item) => item.item).forEach((item) => (item.type === 2 ? this.requireItems.push(item) : this.provideItems.push(item)));
  }

  // 是否有喷涂剂
  hasProliferator() {
    return this.buleprint.proliferatorLevel > 0;
  }

  getLeftWidth() {
    if (this.buleprint.recycleMode === 1) {
      if (this.stationIndex === 0) {
        // 第一个塔左上为喷涂、左中为主产物，左下为副产；固定有喷涂剂。
        const proliferatorWidth = this.hasProliferator() ? 5 : 0; // 喷涂机宽度
        const masterWidth = 1; // 主产物
        let surplusWidth = 0; // 副产占用宽度，默认无时为0
        if (this.buleprint.surplusJoinProduct) {
          // 副产参与生产
          surplusWidth = this.items[2].inserter.length + 2; // 第3个就是副产
          if (this.buleprint.surplusCount < 0) {
            // 副产不够时，左侧需要加1；副产够的话从右下入塔，因此不占左侧输入
            surplusWidth += 1;
          } // else：副产正好与溢出时不需要增加
        } // else if (!this.buleprint.surplusJoinProduct && this.buleprint.surplus) // 副产不参与生产，直接从右下入塔
        return Math.max(proliferatorWidth, masterWidth, surplusWidth);
      } else {
        // 不是第一个塔，按前两个出口的最大长度
        const top = this.items[0].inserter.length + 2;
        const bottom = this.items.length > 1 ? this.items[1].inserter.length + 2 : 0;
        return Math.max(top, bottom);
      }
    } else {
      console.log("todo ...");
    }
  }

  getRightWidth() {
    if (this.buleprint.recycleMode === 1) {
      const top = this.items.length > 3 ? this.items[3].inserter.length + 2 : 0;
      if (this.stationIndex === 0 && this.buleprint.surplus) {
        // 有副产，都从右下回收，宽度是1，可以直接返回第4个产物的宽度
        return Math.max(top, 1);
      }
      // 否则，按最后两个产物的最大长度
      let bottom = this.items?.[2]?.type === 1 ? this.items[2].inserter.length + 2 : 0;
      if (this.stationIndex === 0 && this.items?.[2]?.item === this.buleprint.surplus) {
        // 副产不参与生产，从右下入塔
        bottom = 1;
      }
      return Math.max(top, bottom);
    } else {
      console.log("todo ...");
    }
  }

  // 计算
  compute() {
    this.requireItems
      .filter((item) => !PRO_LIST.includes(item.item))
      .forEach((item) => (item.inserter = getInserterScheme(this.buleprint.belt.itemMap[item.item], this.buleprint.inserterMixLevel)));
    this.provideItems
      .filter((item) => item.item !== this.buleprint.produce) // 主产物不分配分拣器
      .forEach((item) => (item.inserter = getInserterScheme(this.buleprint.belt.itemMap[item.item], this.buleprint.inserterMixLevel)));
    this.width = this.getLeftWidth() + 8 + this.getRightWidth();
    console.log(
      `物流塔 ${this.stationIndex} 宽 ${this.width}-(${this.getLeftWidth()}, ${this.getRightWidth()}) 需求：`,
      this.requireItems,
      "，供应：",
      this.provideItems
    );
  }

  // 生成上游传送带
  generateUpstream(matrix, beginX) {
    let branchEnd = 0;
    if (this.stationIndex === 0) {
      // 第一个塔需要将总线分叉并下沉到1层
      // 从右往左生成，最后5格为喷涂机，然后是3格带子，之后全是直带
      branchEnd = (this.buleprint.proliferatorLevel > 0 ? 5 : 0) + 3;
    }

    const y = 1;
    for (let z = 0; z < this.buleprint.belt.belts.length; z++) {
      for (let x = this.width - 1; x >= branchEnd - 1; x--) {
        this.buleprint.belt.createBelt(matrix, z + this.buleprint.belt.belts.length, { x: beginX + x, y, z: z + 1 });
      }
    }
    if (this.stationIndex === 0) {
      this.buleprint.belt.belts.forEach((_, z) => {
        this.buleprint.belt.connectBelt(matrix, z + this.buleprint.belt.belts.length, { x: beginX + branchEnd - 3 - 1, y: 2 - z, z: 0 }, ["y", "z", "x"]);
      });
    }
  }

  // 生成下游，从左到右生成
  generateDownstream(matrix, beginX) {
    const y = this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 - 1 : ROW_HEIGHT_2 - 1;
    for (let z = 0; z < this.buleprint.belt.belts.length; z++) {
      for (let x = 0; x < this.width; x++) {
        this.buleprint.belt.createBelt(matrix, z, { x: beginX + x, y, z: z + 1 });
      }
    }
  }

  // 生成副产带子
  generateSurplusBelt(matrix, beginX) {
    if (this.stationIndex === 0 && this.buleprint.surplus) {
      // 副产不参与生产，从右下入塔
      const y = (this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 : ROW_HEIGHT_2) - 4;
      const [belt] = this.buleprint.belt.createBelt(matrix, this.buleprint.belt.belts.length * 2 + 1, {
        x: beginX,
        y: (this.buleprint.recycleMode === 1 ? ROW_HEIGHT_1 : ROW_HEIGHT_2) - 1,
        z: this.buleprint.belt.belts.length + 1,
      });
      this.buleprint.belt.generateBelt(matrix, belt.localOffset[0], { x: beginX + this.getLeftWidth(), y, z: 0, stationSlot: 3 }, ["z", "y", "x"], "y");
    }
  }
  generate(matrix, beginX) {
    let beginY = 1; // 物流塔从1开始，由于计算偏移时会向上取整，所以虽然是第2行，但是仍然从1开始
    let stationBeginX = beginX + this.getLeftWidth();
    // 生成建筑
    const stationInfo = buildings[STATION];
    this.stationObj = this.buleprint.createBuildingInfo(matrix, stationInfo.itemName, {
      x: stationBeginX + Math.ceil(stationInfo.attributes.area[0]), // 建筑宽度一半向上取整;
      y: beginY + Math.ceil(stationInfo.attributes.area[1]), //建筑中心点，建筑高度的一半
    });
    // 设置配方
    this.items.forEach((item, i) => {
      if (item.item) {
        this.stationObj.parameters.storage[i].itemId = ITEM_NAME_MAP.get(item.item).ID;
        this.stationObj.parameters.storage[i].localRole = item.type;
        this.stationObj.parameters.storage[i].max = 5000;
      }
    });
    // 生成下方传送带，下方是上游，从右到左生成
    // 生成分拣器
    // 生成回路
  }
}

/**
 * 环带总线传送带单元
 */
class BeltUnit {
  buleprint;
  beltUsageRate = 0; // 带子使用率，0-100
  belts = []; // 传送带分配记录，每条带子是一个 Map<item, share>
  itemMap = {}; // 每个物品的份数：{ item, share }
  beltLinks = []; // 记录环带的连接关系，一条带子一个对象，总线的带子要形成环线。生成环线时，将新生成的对象加入到矩阵，并将新对象覆盖到旧对象

  constructor(buleprint) {
    this.buleprint = buleprint;
  }

  compute() {
    const filterItems = [this.buleprint.produce]; //过滤增产和主产物，副产物不为氢时从总线中回收
    if (!PRO_LIST.includes(this.buleprint.produce)) {
      // 不生产增产剂时，无需将增产剂加入到总线中
      filterItems.push(...PRO_LIST);
    }
    const items = this.buleprint.produceUnits // 传送带上的一份物品
      .filter((unit) => !filterItems.includes(unit.item) && unit.item !== this.buleprint.produce)
      .map((unit) => {
        if (unit.item === this.buleprint.surplus) {
          // 有副产参与生产时，总线只记录需求的数量
          if (this.buleprint.surplusJoinProduct) {
            return {
              item: unit.item,
              share: Math.max(
                Math.ceil((unit.theoryOutput - (this.buleprint.surplusCount > 0 ? this.buleprint.surplusCount : 0)) / this.buleprint.shareSize),
                2
              ), // 减去溢出部分是总线上的数量
            };
          }
        } else {
          return {
            item: unit.item,
            share: Math.max(Math.ceil(unit.theoryOutput / this.buleprint.shareSize), 2), // 最小是2份
          };
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.share - a.share);
    const beltSize = BELT_SHARE_SIZE[this.buleprint.beltLevel]; // 单条带子最大值
    if (items.length / beltSize > 3) {
      // 物品数不能超过3个传送带
      throw new Error("中间产物种类数量超过传送带最大容量。");
    }
    this.buleprint.multiple = Math.ceil(items[0].share / beltSize);
    if (this.buleprint.multiple > 1) {
      // todo: 未来再考虑支持多份蓝图的情况
    }
    const shareCount = items.reduce((a, b) => a + b.share, 0);
    const beltCount = Math.ceil(shareCount / beltSize);
    if (beltCount > 3) {
      throw new Error("中间产物数量超过传送带最大容量。");
    }
    const beltUsage = [];
    const beltItems = []; // item[][]
    for (let i = 0; i < beltCount; i++) {
      beltItems.push([]);
      beltUsage.push(0);
    }
    // 分配物品到传送带
    items.forEach((item) => {
      let allocate = false;
      for (let i = 0; i < beltUsage.length; i++) {
        // 优先分到内侧
        if (beltUsage[i] + item.share <= beltSize) {
          beltItems[i].push(item);
          beltUsage[i] += item.share;
          allocate = true;
          break;
        }
      }
      if (!allocate) {
        throw new Error("中间产物数量超过传送带最大容量。");
      }
      this.itemMap[item.item] = item.share;
    });
    console.log("itemMap:", this.itemMap);
    this.belts = beltItems.map((belt) => new Map(belt.map((item) => [item.item, item.share])));
    console.log("总线分布：", this.belts);

    const itemsCount = this.buleprint.produceUnits.filter((unit) => !filterItems.includes(unit.item)).reduce((a, b) => a + b.theoryOutput, 0);
    // 传送带利用率：总物品数
    this.beltUsageRate = ((itemsCount / this.buleprint.multiple / (beltCount * beltSize * this.buleprint.shareSize)) * 100).toFixed(2);
  }

  /**
   * 返回物品所在带子的序号
   * @param {*} item
   */
  getBeltIndex(item) {
    if (typeof item === "number") {
      item = ITEM_ID_MAP.get(item).Name;
    }
    for (let i = 0; i < this.belts.length; i++) {
      if (this.belts[i].has(item)) {
        return i;
      }
    }
    throw new Error(`物品 ${item} 不存在于总线中`);
  }

  /**
   * 生成一个新带子，加入到环线
   * @param {*} i
   * @returns
   */
  createBelt(matrix, i, localOffset) {
    const belt = this.buleprint.createBuildingInfo(matrix, BELT_LEVEL[this.buleprint.beltLevel], localOffset);
    const last = this.beltLinks[i];
    if (last) {
      // 不是环线带起点时，连接到上一个带子
      last.outputObjIdx = belt;
    }
    this.beltLinks[i] = belt;

    return [belt, last];
  }

  /**
   * 生成带子
   * @param {*} matrix
   * @param {*} begin {x, y, z, stationSlot, storageIdx} 从物流塔输出时，stationSlot 和 storageIdx 有值
   * @param {*} end {x, y, z, stationSlot, outputToSlot} 输入到物流塔时，stationSlot 有值
   * @param {*} priority ['x', 'y', 'z']
   * @param {*} zDirection 'z'
   * @param {*} zDirectForward 升降提前几格
   */
  generateBelt(matrix, begin, end, priority = ["x", "y", "z"], zDirection = "x", zDirectForward = 1) {
    let current = begin;
    const belts = [];
    let zDirectionAdded = false;
    let lastDirection = priority[0]; // 上一次的方向
    let tmpI;
    let belt;
    let last =
      this.buleprint.getBuildingInfo(BELT_LEVEL[this.buleprint.beltLevel], begin) ||
      this.buleprint.createBuildingInfo(matrix, BELT_LEVEL[this.buleprint.beltLevel], begin); // 起点
    for (let i of priority) {
      while (Math.round(current[i]) !== Math.round(end[i])) {
        tmpI = i;
        if (i === "z" && !zDirectionAdded) {
          tmpI = zDirection;
          zDirectionAdded = true;
        }
        if (
          priority[1] === "z" &&
          tmpI === priority[0] &&
          priority[0] === zDirection &&
          Math.round(Math.abs(current[tmpI] - end[tmpI])) === zDirectForward &&
          Math.round(current["z"]) !== Math.round(end["z"])
        ) {
          // 如果是在第1优先级的方向上升降，需要提前1格进行
          tmpI = "z";
          zDirectionAdded = true;
        }
        const cursorOffset = Object.assign({}, last.localOffset[0]);
        if (Math.round(current[tmpI]) > Math.round(end[tmpI])) {
          cursorOffset[tmpI] = Math.round(cursorOffset[tmpI] - 1);
        } else if (Math.round(current[tmpI]) < Math.round(end[tmpI])) {
          cursorOffset[tmpI] = Math.round(cursorOffset[tmpI] + 1);
        }
        belt =
          this.buleprint.getBuildingInfo(BELT_LEVEL[this.buleprint.beltLevel], cursorOffset) ||
          this.buleprint.createBuildingInfo(matrix, BELT_LEVEL[this.buleprint.beltLevel], cursorOffset);
        last.outputObjIdx = belt;
        if (tmpI !== "z" && i !== "z" && lastDirection !== i) {
          // 带子转弯
          belt.yaw = last.yaw = [315, 315];
        }
        if (tmpI === "z") {
          // 增加偏移
          if (last.localOffset[0].z > belt.localOffset[0].z) {
            // 下降
            last.localOffset[0][zDirection] += last.localOffset[0].z * 0.0017;
          } else {
            // 上升
            belt.localOffset[0][zDirection] += belt.localOffset[0].z * 0.0017;
          }
        }
        belts.push(belt);
        current = belt.localOffset[0];
        lastDirection = tmpI === "z" ? lastDirection : tmpI;
        last = belt;
      }
    }
    if (end.outputToSlot != null) {
      // 结束点是传送带
      belts[belts.length - 2].outputToSlot = 2;
    } else if (end.stationSlot != null) {
      // 结束点是物流塔
      const station = matrix[end.y][end.x].find((item) => item.itemName === STATION);
      console.log(station);
      if (station) {
        const belt1 = this.buleprint.createBuildingInfo(matrix, BELT_LEVEL[this.buleprint.beltLevel], {
          x: end.x + 1,
          y: end.y,
          z: end.z,
        });
        belt.outputObjIdx = belt1;
        const belt2 = this.buleprint.createBuildingInfo(matrix, BELT_LEVEL[this.buleprint.beltLevel], {
          x: end.x + 2,
          y: end.y,
          z: end.z,
        });
        belt1.outputObjIdx = belt2;
        belt2.outputObjIdx = station;
        belt2.outputToSlot = end.stationSlot; // 传送带的输出槽要对应物流塔的输入槽
        station.parameters.slots[end.stationSlot].dir = 2;
      }
    }
    return belts;
  }

  /**
   * 连接传送带
   * @param {*} linkIndex 总线序号
   * @param {*} end 结束坐标 {x, y, z}
   * @param {*} priority 优先级 ['x', 'y', 'z']
   * @param {*} zDirection Z 轴下沉时的方向，通常是优先级最低的方向
   */
  connectBelt(matrix, linkIndex, end, priority, zDirection = "x") {
    const begin = this.beltLinks[linkIndex].localOffset[0];
    let current = begin;
    const belts = [];
    let zDirectionAdded = false;
    let tmpI;
    let lastDirection; // 上一次的方向
    for (let i of priority) {
      console.log("priority:", i, JSON.stringify(current), JSON.stringify(end));
      while (Math.round(current[i]) !== Math.round(end[i])) {
        tmpI = i;
        if (i === "z" && !zDirectionAdded) {
          tmpI = zDirection;
          zDirectionAdded = true;
        }
        const last = this.buleprint.belt.beltLinks[linkIndex];
        const cursorOffset = Object.assign({}, last.localOffset[0]);
        if (Math.round(current[tmpI]) > Math.round(end[tmpI])) {
          cursorOffset[tmpI] = Math.round(cursorOffset[tmpI] - 1);
        } else if (Math.round(current[tmpI]) < Math.round(end[tmpI])) {
          cursorOffset[tmpI] = Math.round(cursorOffset[tmpI] + 1);
        }
        const [belt] = this.createBelt(matrix, linkIndex, cursorOffset);
        if (tmpI !== "z" && i !== "z" && lastDirection !== i) {
          // 带子转弯
          belt.yaw = last.yaw = [315, 315];
        }
        if (tmpI === "z") {
          // z轴方向，传送带要加入数组
          belts[belts.length - 1].push(belt);
          // 增加偏移
          if (last.localOffset[0].z > 0) {
            last.localOffset[0][zDirection] += last.localOffset[0].z * 0.0017;
          }
        } else {
          belts.push([belt]);
        }
        current = belt.localOffset[0];
        lastDirection = tmpI === "z" ? lastDirection : tmpI;
      }
    }
    return belts;
  }
}
