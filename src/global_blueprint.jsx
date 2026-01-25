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
import { BlueprintBuilder } from "./blueprint/builder";
import {
  INSERTER_TYPE,
  BELT_LEVEL,
  SMELTER,
  CHEMICAL,
  LAB,
  STATION,
  HADRON_COLLIDER,
  RAW_FACTORY,
  PRO_LIST,
  SPRAY_COATER,
  SPLITTER_4DIR,
  STORAGE,
} from "./blueprint/constant";

const ROW_HEIGHT_INSERTER = 10; // 集装分拣器回收时一行的高度
const ROW_HEIGHT_4DIR = 8; // 四向分流器一行的高度

const LAB_STACK_MAX_HEIGHT = 15; // 研究站堆叠数量

const ITEM_NAME_MAP = items.reduce((a, b) => a.set(b.Name, b), new Map());
const ITEM_ID_MAP = items.reduce((a, b) => a.set(b.ID, b), new Map());
const RECIPE_ID_MAP = recipes.reduce((a, b) => a.set(b.ID, b), new Map());

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
  return scheme.sort((a, b) => a.share - b.share);
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
        let y = Math[building.attributes.area[1] < 1 ? "ceil" : "floor"](building.localOffset[0].y - building.attributes.area[1]);
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

export function computeBlueprint({ allProduceUnits, surplusList, produces, beltType, insertType, recycleMode, rows, stackSize, floor, stationPiler, proNum }) {
  const produceUnits = checkProduceUnits(allProduceUnits, surplusList, produces, recycleMode);
  const { order, rawMaterial } = orderRecipe(produceUnits);
  console.log("原料:", rawMaterial);
  console.log("订单:", order);
  const blueprint = new MixedConveyerBeltBlueprint(
    Object.keys(produces)[0],
    Object.values(produces)[0],
    produceUnits,
    surplusList,
    order,
    rawMaterial,
    rows,
    beltType,
    insertType,
    recycleMode,
    stackSize,
    floor,
    stationPiler,
    proNum
  );
  blueprint.compute();
  return blueprint;
}

