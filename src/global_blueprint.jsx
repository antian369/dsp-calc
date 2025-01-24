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

const RAW_FACTORY = [
  "采矿机",
  "大型采矿机",
  "轨道采集器",
  "行星基地",
  "抽水站",
  "射线接收站",
  "原油萃取站",
]; // 产出原矿的工石

const ITEM_NAME_MAP = items.reduce((a, b) => a.set(b.Name, b), new Map());
const ITEM_ID_MAP = items.reduce((a, b) => a.set(b.ID, b), new Map());
const RECIPE_ID_MAP = recipes.reduce((a, b) => a.set(b.ID, b), new Map());
const PRO_LIST = ["增产剂 Mk.I", "增产剂 Mk.I", "增产剂 Mk.III"];
const INSERTER_TYPE = ["分拣器", "高速分拣器", "极速分拣器"];
const BELT_LEVEL = ["传送带", "高速传送带", "极速传送带"];
const BELT_SHARE_SIZE = [23, 47, 119]; // 传送带容量，理论最大值-1

const BUILDINGS_STRING = new Map();
for (const k in buildings) {
  BUILDINGS_STRING.set(k, JSON.stringify(buildings[k]));
}

/**
 * 获取建筑蓝图信息
 * @param {*} name
 */
function getBuildingInfo(name) {
  return JSON.parse(BUILDINGS_STRING.get(name));
}

/**
 * 计算需要的分拣器数量
 * @param {*} share
 */
function getInserterScheme(share) {
  const scheme = [];
  if (share % 2 === 1) {
    share -= 3;
    scheme.push(inserterSettings[7]);
  }
  while (share > 0) {
    for (const setting of inserterSettings) {
      if (share >= setting.share) {
        scheme.push(setting);
        share -= setting.share;
        break;
      }
    }
  }
  return scheme.sort((a, b) => b.share - a.share);
}

export function generateBlueprint(allProduceUnits, surplusList, produces) {
  const produceUnits = mergeProduceUnits(
    allProduceUnits,
    surplusList,
    produces
  );
  const { order, rawMaterial } = orderRecipe(produceUnits);
  console.log("原料:", rawMaterial);
  console.log("订单:", order);
  const buleprint = new MixedConveyerBeltBuleprint(
    Object.keys(produces)[0],
    Object.values(produces)[0],
    produceUnits,
    surplusList,
    order,
    rawMaterial
  );
  buleprint.compute();
}

/**
 * 取整
 * @param {*} obj
 */
