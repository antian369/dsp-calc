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

export function generateBlueprint(allProduceUnits, surplusList) {
  // console.log("produceUnits: ", JSON.stringify(allProduceUnits));
  // console.log("surplusList: ", JSON.stringify(surplusList));
  const produceUnits = mergeProduceUnits(allProduceUnits, surplusList);
  const { order, rawMaterial } = orderRecipe(produceUnits);
  console.log("原料:", rawMaterial);
  console.log("订单:", order);
  const buleprint = new MixedConveyerBeltBuleprintGenerator(
    produceUnits,
    surplusList,
    order,
    rawMaterial
  );
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
class MixedConveyerBeltBuleprintGenerator {
  recycleMode = "集装分拣器"; // 回收方式: "四向分流器" | "集装分拣器"
  stackCount = 4; // 堆叠数量: 1 | 2 | 4
  inserterMixLevel = 3; // 输入混带的最高级别：1-分拣器，2-高速分拣器，3-极速分拣器
  proliferatorLevel = 0; // 喷涂：1-无，2-MK.1，3-MK.2，4-MK.3
  buleprintCount = 1; // 蓝图数量
  height = 0; // 高度，固定值
  // 暂时只支持一种产物
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
  constructor(produceUnits, surplusList, order, rawMaterial) {
    for (const item in surplusList) {
      this.surplus.push(item);
    }
    this.proliferatorLevel = produceUnits.reduce(
      (a, b) => Math.max(a, b.proNum),
      1
    );
    this.buildings = order.map((r) => new BuildingUnit(r));
    this.belt = new BeltUnit(produceUnits, rawMaterial, this.surplus);
  }
}

/**
 * 建筑单元
 */
class BuildingUnit {
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
  constructor(recipe) {}
}

/**
 * 物流塔单元
 */
class StationUnit {
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
  constructor(produceUnits, rawMaterial) {}
}

/**
 * 传送带单元
 */
class BeltUnit {
  beltType = 1; // 带子数量，最大不超过3
  beltUsageRate = 0; // 带子使用率，0-100
  // 带子数量
  // 物品数量以及位置，将使用量大的物品放在内侧
  // 传送带分配记录
  constructor(produceUnits, rawMaterial, surplus) {}
}