export function generateBlueprint(blueprint) {
  const bp = new BlueprintBuilder("新蓝图", blueprint);
  const str = bp.toStr();
  // 将s加入到剪切板
  // navigator.clipboard.writeText(str);
  return str;
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
function checkProduceUnits(allProduceUnits, surplusList = {}, produces, recycleMode) {
  if (Object.entries(produces).length !== 1) {
    throw new Error("只支持生产一种物品。");
  }
  if (allProduceUnits.filter(unit => recipes[unit.recipe].Type >= 0).length < 2 ) {
    throw new Error("蓝图至少包含两个配方。");
  }
  if (allProduceUnits.find(unit => unit.item === "蓄电器（满）")) {
    throw new Error("不支持包含 [蓄电器（满）] 的配方。");
  }
  const producePro = PRO_LIST.find((item) => produces[item]);
  if (!producePro && allProduceUnits.find((unit) => PRO_LIST.includes(unit.item) && !unit.isMineralized)) {
    throw new Error("必须将增产剂设置为原矿。");
  }
  if (Object.keys(surplusList).length > 1) {
    throw new Error("副产物只能有一种。");
  }
  if (recycleMode === 2) {
    // 四向分流器回收时，不能对撞机
    if (allProduceUnits.find((unit) => HADRON_COLLIDER === unit.factory)) {
      throw new Error("四向分流器回收时，不能有对撞机。");
    }
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

// 检查坐标是数字
function checkPointer(pointer) {
  if ((pointer.x ?? pointer.localOffset?.[0]?.x) >= 0 && (pointer.y ?? pointer.localOffset?.[0]?.y) >= 0) {
    return true;
  }
  console.log("pointer:", pointer);
  throw new Error("坐标位置异常");
}

/**
 * 图片蓝图生成器
 */
class MixedConveyerBeltBlueprint {
  recycleMode = 1; // 回收方式: 1-"集装分拣器"，2-"四向分流器"
  stackSize = 4; // 堆叠数量: 1 | 2 | 4
  inserterMixLevel = 2; // 输入混带的最高级别：0-分拣器，1-高速分拣器，2-极速分拣器, 3-集装分拣器
  proliferatorLevel = 0; // 喷涂：0-无，1-MK.1，2-MK.2，3-MK.3
  beltLevel = 2; // 传送带级别：0-黄带，1-绿带，2-蓝带
  multiple = 1; // 蓝图倍数
  height = 0; // 蓝图高度，固定值
  surplus; // 副产物，当氢有多个来源时，副产物就是氢
  surplusId; //
  surplusCount = 0; // 副产物溢出数量，负数表示不足，正数表示溢出，0表示刚好够用
  surplusJoinProduct = false; // 副产物是否参与生产
  stationPiler; // 物流塔装载：1-有装载，2-无装载
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
    insertType = 2, // 输入混带的最高级别：0-分拣器，1-高速分拣器，2-极速分拣器
    recycleMode = 1, // 回收方式: 1-"集装分拣器"，2-"四向分流器"
    stackSize = 4, // 分拣器集装堆叠数量: 1 | 2 | 4
    floor = LAB_STACK_MAX_HEIGHT, // 最大建筑堆叠层数
    stationPiler = 1, // 物流塔装载：1-有装载，2-无装载
    proNum = 0 // 增产点数
  ) {
    this.produce = produce;
    this.produceId = ITEM_NAME_MAP.get(produce).ID;
    this.produceCount = produceCount;
    this.produceUnits = produceUnits;
    this.rawMaterial = rawMaterial;
    this.rowCount = rowCount;
    this.beltLevel = beltType;
    this.floor = floor;
    this.proliferatorLevel = proNum === 4 ? 3 : proNum; // 选择的喷涂级别没有3，4为MK.III，修改为3
    this.belt = new BeltUnit(this);

    this.stationPiler = stationPiler;
    if (stationPiler === 1) {
      // 物流塔有装载，一定是集装分拣器，一定有4层堆叠
      recycleMode = 1;
      stackSize = 4;
    }
    this.inserterMixLevel = recycleMode === 1 ? 3 : insertType;
    this.recycleMode = recycleMode;
    if (recycleMode === 2) {
      stackSize = 1; // 回向分流器回收不可堆叠
      this.rowCount = 2; // 固定两行
    }

    this.stackSize = stackSize;
    this.shareSize = this.stackSize * 15; // 一份的容量

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
      }else if (!unitH.grossOutput && !Object.keys(surplusList).length && Object.entries(unitH.sideProducts || {}).length) {
        // 没有副产，氢的需求为0，但是有副产配方，表示氢正好
        this.surplus = "氢";
        this.surplusCount = 0;
      }
    }

    if (this.surplus) {
      // 有副产，加带子
      this.surplusId = ITEM_NAME_MAP.get(this.surplus).ID;
      const surplusID = ITEM_NAME_MAP.get(this.surplus).ID;
      const surplusUnits = produceUnits.filter((unit) => RECIPE_ID_MAP.get(unit.recipeId).Items.includes(surplusID));
      this.surplusJoinProduct = surplusUnits.length > 0;
    }

    // 副产是否参与生产
    console.log(`副产: ${this.surplus}, 副产数量:${this.surplusCount}, 副产参与生产:${this.surplusJoinProduct}`);
    // 物流塔物品种类数：喷涂 + 产出 + 副产 + 原矿 ...
    const proliferatorItem = { type: 2 };
    const stationItems = [proliferatorItem, { item: produce, type: 1 }]; // {item, type}, 物流塔，type 1-需求，2供应
    // 如何蓝图用于生产喷涂剂，而且喷涂剂也要用于喷涂，第一个槽留从，喷涂剂从第二个槽输出
    if (this.proliferatorLevel > 0 && this.produce !== PRO_LIST[this.proliferatorLevel - 1]) {
      // 只有当需求喷涂，而且不生产喷涂剂时，喷涂剂从第一个槽输出
      proliferatorItem.item = PRO_LIST[this.proliferatorLevel - 1];
    }
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
    if (this.recycleMode === 1) {
      for (let i = 0; i < stationItems.length; i += 4) {
        this.stations.push(new StationUnit(this, stationItems.slice(i, i + 4), this.stations.length));
      }
    } else {
      this.stations.push(
        new StationUnit(
          this,
          stationItems.filter((item) => item.item && item.type === 2),
          0
        )
      );
    }
  }

  /**
   * 计算利用率、建筑信息，分配建筑行
   */
  compute() {
    this.belt.compute();
    this.stations.forEach((station) => station.compute());
    this.buildings.forEach((building) => building.compute());
    this.sliceBuildingRows();
  }

  /**
   * 将建筑分配到行：物流站必须在第一行，一个建筑单元不可跨行
   * 分配原则：先计算总宽度，除以行数向上取整是一行的最大宽度
   * 当超过宽度时，此行结束，下一个建筑从下一行开始
   */
  sliceBuildingRows() {
    const totalWidth = this.stations.reduce((a, b) => a + b.width, 0) + this.buildings.reduce((a, b) => a + b.width, 0);
    for (let i = 0; i < this.rowCount; i++) {
      this.buildingsRow.push([]);
    }
    let aggWidth = totalWidth / this.rowCount;
    let i = 0,
      rowWidth = 0;
    this.buildingsRow[0].unshift(...this.stations);
    this.buildingsRow[0].unshift(this.buildings[0]); // 最终产物必须在第一行
    rowWidth = this.stations.reduce((a, b) => a + b.width, 0) + this.buildings[0].width;
    if (rowWidth > aggWidth) {
      console.log(`第${i}行，宽度：${rowWidth}, aggWidth:${aggWidth}, 建筑：`, this.buildingsRow[i]);
      aggWidth = (aggWidth + rowWidth) / 2;
      i++;
      rowWidth = 0;
    }
    this.buildings.slice(1).forEach((building) => {
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
    // 截断空行
    this.rowCount = this.buildingsRow.filter((row) => row.length > 0).length;
    this.buildingsRow = this.buildingsRow.slice(0, this.rowCount);
  }

  /**
   * 获取建筑蓝图信息
   * @param {*} name
   */
  createBuildingInfo(name, localOffset = { x: 0, y: 0, z: 0 }) {
    checkPointer(localOffset);
    const building = JSON.parse(BUILDINGS_STRING.get(name));
    localOffset.z = localOffset.z ?? 0;
    building.localOffset[0].x = localOffset.x;
    building.localOffset[0].y = localOffset.y;
    building.localOffset[0].z = localOffset.z;
    const key = `${name}-${localOffset.x}-${localOffset.y}-${localOffset.z}`;
    if (this.buildingsMap.has(key)) {
      throw new Error(`建筑 ${name} 位置 ${localOffset.x},${localOffset.y},${localOffset.z} 已存在`);
    }
    this.buildingsMap.set(key, building);
    pushMatrix(this.matrix, [building]);
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
   * 创建分拣器
   * @param {*} name 名称、序号、id
   * @param {*} begin {x, y, z, inputObjIdx, inputFromSlot}
   * @param {*} end {x, y, z, outputObjIdx, outputToSlot}
   * @param {*} filter
   */
  createInserter(name, begin, end, filter) {
    let length = -1;
    let yaw = -1;
    begin.itemId && (begin = Object.assign({ inputObjIdx: begin }, begin.localOffset[0]));
    end.itemId && (end = Object.assign({ outputObjIdx: end }, end.localOffset[0]));
    if (!begin.inputObjIdx) {
      begin.inputObjIdx = this.matrix[begin.y][begin.x];
      if (!begin.inputObjIdx) throw new Error("分拣器开始节点为空");
      if (begin.inputObjIdx.length > 1) throw new Error("分拣器开始节点有多个建筑");
    }
    if (!end.outputObjIdx) {
      end.outputObjIdx = this.matrix[end.y][end.x];
      if (!end.outputObjIdx) throw new Error("分拣器结束节点为空");
      if (end.outputObjIdx.length > 1) throw new Error("分拣器结束节点有多个建筑");
    }
    const xOffset = Math.round(begin.x - end.x);
    const yOffset = Math.round(begin.y - end.y);
    if (xOffset === 0) {
      length = Math.abs(yOffset);
      yaw = yOffset > 0 ? 180 : 0; // 上->下：180，下->上：0
    } else if (yOffset === 0) {
      length = Math.abs(xOffset);
      yaw = xOffset > 0 ? 270 : 90; // 右->左：270，左->右：90
    } else {
      throw new Error(`分拣器开始或结束坐标错误`);
    }
    if (typeof name === "number") {
      if (name === 3 && this.inserterMixLevel < 3) {
        name = this.inserterMixLevel; // 最大不可超过最高级的分拣器
      }
      name = name < 4 ? INSERTER_TYPE[name] : ITEM_ID_MAP.get(name).Name;
      if (!name) throw new Error("未找到分拣器");
    }
    const inserter = this.createBuildingInfo(name, begin);
    inserter.localOffset[1].x = end.x;
    inserter.localOffset[1].y = end.y;
    inserter.localOffset[1].z = end.z;
    inserter.parameters.length = length;
    inserter.yaw = [yaw, yaw];
    inserter.inputObjIdx = begin.inputObjIdx;
    inserter.outputObjIdx = end.outputObjIdx;
    begin.inputFromSlot != null && (inserter.inputFromSlot = begin.inputFromSlot);
    end.outputToSlot != null && (inserter.outputToSlot = end.outputToSlot);
    if (filter) {
      inserter.filterId = typeof filter === "number" ? filter : ITEM_NAME_MAP.get(filter).ID;
    }
    return inserter;
  }

  /**
   * 生成地图二维数组
   */
  generate() {
    // 找到最长的行
    const maxWidth = this.buildingsRow.map((unit) => unit.reduce((a, b) => a + b.width, 0)).reduce((a, b) => Math.max(a, b), 0);
    this.height = this.recycleMode === 1 ? ROW_HEIGHT_1 : ROW_HEIGHT_2; // 回收模式为集装分拣器时，高度为11，否则为15
    let beginY = this.recycleMode === 1 ? 0 : 1;
    this.matrix = []; // 蓝图坐标矩阵
    this.buildingsRow.forEach((buildings) => {
      // 初始化一行 12 x maxRow 的二维数组
      const paddingWidth = this.recycleMode === 1 ? 4 : 2; // 右左补充的格子
      this.matrix.push(...Array.from({ length: this.height }, () => Array(maxWidth + paddingWidth).fill(null)));
      let beginX = this.recycleMode === 1 ? 2 : 1;
      // 生成建筑、下游传送带、副产传送带
      buildings.forEach((building) => {
        building.generateUpstream(beginX, beginY); // 生成上游传送带，需要从右向左生成
        if (building.produce?.item === this.produce) {
          building.generateProductBelt(beginX, beginY); // 最终产物
        }
        building.generateDownstream(beginX, beginY); // 生成下游传送带，需要从左向右生成
        building.generateSurplusBelt(beginX, beginY); // 生成副产传送带
        building.generate(beginX, beginY);
        beginX += building.width;
      });
      beginY += this.height; // 下一行增加高度
    });

    this.matrix.forEach((row, i) => {
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
      );
      if ((i + 1) % this.height === 0) {
        console.log(`===============${Math.round(i / this.height)}===================`);
      }
    });
    return this.matrix;
  }
}

/**
 * 建筑单元
 */
class BuildingUnit {
  blueprint;
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
  direction = 1; // 方向：1-逆时针，-1-顺时针
  recipe; // 配方： Recipe
  produce; // 生产要素:ProduceUnit
  constructor(blueprint, recipe, produce) {
    this.blueprint = blueprint;
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

  /**
   * 建筑compute
   */
  compute() {
    this.inserters = getInserterScheme(Math.max(Math.ceil(this.produce.grossOutput / this.blueprint.shareSize), 2), this.blueprint.inserterMixLevel);
    this.itemId = ITEM_NAME_MAP.get(this.produce.item).ID;
    // 计算宽度
    this.width = this.produce.factoryNumber * buildings[this.produce.factory].attributes.area[0] * 2; // 建筑宽
    if (LAB.includes(this.produce.factory)) {
      // if (this.blueprint.floor < this.produce.factoryNumber) {
      //   throw new Error(`“${this.produce.factory}”堆叠${this.produce.factoryNumber}层，不能超过${this.blueprint.floor}层`);
      // }
      this.width = Math.ceil(this.produce.factoryNumber / LAB_STACK_MAX_HEIGHT) * buildings[this.produce.factory].attributes.area[0] * 2; // 研究站可堆叠
    } else if (
      ["原油精炼厂", ...SMELTER, ...CHEMICAL, HADRON_COLLIDER].includes(this.produce.factory) &&
      this.recipe.Results.includes(this.blueprint.produceId)
    ) {
      // 是最终产物时
      this.width += 1;
    } else if (this.produce.item !== this.blueprint.produce) {
      this.width += this.inserters.length; // 加分拣器宽度
    }
    if (this.produce.factory === HADRON_COLLIDER && this.getSurplus()) {
      this.width += this.produce.factoryNumber; // 粒子对撞机有副产物时需要多1格
    }
    this.width += 1; // 加1格输入到总线
    if (this.blueprint.recycleMode === 2) {
      if (this.getProduce().Name !== this.blueprint.produce) {
        this.width += 2; // 再加上四向分流器
      }
    }

    console.log(`建筑：${this.produce.factory}, 输出：${this.produce.item}, 副产：${this.blueprint.surplus}, 宽度：${this.width}, 分拣器：`, this.inserters);
  }

  // 生成研究站
  generateLab(beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let x = beginX;
    let y = beginY + 2;
    // 生成建筑,尽可能均分 factories 到每个堆叠中，且不超过 LAB_STACK_MAX_HEIGHT。
    let labStacks = Math.ceil(this.produce.factoryNumber / LAB_STACK_MAX_HEIGHT);
    let baseFactories = [];
    let totalCnt = 0;
    for(let stackIdx = 0; stackIdx < labStacks; stackIdx++) {
      let lastFactory
      for (let labLevel = 0; labLevel < LAB_STACK_MAX_HEIGHT; labLevel++) {
        // 建筑是一个方形，将矩阵中相应位置填入建筑
        const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
          x: x + Math.ceil(this.factoryInfo.attributes.area[0]) + stackIdx * Math.ceil(this.factoryInfo.attributes.area[0]) * 2, // 建筑宽度一半向上取整
          y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
          z: this.factoryInfo.attributes.area[2] * labLevel, // 建筑高度
        });
        if (lastFactory) {
          factoryObj.inputObjIdx = lastFactory; // 输入
        }
        else {
          baseFactories.push(factoryObj);
        }
        factoryObj.recipeId = this.recipe.ID; // 配方id
        this.factories.push(factoryObj);
        lastFactory = factoryObj;
        totalCnt++;
        if (totalCnt >= this.produce.factoryNumber) {
          break;
        }
      }
    }
    y += this.factoryInfo.attributes.area[1] * 2;

    // 生成输出回路
    this.generateOutputBelt(beginX, beginY, y, ["z", "x", "y"], "x"); 
    // 生成分拣器
    for(const factory of baseFactories) {
      this.generateFactoryInserter(factory, -8);
    }
  }

  // 生成粒子对撞机
  generateHadronCollider(beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let x = beginX + (this.getSurplus() ? 2 : 1);
    let y = beginY + 2;
    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // beginX += 1; // 左侧有1格空隙
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
        x: x + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      x += factoryObj.attributes.area[0] * 2 + (this.getSurplus() ? 1 : 0); // 粒子对撞机有副产物时需要多1格
    }
    y += this.factoryInfo.attributes.area[1] * 2 + 1;
    this.generateOutputBelt(beginX, beginY, y, ["z", "x", "y"], "x"); // 生成回路
    //副产回收
    if (this.getSurplus()) {
      const endY = this.blueprint.height - 1 + beginY; // 总线点结束
      this.factories.forEach((factory, index) => {
        this.blueprint.belt.generateBelt(
          { x: beginX + index * (factory.attributes.area[0] * 2 + 1) + 1, y: beginY + 4, z: 0 },
          { x: beginX + index * (factory.attributes.area[0] * 2 + 1) + 1, y: endY, z: this.blueprint.belt.belts.length + 1, outputToSlot: 2 },
          ["y", "z", "x"],
          "y",
          2
        );
      });
    }
    // 生成分拣器
    this.factories.forEach((factory) => {
      const pointer = factory.localOffset[0];
      const inserters = [];
      // 原料分拣器
      this.recipe.Items.reduce((acc, itemId) => {
        acc.add(this.blueprint.belt.getBeltIndex(itemId));
        return acc;
      }, new Set()).forEach((beltIndex) => {
        inserters.push(
          this.blueprint.createInserter(3, this.blueprint.belt.getBelt({ x: pointer.x - 1 - beltIndex, y: pointer.y - 2 - beltIndex - 1, z: 0 }), {
            x: pointer.x - 1 - beltIndex,
            y: pointer.y - 2,
            z: 0,
            outputObjIdx: factory,
            outputToSlot: Math.abs(-8 + beltIndex), // 输入的槽位
          })
        );
      });

      // 对产物排序，副产排最后
      this.recipe.Results.forEach((itemId) => {
        if (itemId === this.blueprint.surplusId) {
          inserters.push(
            this.blueprint.createInserter(
              3,
              { x: pointer.x - 4, y: pointer.y, z: 0, inputObjIdx: factory, inputFromSlot: 4 },
              this.blueprint.belt.getBelt({ x: pointer.x - 6, y: pointer.y, z: 0 }),
              itemId
            )
          );
        } else {
          inserters.push(
            this.blueprint.createInserter(
              3,
              { x: pointer.x - 2, y: pointer.y + 2, z: 0, inputObjIdx: factory, inputFromSlot: 1 },
              this.blueprint.belt.getBelt({ x: pointer.x - 2, y: pointer.y + 3, z: 0 }),
              itemId
            )
          );
        }
      });
    });
  }

  // 生成原油精炼厂
  generateOilRefinery(beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let x = beginX;
    let y = beginY + 2;
    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
        x: x + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      x += factoryObj.attributes.area[0] * 2;
    }
    y += this.factoryInfo.attributes.area[1] * 2 + 1;
    this.generateOutputBelt(beginX, beginY, y); // 生成回路
    //副产回收
    if (this.getSurplus()) {
      const endY = this.blueprint.height - 1 + beginY; // 总线点结束
      this.blueprint.belt.generateBelt(
        { x: beginX + 3, y: y + 1, z: 0 },
        { x: beginX + this.width - 2, y: endY, z: this.blueprint.belt.belts.length + 1, outputToSlot: 2 },
        ["x", "z", "y"],
        "x"
      );
    }
    // 生成分拣器
    this.factories.forEach((factory) => this.generateFactoryInserter(factory, -2, -4));
  }

  // 生成化工厂
  generateChemicalPlant(beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let x = beginX;
    let y = beginY + 2;
    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
        x: x + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      x += factoryObj.attributes.area[0] * 2;
    }
    y += this.factoryInfo.attributes.area[1] * 2 + 1;
    this.generateOutputBelt(beginX, beginY, y, ["y", "z", "x"], "x"); // 生成回路
    //副产回收
    if (this.getSurplus()) {
      const endY = this.blueprint.height - 1 + beginY; // 总线点结束
      this.blueprint.belt.generateBelt(
        { x: beginX + 3, y: y + 1, z: 0 },
        { x: beginX + this.width - 3, y: endY, z: this.blueprint.belt.belts.length + 1, outputToSlot: 2 },
        ["x", "z", "y"],
        "x"
      );
    }

    // 生成分拣器
    this.factories.forEach((factory) => {
      const [inI] = this.generateFactoryInserter(factory, 4, 1);
      inI.forEach((i) => (i.localOffset[1].y += 0.284));
    });
  }

  // 熔炉、制造台
  generateDefault(beginX, beginY) {
    // 对于建筑来讲，从传送带往下开始
    let x = beginX;
    let y = beginY + 2;
    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
        x: x + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      x += factoryObj.attributes.area[0] * 2;
    }
    y += this.factoryInfo.attributes.area[1] * 2;
    if (SMELTER.includes(this.produce.factory)) {
      y += 1; // 熔炉需要多1格
    }

    this.generateOutputBelt(beginX, beginY, y); // 生成回路
    // 生成分拣器
    this.factories.forEach((factory) => this.generateFactoryInserter(factory));
  }

  /**
   * 生成一个建筑的分拣器
   * @param {*} factory
   * @param {*} inSlotOffset 槽位偏移，正数为顺时针，负数为逆时针
   */
  generateFactoryInserter(factory, inSlotOffset = 6, outSlotOffset = 1, pointer = factory.localOffset[0]) {
    const border = factory.attributes.inserterBorder;
    const inserters = [[], []];
    // 原料分拣器
    this.recipe.Items.reduce((acc, itemId) => {
      acc.add(this.blueprint.belt.getBeltIndex(itemId));
      return acc;
    }, new Set()).forEach((beltIndex) => {
      inserters[0].push(
        this.blueprint.createInserter(3, this.blueprint.belt.getBelt({ x: pointer.x + 1 - beltIndex, y: pointer.y - border.bottom - beltIndex - 1, z: 0 }), {
          x: pointer.x + 1 - beltIndex,
          y: pointer.y - border.bottom,
          z: 0,
          outputObjIdx: factory,
          outputToSlot: Math.abs(inSlotOffset + beltIndex), // 输入的槽位
        })
      );
    });

    // 对产物排序，副产排最后
    this.recipe.Results.sort((id) => (id === this.blueprint.surplusId ? 1 : -1)).forEach((itemId, index) => {
      inserters[1].push(
        this.blueprint.createInserter(
          3,
          { x: pointer.x + index, y: pointer.y + border.top, z: 0, inputObjIdx: factory, inputFromSlot: Math.abs(outSlotOffset + index) },
          this.blueprint.belt.getBelt({ x: pointer.x + index, y: pointer.y + border.top + 1 + index, z: 0 }),
          itemId
        )
      );
    });
    return inserters;
  }

  /**
   * 生成主产物回路
   * @param {*} beginX
   * @param {*} beginY 该行建筑的开始
   * @param {*} realY 实际的开始
   * @param {*} priority 输入总线的带子优先级
   * @param {*} zDirection 输入总线的带子方向
   * @param {*} interval 建筑之间的间隔，对撞机为1，其它是0
   */
  generateOutputBelt(beginX, beginY, realY, priority = ["z", "y", "x"], zDirection = "y") {
    // 生成回路
    if (this.produce.item === this.blueprint.produce) {
      this.blueprint.belt.generateBelt({ x: beginX + 1, y: realY, z: 0 }, { x: beginX + this.width - 1, y: realY, z: 0 }); // 最终产物进塔的第4个槽
    } else {
      let productBeginX = beginX + this.width - this.inserters.length;
      const y = this.blueprint.height - 2 + beginY; // 总线下方一格开始
      const z = this.blueprint.belt.getBeltIndex(this.getProduce().Name) + 1; // 从总线回收的带子，产物所在带子的z轴
      const [beginRecycleBelt] = this.blueprint.belt.generateBelt({ x: beginX + 1, y, z }, { x: beginX + this.width, y: realY, z: 0 }, priority, zDirection);
      // 生成回收分拣器
      this.blueprint.createInserter(3, this.blueprint.belt.getBelt({ x: beginX + 1, y: y + 1, z }), beginRecycleBelt, this.getProduce().ID);
      this.blueprint.belt.generateBelt(
        { x: beginX + this.width, y: realY - 3, z: 0 }, // x:建筑右侧开始, y:建筑输出位置为第4格, z: 0
        { x: productBeginX, y: y + 1, z, outputToSlot: 2 }, // 连接到总线
        ["x", "z", "y"], // 先横向
        "y" // 延y轴方向上升
      );
      // 生成集装分拣器
      this.blueprint.stackSize > 1 &&
        this.blueprint.createInserter(
          3,
          this.blueprint.belt.getBelt({ x: productBeginX, y: realY, z: 0 }),
          this.blueprint.belt.getBelt({ x: productBeginX - 1, y: realY, z: 0 })
        );
      // 生成分拣器对接的带子
      this.inserters.forEach((inserter, index) => {
        if (inserter.length < 3) {
          this.blueprint.belt.generateBelt(
            { x: productBeginX + index + 1, y: realY - inserter.length, z: 0 },
            { x: productBeginX + index + 1, y: realY - 3, z: 0, outputToSlot: index === this.inserters.length - 1 ? undefined : 2 },
            ["y", "z", "x"]
          );
        }
        this.blueprint.createInserter(
          inserter.level,
          this.blueprint.belt.getBelt({ x: productBeginX + index + 1, y: realY, z: 0 }),
          this.blueprint.belt.getBelt({ x: productBeginX + index + 1, y: realY - inserter.length, z: 0 })
        );
      });
    }
  }

  // 最终产物进塔
  generateProductBelt(beginX, beginY) {
    let y = beginY + 6;
    if (LAB.includes(this.produce.factory)) {
      y = beginY + 8;
    } else if (CHEMICAL.includes(this.produce.factory)) {
      y = beginY + 7;
    } else if (HADRON_COLLIDER === this.produce.factory) {
      y = beginY + 8;
    }
    if (this.blueprint.recycleMode === 1) {
      this.blueprint.belt.generateBelt({ x: beginX + this.width - 1, y: y, z: 0 }, { x: beginX + this.width, y: 5, z: 0 }, ["y", "x", "z"]); // 最终产物进塔的第4个槽
    } else {
      const belts = this.blueprint.belt.generateBelt({ x: beginX + 1 + this.inserters.length, y: y - 2, z: 0 }, { x: beginX + this.width - 2, y: y - 2, z: 0 });
      belts[belts.length - 1].parameters = { iconId: this.getProduce().ID };
    }
  }

  // 生成下方传送带
  generateDownstream(beginX, beginY) {
    if (this.blueprint.recycleMode === 1) {
      const y = this.blueprint.height + beginY - 1;
      for (let z = 0; z < this.blueprint.belt.belts.length; z++) {
        this.blueprint.belt.generateBelt({ x: beginX, y, z: z + 1 }, { x: beginX + this.width, y, z: z + 1 });
      }
    } else {
      // 生成总线
      if (this.getProduce().Name === this.blueprint.produce) {
        // 最终产物不需要分流器
        this.blueprint.belt.generateBelt({ x: beginX + this.width, y: beginY, z: 0 }, { x: beginX, y: beginY, z: 0 });
      } else {
        const pointer = { x: beginX + this.width - 1, y: beginY }; // 四向分流器的位置
        this.blueprint.belt.generateSplitter4Dir(pointer, [{ type: "out", filter: this.getProduce().ID }, { type: "in" }, null, { type: "out" }]);
        this.blueprint.belt.generateBelt({ x: pointer.x - 1, y: beginY, z: 0 }, { x: beginX, y: beginY, z: 0 });
        this.blueprint.belt.generateBelt({ x: beginX + this.width, y: beginY, z: 0 }, { x: pointer.x + 1, y: beginY, z: 0 });
      }
    }
  }

  // 生成上方传送带
  generateUpstream(beginX, beginY) {
    if (this.blueprint.recycleMode === 1) {
      for (let y = 0; y < this.blueprint.belt.belts.length; y++) {
        this.blueprint.belt.generateBelt({ x: beginX + this.width, y: 2 - y + beginY, z: 0 }, { x: beginX, y: 2 - y + beginY, z: 0 });
      }
    }
  }

  // 生成副产带子
  generateSurplusBelt(beginX, beginY) {
    if (this.blueprint.recycleMode === 1 && this.blueprint.surplus) {
      const y = this.blueprint.height + beginY - 1;
      const z = this.blueprint.belt.belts.length + 1;
      this.blueprint.belt.generateBelt({ x: beginX, y, z }, { x: beginX + this.width, y, z });
    } else if (this.getSurplus()) {
      let y = beginY + 1 + this.factoryInfo.attributes.area[1] * 2;
      const belts = this.blueprint.belt.generateBelt(
        { x: beginX + this.inserters.length + 1, y: y + 1, z: 0 },
        { x: beginX + this.width - 2, y: y + 1, z: 0 },
        ["x", "z", "y"],
        "x"
      );
      belts[belts.length - 1].parameters = { iconId: this.getSurplus().ID };
    }
  }
  // 生成建筑
  generate(beginX, beginY) {
    if (this.blueprint.recycleMode === 1) {
      switch (this.produce.factory) {
        case "矩阵研究站":
        case "自演化研究站":
          this.generateLab(beginX, beginY);
          break;
        case "微型粒子对撞机":
          this.generateHadronCollider(beginX, beginY);
          break;
        case "原油精炼厂":
          this.generateOilRefinery(beginX, beginY);
          break;
        case "化工厂":
        case "量子化工厂":
          this.generateChemicalPlant(beginX, beginY);
          break;
        default:
          this.generateDefault(beginX, beginY);
      }
    } else {
      if (this.getProduce().Name === this.blueprint.produce) {
        beginX -= 1;
      }
      switch (this.produce.factory) {
        case "矩阵研究站":
        case "自演化研究站":
          this.generateLab4Dir(beginX, beginY);
          break;
        case "原油精炼厂":
          this.generateOilRefinery4Dir(beginX, beginY);
          break;
        case "化工厂":
        case "量子化工厂":
          this.generateChemicalPlant4Dir(beginX, beginY);
          break;
        default:
          this.generateDefault4Dir(beginX, beginY);
      }
    }
  }

  // 生成研究站
  generateLab4Dir(beginX, beginY) {
    const pointer = { x: beginX + this.width - 1, y: beginY }; // 四向分流器的位置
    // 生成建筑
    let x = beginX + this.inserters.length;
    let y = pointer.y;
    let labStacks = Math.ceil(this.produce.factoryNumber / LAB_STACK_MAX_HEIGHT);
    let baseFactories = [];
    let totalCnt = 0;
    for (let stackIdx = 0; stackIdx < labStacks; stackIdx++) {
      let lastFactory;
      for (let labLevel = 0; labLevel < LAB_STACK_MAX_HEIGHT; labLevel++) {
        // 建筑是一个方形，将矩阵中相应位置填入建筑
        const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
          x: x + Math.ceil(this.factoryInfo.attributes.area[0]) + stackIdx * Math.ceil(this.factoryInfo.attributes.area[0]) * 2, // 建筑宽度一半向上取整
          y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
          z: this.factoryInfo.attributes.area[2] * labLevel, // 建筑高度
        });
        if (lastFactory) {
          factoryObj.inputObjIdx = lastFactory; // 输入
        }
        else {
          baseFactories.push(factoryObj);
        }
        factoryObj.recipeId = this.recipe.ID; // 配方id
        this.factories.push(factoryObj);
        lastFactory = factoryObj;
        totalCnt++;
        if (totalCnt >= this.produce.factoryNumber) {
          break;
        }
      }
    }
    y += this.factoryInfo.attributes.area[1] * 2;

    // 回收产物回路
    if (this.getProduce().Name !== this.blueprint.produce) {
      this.blueprint.belt.generateBelt({ x: pointer.x, y: pointer.y + 1, z: 0 }, { x: beginX, y: y, z: 0 }, ["y", "x", "z"]);
      this.blueprint.belt.generateBelt(
        { x: beginX, y: beginY + 1, z: 0 },
        { x: beginX + this.inserters.length, y: beginY, z: 0, outputToSlot: 2 },
        ["x", "y", "z"],
        "x"
      );
      // 生成分拣器对接的带子
      this.inserters.forEach((inserter, index) => {
        // 先生成带子
        if (inserter.length < 3) {
          this.blueprint.belt.generateBelt(
            { x: beginX + index, y: y - inserter.length, z: 0 },
            { x: beginX + index, y: pointer.y + 1, z: 0, outputToSlot: 2 },
            ["x", "y", "z"],
            "x"
          );
        }
        // 生成分拣器
        this.blueprint.createInserter(
          inserter.level,
          this.blueprint.belt.getBelt({ x: beginX + index, y: y, z: 0 }),
          this.blueprint.belt.getBelt({ x: beginX + index, y: y - inserter.length, z: 0 })
        );
      });
    }
    this.generateOutputBelt(beginX, beginY, y, ["z", "x", "y"], "x"); // 生成回路

    // 生成分拣器
    baseFactories.forEach((factory) => {
      this.generateFactoryInserter(factory, -8);
    });
    
  }

  // 熔炉、制造台
  generateDefault4Dir(beginX, beginY) {
    const pointer = { x: beginX + this.width - 1, y: beginY }; // 四向分流器的位置
    // 生成建筑
    let x = beginX + this.inserters.length;
    let y = pointer.y;

    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
        x: x + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      x += factoryObj.attributes.area[0] * 2;
    }
    y += this.factoryInfo.attributes.area[1] * 2;
    if (SMELTER.includes(this.produce.factory)) {
      y += 1; // 熔炉需要多1格
    }

    // 回收产物回路
    if (this.getProduce().Name !== this.blueprint.produce) {
      this.blueprint.belt.generateBelt({ x: pointer.x, y: pointer.y + 1, z: 0 }, { x: beginX, y: y, z: 0 }, ["y", "x", "z"]);
      this.blueprint.belt.generateBelt(
        { x: beginX, y: beginY + 1, z: 0 },
        { x: beginX + this.inserters.length, y: beginY, z: 0, outputToSlot: 2 },
        ["x", "y", "z"],
        "x"
      );
      // 生成分拣器对接的带子
      this.inserters.forEach((inserter, index) => {
        // 先生成带子
        if (inserter.length < 3) {
          this.blueprint.belt.generateBelt(
            { x: beginX + index, y: y - inserter.length, z: 0 },
            { x: beginX + index, y: pointer.y + 1, z: 0, outputToSlot: 2 },
            ["x", "y", "z"],
            "x"
          );
        }
        // 生成分拣器
        this.blueprint.createInserter(
          inserter.level,
          this.blueprint.belt.getBelt({ x: beginX + index, y: y, z: 0 }),
          this.blueprint.belt.getBelt({ x: beginX + index, y: y - inserter.length, z: 0 })
        );
      });
    }
    // 生成分拣器
    this.factories.forEach((factory) => this.generateFactoryInserter(factory));
  }

  // 生成原油精炼厂
  generateOilRefinery4Dir(beginX, beginY) {
    const pointer = { x: beginX + this.width - 1, y: beginY }; // 四向分流器的位置
    // 生成建筑
    let x = beginX + this.inserters.length;
    let y = pointer.y;

    // 生成建筑
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
        x: x + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      x += factoryObj.attributes.area[0] * 2;
    }
    y += this.factoryInfo.attributes.area[1] * 2 + 1;

    // 回收产物回路
    if (this.getProduce().Name !== this.blueprint.produce) {
      this.blueprint.belt.generateBelt({ x: pointer.x, y: pointer.y + 1, z: 0 }, { x: beginX, y: y, z: 0 }, ["y", "x", "z"]);
      this.blueprint.belt.generateBelt(
        { x: beginX, y: beginY + 1, z: 0 },
        { x: beginX + this.inserters.length, y: beginY, z: 0, outputToSlot: 2 },
        ["x", "y", "z"],
        "x"
      );
      // 生成分拣器对接的带子
      this.inserters.forEach((inserter, index) => {
        // 先生成带子
        if (inserter.length < 3) {
          this.blueprint.belt.generateBelt(
            { x: beginX + index, y: y - inserter.length, z: 0 },
            { x: beginX + index, y: pointer.y + 1, z: 0, outputToSlot: 2 },
            ["x", "y", "z"],
            "x"
          );
        }
        // 生成分拣器
        this.blueprint.createInserter(
          inserter.level,
          this.blueprint.belt.getBelt({ x: beginX + index, y: y, z: 0 }),
          this.blueprint.belt.getBelt({ x: beginX + index, y: y - inserter.length, z: 0 })
        );
      });
    }

    // 生成分拣器
    this.factories.forEach((factory) => this.generateFactoryInserter(factory, -2, -4));
  }
  // 生成化工厂
  generateChemicalPlant4Dir(beginX, beginY) {
    const pointer = { x: beginX + this.width - 1, y: beginY }; // 四向分流器的位置
    // 生成建筑
    let x = beginX + this.inserters.length + 1;
    let y = pointer.y;
    for (let i = 0; i < this.produce.factoryNumber; i++) {
      // 建筑是一个方形，将矩阵中相应位置填入建筑
      const factoryObj = this.blueprint.createBuildingInfo(this.produce.factory, {
        x: x + Math.ceil(this.factoryInfo.attributes.area[0]), // 建筑宽度一半向上取整
        y: y + Math.ceil(this.factoryInfo.attributes.area[1]), // 建筑高度一半向上取整
      });
      factoryObj.recipeId = this.recipe.ID; // 配方id
      this.factories.push(factoryObj);
      x += factoryObj.attributes.area[0] * 2;
    }
    y += this.factoryInfo.attributes.area[1] * 2 + 1;
    // 回收产物回路
    if (this.getProduce().Name !== this.blueprint.produce) {
      this.blueprint.belt.generateBelt({ x: pointer.x, y: pointer.y + 1, z: 0 }, { x: beginX, y: y, z: 0 }, ["y", "x", "z"]);
      this.blueprint.belt.generateBelt(
        { x: beginX, y: beginY + 2, z: 0 },
        { x: beginX + this.inserters.length, y: beginY, z: 0, outputToSlot: 2 },
        ["x", "y", "z"],
        "x"
      );
      // 生成分拣器对接的带子
      this.inserters.forEach((inserter, index) => {
        // 先生成带子
        if (inserter.length < 3) {
          this.blueprint.belt.generateBelt(
            { x: beginX + index, y: y - inserter.length, z: 0 },
            { x: beginX + index, y: pointer.y + 2, z: 0, outputToSlot: 2 },
            ["x", "y", "z"],
            "x"
          );
        }
        // 生成分拣器
        this.blueprint.createInserter(
          inserter.level,
          this.blueprint.belt.getBelt({ x: beginX + index, y: y, z: 0 }),
          this.blueprint.belt.getBelt({ x: beginX + index, y: y - inserter.length, z: 0 })
        );
      });
    }

    // 生成分拣器
    this.factories.forEach((factory) => {
      const [inI] = this.generateFactoryInserter(factory, 4, 1);
      inI.forEach((i) => (i.localOffset[1].y += 0.284));
    });
  }

  getProduce() {
    return ITEM_ID_MAP.get(this.recipe.Results.find((id) => ITEM_ID_MAP.get(id).Name !== this.blueprint.surplus));
  }

  getSurplus() {
    if (this.recipe.Results.includes(this.blueprint.surplusId)) {
      return ITEM_ID_MAP.get(this.blueprint.surplusId);
    }
  }
}

