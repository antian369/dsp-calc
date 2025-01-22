/**
 * 混带蓝图生成器
 */

import { recipes, items } from "../data/Vanilla.json";

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
const PRO_LIST = ["增产剂 Mk.I", "增产剂 Mk.I", "增产剂 Mk.III"];
const BELT_SHARE_SIZE = [23, 47, 119]; // 传送带容量，理论最大值-1

export function generateBlueprint(allProduceUnits, surplusList, produces) {
  // console.log("produceUnits: ", JSON.stringify(allProduceUnits));
  // console.log("surplusList: ", JSON.stringify(surplusList));
  if (Object.entries(produces).length !== 1) {
    throw new Error("只支持一种品。");
  }
  round(allProduceUnits);
  const produceUnits = mergeProduceUnits(allProduceUnits, surplusList);
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
  let unSortedRecipes = produceUnits.map((unit) => recipes[unit.recipe]);
  const rawMaterial = {}; // 原料
  // 源矿加入已排序的配方
  produceUnits
    .filter((unit) => RAW_FACTORY.includes(unit.factory))
    .forEach((unit) => {
      sortedItem.add(ITEM_NAME_MAP.get(unit.item).ID);
      rawMaterial[unit.item] = unit.theoryOutput;
    });
  while (unSortedRecipes.length) {
    const failrecipes = [];
    const lastUnSortedLength = unSortedRecipes.length;
    unSortedRecipes.forEach((recipe) => {
      if (recipe.Items.find((id) => !sortedItem.has(id))) {
        // 存在未排序的原料
        failrecipes.push(recipe);
      } else {
        // 所有原料都已排序，将产物加入到已排序
        recipe.Results.forEach((id) => sortedItem.add(id));
        sortRecipes.push(recipe);
      }
    });
    unSortedRecipes = failrecipes;
    console.log("unSortedRecipes:", lastUnSortedLength, unSortedRecipes.length);
    if (lastUnSortedLength === unSortedRecipes.length) {
      break;
    }
  }
  const order = sortRecipes.filter((r) => r.Type !== -1).reverse(); // 过滤黑雾生成并倒序返回
  return { order, rawMaterial };
}

function mergeProduceUnits(allProduceUnits, surplusList) {
  // 按照配方整理
  return allProduceUnits;
}

/**
 * 图片蓝图生成器
 */
class MixedConveyerBeltBuleprint {
  recycleMode = "集装分拣器"; // 回收方式: "四向分流器" | "集装分拣器"
  stackCount = 4; // 堆叠数量: 1 | 2 | 4
  inserterMixLevel = 3; // 输入混带的最高级别：1-分拣器，2-高速分拣器，3-极速分拣器
  proliferatorLevel = 0; // 喷涂：1-无，2-MK.1，3-MK.2，4-MK.3
  beltLevel = 2; // 传送带级别：0-黄带，1-绿带，2-蓝带
  multiple = 1; // 蓝图倍数
  height = 0; // 蓝图高度，固定值
  surplus = []; // 副产物
  // 副产物是否可被消耗完
  // 副产物优先消耗，物流塔的优先级最高
  // 配方详情
  // 某个带子单一物品达到最高则直接连接
  // 序号生成器
  // 计算供电站位置
  // 原料 + 中间产物 大于2才能使用混带
  buildings = []; // 建筑单元
  stations = []; // 物流塔单元
  belt; // 传送带单元
  produceUnits; // 生产单元
  order; // 配方排序
  rawMaterial; // 原料
  shareSize = 60; // 一份的大小
  produce; // 蓝图产物
  produceCount; // 产物数量
  constructor(
    produce,
    produceCount,
    produceUnits,
    surplusList,
    order,
    rawMaterial
  ) {
    this.produce = produce;
    this.produceCount = produceCount;
    this.produceUnits = produceUnits;
    this.order = order;
    this.rawMaterial = rawMaterial;
    for (const item in surplusList) {
      this.surplus.push(item);
    }
    this.proliferatorLevel = produceUnits.reduce(
      (a, b) => Math.max(a, b.proNum),
      1
    );
    this.buildings = order.map(() => new BuildingUnit(this));
    this.belt = new BeltUnit(this);
    this.shareSize = this.stackCount * 15;
  }

  /**
   * 计算利用率
   */
  compute() {
    this.belt.compute();
    console.log("传送带利用率：", this.belt.beltUsageRate);
  }

  /**
   * 生成
   */
  generate() {}
}

/**
 * 建筑单元
 */
class BuildingUnit {
  buleprint;
  // 建筑名稱
  // id
  // 角度
  // 位置: x, y
  // 数量
  // width，只要宽度即可，高度固定，由蓝图决定
  // 配方
  // 输入物品：物品、数量
  // 计算输入物品位置
  // 输出物品：
  // 计算输出物品位置
  // 副产品：物品、数量
  // 计算副产品输出位置，蓝图有副产，输出到物流塔，否则输出到传送带
  // 增产 | 加速
  recycleMode = "集装分拣器"; // 回收方式: "四向分流器" | "集装分拣器" // 分拣器方式需要堆叠后输出
  constructor(buleprint) {
    this.buleprint = buleprint;
  }
}

/**
 * 物流塔单元
 */
class StationUnit {
  buleprint;

  // 是否有喷涂剂
  // 是否有副产物
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
  constructor(buleprint) {
    this.buleprint = buleprint;
  }
}

/**
 * 传送带单元
 */
class BeltUnit {
  buleprint;
  beltUsageRate = 0; // 带子使用率，0-100
  belts = []; // 传送带分配记录，每条带子是一个 Map<item, share>

  constructor(buleprint) {
    this.buleprint = buleprint;
  }

  compute() {
    const filterItems = [...PRO_LIST, ...this.buleprint.surplus];
    const items = this.buleprint.produceUnits
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
    const beltItems = [];
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
    });
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
