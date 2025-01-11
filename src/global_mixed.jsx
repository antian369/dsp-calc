/**
 * 混带蓝图生成器
 */
export class MixedConveyerBeltBuleprintGenerator {
  recycleMode = "集装分拣器"; // 回收方式: "四向分流器" | "集装分拣器"
  stackCount = 4; // 堆叠数量: 1 | 2 | 4
  inserterMixLevel = 3; // 输入混带的最高级别：1-分拣器，2-高速分拣器，3-极速分拣器
  proliferatorLevel = 3; // 喷涂：0-无，1-MK.1，2-MK.2，3-MK.3
  buleprintCount = 1; // 蓝图数量
  beltCount = 1; // 带子数量，最大不超过3
  beltUsageRate = 0; // 带子使用率，0-100
  height = 0; // 高度，固定值
  // 暂时只支持一种产物
  // 是否有副产物
  // 副产物是否可被消耗完
  // 副产物优先消耗，物流塔的优先级最高
  // 配方详情
  // 某个带子单一物品达到最高则直接连接
  // 序号生成器
  // 计算供电站位置
  // 原料 + 中间产物 大于2才能使用混带
  buildings = []; // 建筑单元
  stations = []; // 物流塔单元
  belt = new BeltUnit(); // 传送带单元
  constructor() {}
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
  constructor() {}
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
  constructor() {}
}

/**
 * 传送带单元
 */
class BeltUnit {
  // 带子数量
  // 物品数量以及位置，将使用量大的物品放在内侧
  // 传送带分配记录
  constructor() {}
}