/**
 * 物流塔单元
 */
class StationUnit {
  blueprint;
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
  constructor(blueprint, items, stationIndex) {
    // todo：蓝图计算物流塔分配，StationUnit 只负责生成建筑
    this.stationIndex = stationIndex;
    this.blueprint = blueprint;
    this.items = items;
    items.filter((item) => item.item).forEach((item) => (item.type === 2 ? this.requireItems.push(item) : this.provideItems.push(item)));
  }

  // 是否有喷涂剂
  hasProliferator() {
    return this.blueprint.proliferatorLevel > 0;
  }

  getLeftWidth() {
    if (this.blueprint.recycleMode === 1) {
      if (this.stationIndex === 0) {
        // 第一个塔左下为喷涂、左中为主产物，左上为副产；固定有喷涂剂。
        const proliferatorWidth = this.hasProliferator() ? 5 : 1; // 喷涂机宽度
        const masterWidth = 1; // 主产物
        let surplusWidth = 0; // 副产占用宽度，默认无时为0
        if (!this.blueprint.surplusJoinProduct) {
          surplusWidth = 2;
        }
        return Math.max(proliferatorWidth, masterWidth, surplusWidth);
      } else {
        // 不是第一个塔，按前两个出口的最大长度
        const top = this.items[0] ? Math.max(this.items[0].inserter.length + 1, 3) : 0; // 至少3格
        const bottom = this.items[1] ? Math.max(this.items?.[1]?.inserter?.length + 1, 3) : 0; // 至少4格
        return Math.max(top, bottom) + 1; // 物流塔占3.5+3.5，实际使用为8 ，所以在左侧补1格
      }
    } else {
      console.log("todo ...");
    }
  }