function round(obj) {
  for (const k in obj) {
    switch (typeof obj[k]) {
      case "number":
        obj[k] = Math.round(obj[k]);
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
  let unSortedRecipes = produceUnits
    .filter((unit) => unit.grossOutput > 0)
    .map((unit) => RECIPE_ID_MAP.get(unit.recipeId));
  const rawMaterial = {}; // 原料
  // 源矿加入已排序的配方
  produceUnits
    .filter((unit) => RAW_FACTORY.includes(unit.factory))
    .forEach((unit) => {
      sortedItem.add(ITEM_NAME_MAP.get(unit.item).ID);
      rawMaterial[unit.item] = unit.theoryOutput;
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
function mergeProduceUnits(allProduceUnits, surplusList, produces) {
  if (Object.entries(produces).length !== 1) {
    throw new Error("只支持一种品。");
  }
  const producePro = PRO_LIST.find((item) => produces[item]);
  if (
    !producePro &&
    allProduceUnits.find(
      (unit) => PRO_LIST.includes(unit.item) && !unit.isMineralized
    )
  ) {
    throw new Error("必须将增产剂设置为原矿。");
  }
  allProduceUnits.forEach((unit) => {
    unit.recipeId = recipes[unit.recipe].ID; // 传入的 recipe 是下标，比ID少1，此处换为ID
  });
  round(allProduceUnits);
  return allProduceUnits;
}

/**
 * 图片蓝图生成器
 */
class MixedConveyerBeltBuleprint {
  recycleMode = "集装分拣器"; // 回收方式: "四向分流器" | "集装分拣器"
  stackCount = 4; // 堆叠数量: 1 | 2 | 4
  inserterMixLevel = 2; // 输入混带的最高级别：0-分拣器，1-高速分拣器，2-极速分拣器
  proliferatorLevel = 1; // 喷涂：1-无，2-MK.1，3-MK.2，4-MK.3
  beltLevel = 2; // 传送带级别：0-黄带，1-绿带，2-蓝带
  multiple = 1; // 蓝图倍数
  height = 0; // 蓝图高度，固定值
  surplus = []; // 副产物
  // 副产物是否可被消耗完
  // 副产物优先消耗，物流塔的优先级最高
  // 配方详情
  // 序号生成器
  // 计算供电站位置
  // 原料 + 中间产物 大于2才能使用混带
  produceUnits; // 生产单元
  rawMaterial; // 原料
  shareSize = 60; // 一份的大小
  produce; // 蓝图产物
  produceId; // 产物id
  produceCount; // 产物数量

  buildings = []; // 建筑单元
  stations = []; // 物流塔单元
  belt; // 传送带单元

  constructor(
    produce, // string，蓝图生产目标物品
    produceCount,
    produceUnits,
    surplusList,
    order, // Recipe, 订单排序
    rawMaterial // Record<string, number> 原矿列表
  ) {
    this.produce = produce;
    this.produceId = ITEM_NAME_MAP.get(produce).ID;
    this.produceCount = produceCount;
    this.produceUnits = produceUnits;
    this.rawMaterial = rawMaterial;
    for (const item in surplusList) {
      this.surplus.push(item);
    }
    this.proliferatorLevel = produceUnits.reduce(
      (a, b) => Math.max(a, b.proNum),
      1
    );
    console.log("produceUnits:", produceUnits);
    this.belt = new BeltUnit(this);
    this.shareSize = this.stackCount * 15; // 一份的容量

    const produceMap = produceUnits
      .filter((unit) => unit.grossOutput > 0)
      .reduce((a, b) => a.set(b.recipeId, b), new Map());
    this.buildings = order.map(
      (recipe) => new BuildingUnit(this, recipe, produceMap.get(recipe.ID))
    );

    // 是否有副产氢
    const Hid = ITEM_NAME_MAP.get("氢").ID;
    const hasSurplusH =
      produce !== "氢" && produceUnits.find((unit) => unit.item === "氢");
    // 副产氢是否参与生产
    const hasItemH = !!order.find((o) => o.Items.includes(Hid));
    // 副产氢是否足够
    const surplusHEnough = !produceUnits.find((unit) => unit.item === "氢")
      ?.grossOutput;
    const overflowH = this.surplus.includes("氢");
    console.log(
      `产出氢: ${hasSurplusH}, 氢参与生产:${hasItemH}, 副产氢足够:${surplusHEnough}, 溢出氢:${overflowH}`
    );

    // 物流塔物品种类数：喷涂 + 产出 + 副产 + 原矿
    const stationItems = [{ item: produce, type: 2 }]; // {item, type}, 物流塔，type 1-需求，2供应
    if (this.proliferatorLevel > 1) {
      // todo: 还需加入喷涂类型，未传入
      // 喷涂
      stationItems.push({
        item: PRO_LIST[this.proliferatorLevel - 2],
        type: 1,
      });
    }
    if (overflowH) {
      stationItems.push({
        item: "氢",
        type: 2, // 氢溢出时供应
      });
    }
    if (!surplusHEnough && !overflowH) {
      stationItems.push({
        item: "氢",
        type: 1, // 副产氢不够时需求
      });
    }
    // 加入副产
    this.surplus
      .filter((item) => item !== "氢")
      .forEach((item) => stationItems.push({ item, type: 2 }));
    // 加入原矿
    for (const item in rawMaterial) {
      item !== "氢" &&
        stationItems.push({
          item,
          type: 1,
        });
    }
    // 分配物流塔
    for (let i = 0; i < stationItems.length; i += 4) {
      this.stations.push(new StationUnit(this, stationItems.slice(i, i + 4)));
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
  }

  /**
   * 将主要建筑画到二维数组里
   */
  draw() {
    // 1. 物流塔、输出传送带
    // 2. 工厂建筑、输出传送带
    // 3. 总线传送带
    // 4. 喷涂机
    // 5. 电线杆
  }

  /**
   * 生成
   */
  generate() {
    // 5. 工厂输入分拣器
    // 6. 工厂输出分拣器
    // 8. 传送带对接总线
  }
}

/**
 * 建筑单元
 */
class BuildingUnit {
  buleprint;
  factoryId;
  itemId;
  inserters = [];
  surplus = [];
  // 角度
  // 位置: x, y
  // width，只要宽度即可，高度固定，由蓝图决定
  // 计算输入物品位置
  // 输出物品：
  // 计算输出物品位置
  // 副产品：物品、数量
  // 计算副产品输出位置，蓝图有副产，输出到物流塔，否则输出到传送带
  // 增产 | 加速
  recycleMode = "集装分拣器"; // 回收方式: "四向分流器" | "集装分拣器" //
  recipe; // 配方： Recipe
  produce; // 生产要素:ProduceUnit
  constructor(buleprint, recipe, produce) {
    this.buleprint = buleprint;
    this.recipe = recipe;
    this.produce = produce;
    this.factoryId = ITEM_NAME_MAP.get(produce.factory).ID;
    this.itemId = ITEM_NAME_MAP.get(produce.item).ID;
    console.log(
      `生产 ${produce.item}[${this.itemId}] ${produce.theoryOutput}个 需 ${
        produce.factory
      }[${this.factoryId}] ${
        produce.factoryNumber
      }个，原料：${recipe.Items.join()}, 产出：${recipe.Results.join()}`
    );
  }

  compute() {
    this.inserters = getInserterScheme(
      Math.ceil(this.produce.grossOutput / this.buleprint.shareSize)
    );
    this.itemId = ITEM_NAME_MAP.get(this.produce.item).ID;
    this.surplus = this.recipe.Results.filter((id) => id !== this.itemId);
    console.log(
      `建筑：${this.produce.factory}， 输出：${
        this.produce.item
      },副产：${this.surplus
        .map((id) => ITEM_ID_MAP.get(id).Name)
        .join()}, 分拣器：`,
      this.inserters
    );
  }
}

/**
 * 物流塔单元
 */
class StationUnit {
  buleprint;
  stationId = 2103; // 物流塔id
  requireItems = []; // 需求列表
  provideItems = []; // 供应列表
  // 是否有物流塔
  // 配方
  // 建筑名稱
  // id
  // 角度
  // 位置: x, y
  // 数量
  // width
  // 配方
  // 输入物品：物品、数量
  // 计算输入物品位置
  // 输出物品：
  // 计算输出物品位置
  constructor(buleprint, items) {
    // todo：蓝图计算物流塔分配，StationUnit 只负责生成建筑
    this.buleprint = buleprint;
    items.forEach((item) =>
      item.type === 1
        ? this.requireItems.push(item)
        : this.provideItems.push(item)
    );
  }

  // 是否有喷涂剂
  hasProliferator() {
    return this.buleprint.proliferatorLevel > 1;
  }

  // 计算
  compute() {
    this.requireItems.forEach(
      (item) =>
        (item.inserter = getInserterScheme(
          this.buleprint.belt.itemMap[item.item]
        ))
    );

    console.log(
      "物流塔需求：",
      this.requireItems,
      "，供应：",
      this.provideItems
    );
  }
}

/**
 * 传送带单元
 */
class BeltUnit {
  buleprint;
  beltUsageRate = 0; // 带子使用率，0-100
  belts = []; // 传送带分配记录，每条带子是一个 Map<item, share>
  itemMap = {}; // 每个物品的份数：{ item, share }

  constructor(buleprint) {
    this.buleprint = buleprint;
  }

  compute() {
    const filterItems = [...PRO_LIST, ...this.buleprint.surplus];
    const items = this.buleprint.produceUnits // 传送带上的一份物品
      .filter(
        (unit) =>
          !filterItems.includes(unit.item) &&
          unit.item !== this.buleprint.produce
      )
      .map((unit) => ({
        item: unit.item,
        share: Math.max(
          Math.ceil(unit.theoryOutput / this.buleprint.shareSize),
          2
        ), // 最小是2份
      }))
      .sort((a, b) => b.share - a.share);
    const beltSize = BELT_SHARE_SIZE[this.buleprint.beltLevel]; // 单条带子最大值
    if (items / beltSize > 3) {
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
    this.belts = beltItems.map(
      (belt) => new Map(belt.map((item) => [item.item, item.share]))
    );
    console.log(this.belts);

    const itemsCount = this.buleprint.produceUnits.reduce(
      (a, b) => a + b.theoryOutput,
      0
    );
    // 传送带利用率：总物品数
    this.beltUsageRate = (
      (itemsCount /
        this.buleprint.multiple /
        (beltCount * beltSize * this.buleprint.shareSize)) *
      100
    ).toFixed(2);
  }

  /**
   * 返回物品所在带子的序号
   * @param {*} item
   */
  getBeltIndex(item) {
    for (let i = 0; i < this.belts.length; i++) {
      if (this.belts[i].has(item)) {
        return i;
      }
    }
  }
}