  getRightWidth() {
    if (this.blueprint.recycleMode === 1) {
      // 第三个带子一定是原料
      const top = this.items[2] ? Math.max(this.items[2].inserter.length + 1, 3) : 0;
      // 按最后两个产物的最大长度
      const bottom = this.items[3] ? Math.max(this.items[3].inserter.length + 1, 3) : 0;
      let width = Math.max(top, bottom);
      if (this.stationIndex === 0 && this.blueprint.surplusJoinProduct) {
        // 有副产参与生产
        width += 1;
      }
      if (this.stationIndex === this.blueprint.stations.length - 1) {
        // 最后一个塔时多1格
        width += 1;
      }
      return width;
    } else {
      console.log("todo ...");
    }
  }

  // 计算
  compute() {
    this.requireItems
      .filter((item) => !PRO_LIST.includes(item.item))
      .forEach((item) => (item.inserter = getInserterScheme(this.blueprint.belt.itemMap[item.item], this.blueprint.inserterMixLevel)));
    if (this.blueprint.recycleMode === 1) {
      this.provideItems
        .filter((item) => item.item !== this.blueprint.produce) // 主产物不分配分拣器
        .forEach((item) => (item.inserter = getInserterScheme(this.blueprint.belt.itemMap[item.item], this.blueprint.inserterMixLevel)));
      this.width = this.getLeftWidth() + 8 + this.getRightWidth();
      console.log(
        `物流塔 ${this.stationIndex} 宽 ${this.width}-(${this.getLeftWidth()}, ${this.getRightWidth()}) 需求：`,
        this.requireItems,
        "，供应：",
        this.provideItems
      );
    } else {
      this.requireItems = this.requireItems.filter((item) => !PRO_LIST.includes(item.item));
      // 四向分流器时只计算需求
      this.width = this.requireItems.map((item) => (item.width = Math.max(4, 3 + item.inserter.length))).reduce((a, b) => a + b, 0);
      this.width += 1; // 左侧留1格
      console.log(`原料 ${this.requireItems.length}，宽 ${this.width}，需求 `, this.requireItems);
    }
  }

  // 生成上游传送带
  generateUpstream(beginX, beginY) {
    if (this.blueprint.recycleMode === 1) {
      let branchEnd = 0;
      if (this.stationIndex === 0) {
        // 第一个塔需要将总线分叉并下沉到1层
        branchEnd = (this.blueprint.proliferatorLevel > 0 ? 4 : 0) + 2;
      }

      let y = beginY + 1;
      for (let z = 0; z < this.blueprint.belt.belts.length; z++) {
        this.blueprint.belt.generateBelt({ x: beginX + this.width, y, z: z + 1 }, { x: beginX + branchEnd, y, z: z + 1 });
      }
      if (this.stationIndex === 0) {
        this.blueprint.belt.belts.forEach((_, z) => {
          this.blueprint.belt.generateBelt({ x: beginX + branchEnd, y, z: z + 1 }, { x: beginX, y: 2 - z, z: 0 }, ["y", "z", "x"], "x");
        });
      }
    }
  }

  // 生成下游，从左到右生成
  generateDownstream(beginX, beginY) {
    if (this.blueprint.recycleMode === 1) {
      const y = this.blueprint.height + beginY - 1;
      for (let z = 0; z < this.blueprint.belt.belts.length; z++) {
        this.blueprint.belt.generateBelt({ x: beginX, y, z: z + 1 }, { x: beginX + this.width, y, z: z + 1 });
      }
    }
  }

  // 生成副产带子
  generateSurplusBelt(beginX, beginY) {
    if (this.stationIndex === 0 && this.blueprint.surplus && this.blueprint.recycleMode === 1) {
      // 副产开始的带子
      const begin = { x: beginX, y: beginY + this.blueprint.height - 1, z: this.blueprint.belt.belts.length + 1 };
      if (this.blueprint.surplusCount <= 0) {
        if (this.blueprint.surplusCount === 0 && this.blueprint.surplusJoinProduct) {
          // 副产参与生产，数量正好，集装后从右侧直接接入总线
          const busZ = this.blueprint.belt.getBeltIndex(this.blueprint.surplus);
          this.blueprint.belt.generateBelt(begin, { x: beginX + this.width, y: beginY + 1, z: busZ + 1, outputToSlot: 2 }, ["x", "z", "y"], "y");
        } else {
          // 副产参与生产且不足
          this.blueprint.belt.generateBelt(begin, { x: beginX + this.width, y: begin.y, z: begin.z, outputToSlot: 2 }, ["x", "y", "z"], "y");
          // 副产氢带子的对接位置为 right top 的宽度
          const rightTop = this.items[2] ? Math.max(this.items[2].inserter.length + 1, 3) : 0;
          const rightTopX = beginX + this.getLeftWidth() + Math.ceil(buildings[STATION].attributes.area[0]) * 2 + rightTop;
          this.blueprint.belt.generateBelt(
            { x: beginX + this.width, y: begin.y, z: begin.z },
            { x: rightTopX, y: beginY + 4, z: 6, outputToSlot: 2 },
            ["y", "z", "x"],
            "y",
            1
          );
        }
        // 集装分拣
        if (this.blueprint.recycleMode === 1) {
          this.blueprint.createInserter(
            3,
            this.blueprint.belt.getBelt({ x: beginX + this.width - 1, y: begin.y, z: begin.z }),
            this.blueprint.belt.getBelt({ x: beginX + this.width - 2, y: begin.y, z: begin.z })
          );
        }
      }
    }
  }

  generate(beginX, beginY) {
    if (this.blueprint.recycleMode === 1) {
      this.generateStation(beginX, beginY);
    } else {
      this.generates4Dir(beginX, beginY);
    }
  }

  generates4Dir(beginX, beginY) {
    let begin = beginX + 1;
    this.requireItems.forEach((item) => {
      const pointer = { x: begin + item.width - 1, y: beginY + 4, z: 0 };
      this.blueprint.belt.generateSplitter4Dir(pointer, [null, { type: "in" }, { type: "out", filter: item.item }, { type: "out" }], true); // 原料处加小箱子
      this.blueprint.belt.generateBelt({ x: pointer.x - 1, y: pointer.y, z: 0 }, { x: begin, y: pointer.y, z: 0 }, ["x", "y", "z"]);
      // 回收物品的带子
      const belts = this.blueprint.belt.generateBelt(
        { x: pointer.x, y: pointer.y - 1, z: 0 },
        { x: pointer.x - item.inserter.length, y: beginY, z: 0 },
        ["y", "x", "z"],
        "y"
      );
      belts[2].parameters = { iconId: ITEM_NAME_MAP.get(item.item).ID };
      this.blueprint.belt.generateBelt({ x: pointer.x - 1, y: pointer.y - 1, z: 0 }, { x: begin + 1, y: pointer.y, z: 0, outputToSlot: 2 }, ["x", "y", "z"]);

      // 生成分拣器
      item.inserter.forEach((inserter, index) => {
        // 先生成带子
        if (inserter.length < 3) {
          this.blueprint.belt.generateBelt(
            { x: pointer.x - 1 - index, y: beginY + inserter.length, z: 0 },
            { x: pointer.x - 1 - index, y: pointer.y - 1, z: 0, outputToSlot: 2 },
            ["x", "y", "z"]
          );
        }
        // 生成分拣器
        this.blueprint.createInserter(
          inserter.level,
          this.blueprint.belt.getBelt({ x: pointer.x - 1 - index, y: beginY, z: 0 }),
          this.blueprint.belt.getBelt({ x: pointer.x - 1 - index, y: beginY + inserter.length, z: 0 })
        );
      });
      // 结束时调整 beginX
      begin += item.width;
    });
    // 延长总线
    this.blueprint.belt.generateBelt({ x: beginX + 1, y: beginY + 4, z: 0 }, { x: beginX, y: beginY, z: 0 }, ["y", "x", "z"]);
    // 生成喷涂机
    if (this.blueprint.proliferatorLevel > 0) {
      const spray = this.blueprint.createBuildingInfo(SPRAY_COATER, { x: beginX + 1, y: beginY + 2, z: 0 });
      spray.yaw = [180, 180];
    }
  }

  generateStation(beginX, beginY) {
    let y = beginY + 1; // 物流塔从1开始，由于计算偏移时会向上取整，所以虽然是第2行，但是仍然从1开始
    let stationBeginX = beginX + this.getLeftWidth();
    // 生成建筑
    const stationInfo = buildings[STATION];
    this.stationObj = this.blueprint.createBuildingInfo(stationInfo.itemName, {
      x: stationBeginX + Math.ceil(stationInfo.attributes.area[0]), // 建筑宽度一半向上取整;
      y: y + Math.ceil(stationInfo.attributes.area[1]), //建筑中心点，建筑高度的一半
    });
    // 设置配方
    this.items.forEach((item, i) => {
      if (item.item) {
        this.stationObj.parameters.storage[i].itemId = ITEM_NAME_MAP.get(item.item).ID;
        this.stationObj.parameters.storage[i].localRole = item.type;
        this.stationObj.parameters.storage[i].max = 0;
      }
    });
    // 主产物进塔
    if (this.stationIndex === 0) {
      this.blueprint.belt.generateBelt({ x: beginX, y: 5, z: 0 }, { x: beginX + this.getLeftWidth(), y: 5, z: 0, stationSlot: 4 }, ["x", "z", "y"], "y");
    }
    // 副产处理
    if (this.stationIndex === 0 && this.blueprint.surplusCount > 0) {
      // 副产不参与生产 或 溢出，从左上入塔
      const y = this.blueprint.height - 4 + beginY;
      this.blueprint.belt.generateBelt(
        { x: beginX, y: beginY + this.blueprint.height - 1, z: this.blueprint.belt.belts.length + 1 },
        { x: beginX + this.getLeftWidth(), y, z: 0, stationSlot: 3 },
        ["z", "y", "x"],
        "y"
      );
    }
    // 生成喷涂机
    if (this.blueprint.proliferatorLevel > 0 && this.stationIndex === 0) {
      for (y = 0; y < this.blueprint.belt.belts.length; y++) {
        this.blueprint.createBuildingInfo(SPRAY_COATER, { x: beginX + 2, y: 2 - y, z: 0 });
      }
      // 喷涂剂输出
      this.blueprint.belt.generateBelt(
        {
          x: beginX + this.getLeftWidth(),
          y: beginY + 4,
          z: 0,
          stationSlot: 5,
          storageIdx: this.blueprint.produce === PRO_LIST[this.blueprint.proliferatorLevel - 1] ? 2 : 1, // 喷涂机输出槽位，生产喷涂并喷涂自身时，从第2个槽输出
        },
        { x: beginX + this.getLeftWidth() - 2, y: 3 - this.blueprint.belt.belts.length, z: 1 },
        ["x", "z", "y"],
        "y"
      );
    }
    // 生成回路
    if (this.stationIndex === 0) {
      if ((this.blueprint.surplus && this.blueprint.surplusJoinProduct) || !this.blueprint.surplus) {
        // 副产参与生产，或无副产
        this.items[2] && this.generateOutput3(beginX, beginY);
      }
      this.items[3] && this.generateOutput4(beginX, beginY);
    } else {
      this.items[0] && this.generateOutput1(beginX, beginY);
      this.items[1] && this.generateOutput2(beginX, beginY);
      this.items[2] && this.generateOutput3(beginX, beginY);
      this.items[3] && this.generateOutput4(beginX, beginY);
    }
  }

  // 生成物流塔的输出1
  generateOutput1(beginX, beginY) {
    const itemIndex = 0;
    const busZ = this.blueprint.belt.getBeltIndex(this.items[itemIndex].item) + 1; // 总线带子Z
    const x = beginX + this.getLeftWidth(); // 主线回收的起点
    const y = beginY + 2; // 主线回收的起点
    const z = 6; // 第6层分拣
    // 主线回收
    const recycMidX = Math.min(x - 3, x - this.items[itemIndex].inserter.length - 1); // 回收中点
    const recycEndX = recycMidX + this.items[itemIndex].inserter.length; // 回收终点
    const recycMidZ = 5; // 第5层输入原料
    const recycMidY = y + 2; // 回收中点，也是原料连接点
    const recycEndY = y + 4; // 回收终点
    this.blueprint.belt.generateBelt({ x, y, z: busZ }, { x: recycMidX, y, z: 0 }, ["z", "x", "y"], "x"); // 终点至少4格，或分拣器长度+2
    this.blueprint.belt.generateBelt({ x: recycMidX, y, z: 0 }, { x: recycMidX, y: recycMidY, z: recycMidZ }, ["z", "y", "x"], "y");
    this.blueprint.belt.generateBelt(
      { x: recycMidX, y: recycMidY, z: recycMidZ },
      { x: recycEndX, y: recycEndY, z }, //根据分拣器数量动态调整
      ["z", "y", "x"],
      "y"
    );
    this.blueprint.createInserter(
      3,
      this.blueprint.belt.getBelt({ x, y: y - 1, z: busZ }),
      this.blueprint.belt.getBelt({ x, y, z: busZ }),
      this.items[itemIndex].item
    );
    // 物流塔出口
    const belts = this.blueprint.belt.generateBelt(
      { x: x, y: recycMidY, z: 0, stationSlot: 5, storageIdx: itemIndex + 1, direct: 1 },
      { x: recycMidX, y: recycMidY, z: recycMidZ, outputToSlot: 2 },
      ["x", "z", "y"],
      "x",
      1 // 提前1格上升
    );
    // 物流塔集装分拣
    this.blueprint.stationPiler === 2 && this.blueprint.stackSize > 1 && this.blueprint.createInserter(3, belts[3], belts[2], this.items[itemIndex].item);
    // 输入总线的带子
    this.blueprint.belt.generateBelt({ x: recycEndX, y: y + 1, z }, { x: recycMidX, y: y - 1, z: busZ, outputToSlot: 2 }, ["x", "z", "y"], "y");
    // 生成分拣器带子
    this.items[itemIndex].inserter.forEach((inserter, index) => {
      if (inserter.length < 3) {
        this.blueprint.belt.generateBelt(
          { x: recycMidX + 1 + index, y: recycEndY - inserter.length, z },
          { x: recycMidX + 1 + index, y: y + 1, z, outputToSlot: 2 }
        );
      }
      this.blueprint.createInserter(
        inserter.level,
        this.blueprint.belt.getBelt({ x: recycMidX + 1 + index, y: recycEndY, z }),
        this.blueprint.belt.getBelt({ x: recycMidX + 1 + index, y: recycEndY - inserter.length, z })
      );
    });
  }

  // 生成物流塔的输出2
  generateOutput2(beginX, beginY) {
    const itemIndex = 1;
    const busZ = this.blueprint.belt.getBeltIndex(this.items[itemIndex].item) + 1; // 总线带子Z
    const x = beginX + this.getLeftWidth() - 1; // 主线回收的起点
    const y = beginY + this.blueprint.height - 2; // 主线回收的起点
    const z = 4; // 第4层分拣
    // 主线回收
    const recycMidY = y - 3;
    const recycMidX = x - Math.max(this.items[itemIndex].inserter.length, 2); // 回收终点
    this.blueprint.belt.generateBelt({ x, y: y - 2, z: busZ }, { x: recycMidX, y, z: busZ }, ["y", "x", "z"], "x");
    this.blueprint.belt.generateBelt({ x: recycMidX, y, z: busZ }, { x, y: recycMidY, z }, ["z", "y", "x"], "y");
    this.blueprint.createInserter(
      3,
      this.blueprint.belt.getBelt({ x, y: y + 1, z: busZ }),
      this.blueprint.belt.getBelt({ x, y: y - 2, z: busZ }),
      this.items[itemIndex].item
    );
    // // 物流塔出口
    const belts = this.blueprint.belt.generateBelt(
      { x: x + 1, y: y - 2, z: 0, stationSlot: 3, storageIdx: itemIndex + 1, direct: 1, station: this.stationObj },
      { x: x - 1, y: y, z: busZ, outputToSlot: 2 },
      ["x", "z", "y"],
      "y"
    );
    // 物流塔集装分拣
    this.blueprint.stationPiler === 2 && this.blueprint.stackSize > 1 && this.blueprint.createInserter(3, belts[3], belts[2], this.items[itemIndex].item);
    // 输入总线的带子
    const inputBeginX = x - this.items[itemIndex].inserter.length + 1; // 输入起点
    this.blueprint.belt.generateBelt({ x: inputBeginX, y, z }, { x: x + 2, y: y + 1, z: busZ, outputToSlot: 2 }, ["x", "z", "y"], "x");
    // 生成分拣器带子
    this.items[itemIndex].inserter.forEach((inserter, index) => {
      if (inserter.length < 3) {
        this.blueprint.belt.generateBelt({ x: inputBeginX + index, y: recycMidY + inserter.length, z }, { x: inputBeginX + index, y, z, outputToSlot: 2 });
      }
      this.blueprint.createInserter(
        inserter.level,
        this.blueprint.belt.getBelt({ x: inputBeginX + index, y: recycMidY, z }),
        this.blueprint.belt.getBelt({ x: inputBeginX + index, y: recycMidY + inserter.length, z })
      );
    });
  }

  // 生成物流塔的输出3
  generateOutput3(beginX, beginY) {
    const itemIndex = 2;
    const busZ = this.blueprint.belt.getBeltIndex(this.items[itemIndex].item) + 1; // 总线带子Z
    const x = beginX + this.width - this.getRightWidth(); // 主线回收的起点
    const y = beginY + this.blueprint.height - 2; // 主线回收的起点
    const z = 6; // 第6层分拣
    // 主线回收
    const recycMidX = Math.max(x + 3, x + this.items[itemIndex].inserter.length + 1); // 回收中点
    const recycEndX = recycMidX - this.items[itemIndex].inserter.length; // 回收终点
    const recycMidY = y - 2; // 回收中点，也是原料连接点
    const recycMidZ = 5; // 第5层输入原料
    const recycEndY = y - 4; // 回收终点
    this.blueprint.belt.generateBelt({ x, y, z: busZ }, { x: recycMidX, y, z: 0 }, ["z", "x", "y"], "x"); // 终点至少4格，或分拣器长度+2
    this.blueprint.belt.generateBelt({ x: recycMidX, y, z: 0 }, { x: recycMidX, y: recycMidY, z: recycMidZ }, ["z", "y", "x"], "y");
    this.blueprint.belt.generateBelt(
      { x: recycMidX, y: recycMidY, z: recycMidZ },
      { x: recycEndX, y: recycEndY, z }, //根据分拣器数量动态调整
      ["z", "y", "x"],
      "y"
    );
    this.blueprint.createInserter(
      3,
      this.blueprint.belt.getBelt({ x, y: y + 1, z: busZ }),
      this.blueprint.belt.getBelt({ x, y, z: busZ }),
      this.items[itemIndex].item
    );
    // 物流塔出口
    const belts = this.blueprint.belt.generateBelt(
      { x, y: recycMidY, z: 0, stationSlot: 11, storageIdx: itemIndex + 1, direct: -1, station: this.stationObj },
      { x: recycMidX, y: recycMidY, z: recycMidZ, outputToSlot: 2 },
      ["x", "z", "y"],
      "x",
      1 // 提前1格上升
    );
    // 物流塔集装分拣
    this.blueprint.stationPiler === 2 && this.blueprint.stackSize > 1 && this.blueprint.createInserter(3, belts[3], belts[2], this.items[itemIndex].item);
    // 输入总线的带子
    this.blueprint.belt.generateBelt({ x: recycEndX, y: y - 1, z }, { x: recycMidX, y: y + 1, z: busZ, outputToSlot: 2 }, ["x", "z", "y"], "y");
    // 生成分拣器带子
    this.items[itemIndex].inserter.forEach((inserter, index) => {
      if (inserter.length < 3) {
        this.blueprint.belt.generateBelt(
          { x: recycMidX - 1 - index, y: recycEndY + inserter.length, z },
          { x: recycMidX - 1 - index, y: y - 1, z, outputToSlot: 2 }
        );
      }
      this.blueprint.createInserter(
        inserter.level,
        this.blueprint.belt.getBelt({ x: recycMidX - 1 - index, y: recycEndY, z }),
        this.blueprint.belt.getBelt({ x: recycMidX - 1 - index, y: recycEndY + inserter.length, z })
      );
    });
  }

  // 生成物流塔的输出4
  generateOutput4(beginX, beginY) {
    const itemIndex = 3;
    const busZ = this.blueprint.belt.getBeltIndex(this.items[itemIndex].item) + 1; // 总线带子Z
    const x = beginX + this.width - this.getRightWidth() + 1; // 主线回收的起点
    const y = beginY + 2; // 主线回收的起点
    const z = 4; // 第4层分拣
    // 主线回收
    const recycMidY = y + 3;
    const recycMidX = x + Math.max(this.items[itemIndex].inserter.length, 2); // 回收终点
    this.blueprint.belt.generateBelt({ x, y: y + 2, z: busZ }, { x: recycMidX, y, z: busZ }, ["y", "x", "z"], "x");
    this.blueprint.belt.generateBelt({ x: recycMidX, y, z: busZ }, { x, y: recycMidY, z }, ["z", "y", "x"], "y");
    this.blueprint.createInserter(
      3,
      this.blueprint.belt.getBelt({ x, y: y - 1, z: busZ }),
      this.blueprint.belt.getBelt({ x, y: y + 2, z: busZ }),
      this.items[itemIndex].item
    );
    // 物流塔出口
    const belts = this.blueprint.belt.generateBelt(
      { x: x - 1, y: y + 2, z: 0, stationSlot: 9, storageIdx: itemIndex + 1, direct: -1, station: this.stationObj },
      { x: x + 1, y: y, z: busZ, outputToSlot: 2 },
      ["x", "z", "y"],
      "y"
    );
    // 物流塔集装分拣
    this.blueprint.stationPiler === 2 && this.blueprint.stackSize > 1 && this.blueprint.createInserter(3, belts[3], belts[2], this.items[itemIndex].item);
    // 输入总线的带子
    const inputBeginX = x + this.items[itemIndex].inserter.length - 1; // 输入起点
    this.blueprint.belt.generateBelt({ x: inputBeginX, y, z }, { x: x - 2, y: y - 1, z: busZ, outputToSlot: 2 }, ["x", "z", "y"], "x");
    // 生成分拣器带子
    this.items[itemIndex].inserter.forEach((inserter, index) => {
      if (inserter.length < 3) {
        this.blueprint.belt.generateBelt({ x: x + index, y: recycMidY - inserter.length, z }, { x: x + index, y, z, outputToSlot: 2 });
      }
      this.blueprint.createInserter(
        inserter.level,
        this.blueprint.belt.getBelt({ x: x + index, y: recycMidY, z }),
        this.blueprint.belt.getBelt({ x: x + index, y: recycMidY - inserter.length, z })
      );
    });
  }
}

/**
 * 环带总线传送带单元
 */
class BeltUnit {
  blueprint;
  beltUsageRate = 0; // 带子使用率，0-100
  belts = []; // 传送带分配记录，每条带子是一个 Map<item, share>
  itemMap = {}; // 每个物品的份数：{ item, share }

  constructor(blueprint) {
    this.blueprint = blueprint;
  }

  compute() {
    const filterItems = [this.blueprint.produce]; //过滤增产和主产物
    if (!PRO_LIST.includes(this.blueprint.produce)) {
      // 不生产增产剂时，无需将增产剂加入到总线中
      filterItems.push(...PRO_LIST);
    }
    const items = this.blueprint.produceUnits // 传送带上的一份物品
      .filter((unit) => !filterItems.includes(unit.item) && unit.item !== this.blueprint.produce)
      .map((unit) => {
        if (unit.item === this.blueprint.surplus) {
          // 有副产参与生产时，总线只记录需求的数量
          if (this.blueprint.surplusJoinProduct) {
            return {
              item: unit.item,
              share: Math.max(
                Math.ceil((unit.theoryOutput - (this.blueprint.surplusCount > 0 ? this.blueprint.surplusCount : 0)) / this.blueprint.shareSize),
                2
              ), // 减去溢出部分是总线上的数量
            };
          }
        } else {
          return {
            item: unit.item,
            share: Math.max(Math.ceil(unit.theoryOutput / this.blueprint.shareSize), 2), // 最小是2份
          };
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.share - b.share);
    const beltSize = BELT_SHARE_SIZE[this.blueprint.beltLevel]; // 单条带子最大值
    if (items.length / beltSize > 3) {
      // 物品数不能超过3个传送带
      throw new Error(`中间产物 ${items.length} 种，超过传送带最大容量 (${beltSize} * 3 = ${beltSize * 3})，请修改配方减少中间产物种类。`);
    }
    this.blueprint.multiple = Math.ceil(items[0].share / beltSize);
    if (this.blueprint.multiple > 1) {
      // todo: 未来再考虑支持多份蓝图的情况
    }
    const shareCount = items.reduce((a, b) => a + b.share, 0);
    const beltCount = Math.ceil(shareCount / beltSize);
    const maxBeltCount = this.blueprint.recycleMode === 1 ? 3 : 1;
    if (beltCount > (this.blueprint.recycleMode === 1 ? 3 : 1)) {
      throw new Error(`中间产物 ${shareCount} 份，超过传送带最大容量 ${beltSize} * ${maxBeltCount} = ${beltSize * maxBeltCount}(份)。`);
    }
    const beltUsage = [];
    const beltItems = []; // item[][]
    for (let i = 0; i < beltCount; i++) {
      beltItems.push([]);
      beltUsage.push(0);
    }
    // 分配物品到传送带
    items.sort((a, b) => b.share - a.share).forEach((item) => {
      let allocate = false;
      // 尽量平均分到两个带子
      // 获得 beltUsage 最小值与下标
      const minUsage = Math.min(...beltUsage);
      const minUsageIndex = beltUsage.indexOf(minUsage);
      if (beltUsage[minUsageIndex] + item.share <= beltSize) {
        beltItems[minUsageIndex].push(item);
        beltUsage[minUsageIndex] += item.share;
        allocate = true;
      }
      if (!allocate) {
        throw new Error(`分配 ${item.item} 时超过传送带最大容量。`);
      }
      this.itemMap[item.item] = item.share;
    });
    console.log("itemMap:", this.itemMap);
    this.belts = beltItems.map((belt) => new Map(belt.map((item) => [item.item, item.share])));
    console.log("总线分布：", this.belts);

    // 传送带利用率：总物品数
    this.beltUsageRate = ((shareCount / this.blueprint.multiple / (beltCount * (beltSize + 1))) * 100).toFixed(2);
    console.log("传送带带宽利用率：", this.beltUsageRate);
  }

  /**
   * 获取带子对象
   * @param {*} location
   */
  getBelt(location) {
    const belt = this.blueprint.getBuildingInfo(BELT_LEVEL[this.blueprint.beltLevel], location);
    if (!belt) {
      try {
        console.warn(`未找到传送带: ${BELT_LEVEL[this.blueprint.beltLevel]} 于`, location);
      } catch (e) {
        // 在极少数环境下 console.warn 可能不可用，静默失败以不影响运行
      }
    }
    return belt;
  }

  getBeltOrCreate(location) {
    return (
      this.blueprint.getBuildingInfo(BELT_LEVEL[this.blueprint.beltLevel], location) ||
      this.blueprint.createBuildingInfo(BELT_LEVEL[this.blueprint.beltLevel], location)
    );
  }

  createBelt(location) {
    return this.blueprint.createBuildingInfo(BELT_LEVEL[this.blueprint.beltLevel], location);
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
   * 生成带子
   * @param {*} matrix
   * @param {*} begin {x, y, z, stationSlot, storageIdx, direct, station} 从物流塔输出时，stationSlot 和 storageIdx 有值, direct 出塔方向，开始和结束节点一样时有效：1,-1
   * @param {*} end {x, y, z, stationSlot, outputToSlot, station} 输入到物流塔时，stationSlot 有值
   * @param {*} priority ['x', 'y', 'z']
   * @param {*} zDirection 'z'
   * @param {*} zDirectForward 升降提前几格
   */
  generateBelt(begin, end, priority = ["x", "y", "z"], zDirection = "x", zDirectForward = 1) {
    checkPointer(begin);
    checkPointer(end);
    let current = begin;
    let zDirectionAdded = false;
    let lastDirection = priority[0]; // 上一次的方向
    const vertical = begin.z > end.z ? "down" : "up"; // 垂直方向
    let factor = 0.0016; // 升降时的位移因子
    if (
      (begin[zDirection] < end[zDirection] && begin.z < end.z) || // 向东 或 北 上升
      (begin[zDirection] > end[zDirection] && begin.z > end.z) // 向西 或 南 下降
    ) {
      factor = -0.0016;
    }
    let tmpI;
    let belt;
    let last = this.getBeltOrCreate(begin); // 起点
    const belts = [last];
    if (begin.stationSlot != null) {
      // 起点是物流塔
      const station = this.blueprint.matrix[begin.y][begin.x].find((item) => item.itemName === STATION) || begin.station;
      if (!station) {
        throw new Error("物流站未找到.");
      }
      const direct = begin.direct || (begin.x > end.x ? 1 : -1);
      const belt1 = this.createBelt({
        x: begin.x + direct * 2,
        y: begin.y,
        z: begin.z,
      });
      const belt2 = this.createBelt({
        x: begin.x + direct,
        y: begin.y,
        z: begin.z,
      });
      belts.unshift(belt1, belt2);
      belt1.inputFromSlot = begin.stationSlot; // 物流塔的输出槽
      belt1.inputObjIdx = station;
      belt1.outputObjIdx = belt2;
      belt2.outputObjIdx = last;
      station.parameters.slots[begin.stationSlot].dir = 1; // 输出
      station.parameters.slots[begin.stationSlot].storageIdx = begin.storageIdx;
    }
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
        belt = this.getBeltOrCreate(cursorOffset);
        last.outputObjIdx = belt;
        if (tmpI !== "z" && i !== "z" && lastDirection !== i) {
          // 带子转弯
          belt.yaw = last.yaw = [315, 315];
        }
        if (tmpI === "z") {
          // 增加偏移
          if (vertical === "up") {
            last.localOffset[0][zDirection] += (Math.round(end.z - cursorOffset.z) + 1) * factor;
          } else {
            belt.localOffset[0][zDirection] += (Math.round(cursorOffset.z - end.z) + 1) * factor;
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
      belts[belts.length - 2].outputToSlot = typeof end.outputToSlot === "number" ? end.outputToSlot : 2;
    } else if (end.stationSlot != null) {
      // 结束点是物流塔
      const station = this.blueprint.matrix[end.y][end.x].find((item) => item.itemName === STATION) || end.station;
      if (!station) {
        throw new Error("物流站未找到.");
      }
      const belt1 = this.createBelt({
        x: end.x + 1,
        y: end.y,
        z: end.z,
      });
      belt.outputObjIdx = belt1;
      const belt2 = this.createBelt({
        x: end.x + 2,
        y: end.y,
        z: end.z,
      });
      belt1.outputObjIdx = belt2;
      belt2.outputObjIdx = station;
      belt2.outputToSlot = end.stationSlot; // 传送带的输出槽要对应物流塔的输入槽
      station.parameters.slots[end.stationSlot].dir = 2;
    }
    return belts;
  }

  /**
   *
   * @param {*} solts 上、右、下、左：{ type: in|out, priority, filter}
   */
  generateSplitter4Dir(pointer, solts = [], storage = false) {
    checkPointer(pointer);
    const splitter = this.blueprint.createBuildingInfo(SPLITTER_4DIR, pointer);
    if (storage) {
      const storageObj = this.blueprint.createBuildingInfo(STORAGE, { x: pointer.x, y: pointer.y, z: 2 });
      storageObj.inputObjIdx = splitter;
    }
    const belts = [];
    solts.forEach((solt, i) => {
      if (solt) {
        const begin = Object.assign({}, pointer); // 入口方向
        const end = Object.assign({}, pointer); // 出口方向
        switch (i) {
          case 0:
            end.y += 1;
            begin.y += 0.2;
            break;
          case 1:
            end.x += 1;
            begin.x += 0.2;
            break;
          case 2:
            end.y -= 1;
            begin.y -= 0.2;
            break;
          case 3:
            end.x -= 1;
            begin.x -= 0.2;
            break;
        }
        const first = this.createBelt(begin); // 内部的带子
        const second = this.createBelt(end); // 外部的带子
        belts.push(second);
        if (solt.type === "in") {
          second.outputObjIdx = first; // 外部带子输出到内部带子
          first.outputObjIdx = splitter; // 内部带子输出到分流器
          first.outputToSlot = i; // 分流器输入槽
        } else {
          first.outputObjIdx = second; // 内部带子输出到外部带子
          first.inputObjIdx = splitter; // 分流器输入到内部带子
          first.inputFromSlot = i; // 分流器输出槽
        }
        (solt.priority || solt.filter) && (splitter.parameters.priority[i] = true);
        (solt.priority || solt.filter) && (splitter.parameters.priority[i] = true);
        if (solt.filter) {
          splitter.filterId = typeof solt.filter === "string" ? ITEM_NAME_MAP.get(solt.filter).ID : solt.filter;
        }
      } else {
        belts.push(null);
      }
    });
    return belts;
  }
}
