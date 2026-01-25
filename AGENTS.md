# AGENTS.md

This file provides guidance to agentic coding agents working with this DSP calculator codebase.

## 项目概述

这是一个基于React的戴森球计划（Dyson Sphere Program）量化蓝图生成器，支持多种MOD并提供混带总线的黑盒蓝图生成功能。

## 常用命令

### 开发和构建
- `npm install` - 安装依赖
- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run preview` - 预览生产构建
- `npm run lint` - 运行ESLint代码检查

### 测试相关
项目当前没有配置测试框架。如需添加测试，建议使用Jest + React Testing Library。

## 代码风格指南

### 文件命名和结构
- React组件使用PascalCase命名，扩展名为`.jsx`
- JavaScript模块使用camelCase命名，扩展名为`.js`
- 数据文件使用小写字母和下划线，扩展名为`.json`
- 工具类和常量文件使用小写字母和下划线

### 导入规范
```javascript
// 1. React相关导入
import {useContext, useEffect, useState} from 'react';

// 2. 第三方库导入
import {Select} from 'antd';
import {useSetState} from 'ahooks';

// 3. 本地组件导入（按路径层级排序）
import {BatchSetting} from './batch_setting.jsx';
import {ContextProvider} from './contexts.jsx';
import {default_game_data} from './GameData.jsx';
```

### 代码格式化
- 使用Prettier格式化，printWidth设置为160字符
- 使用ESLint进行代码质量检查
- 缩进使用4个空格
- 字符串优先使用单引号

### React组件规范
```javascript
// 函数组件命名使用PascalCase
function GameVersion({needs_list, set_needs_list}) {
    // Hooks在组件顶部声明
    const mod_options = get_mod_options();
    const set_game_data = useContext(GameInfoSetterContext);
    const [mods, set_mods] = useState([]);
    
    // 事件处理函数使用async/await
    async function mods_change(modList) {
        if (JSON.stringify(needs_list) !== '{}'
            && !confirm(`检测到计算器内有产线，确认继续切换mod吗？切换后将清空产线！`)) {
            return;// 用户取消
        }
        // 业务逻辑
    }
    
    // 返回JSX
    return <div>...</div>;
}
```

### 变量和函数命名
- 变量和函数使用camelCase
- 常量使用UPPER_SNAKE_CASE
- React组件props使用snake_case
- Context名称使用PascalCase + Context后缀

```javascript
// 常量
const DEFAULT_SETTINGS = {
    mining_speed_oil: 3.0,
    mining_speed_hydrogen: 1.0,
};

// Context
export const GameInfoContext = createContext(null);
export const SettingsContext = createContext(null);

// 函数
function get_mod_options() {
    return game_data_info_list.map(item => item.name);
}
```

### 错误处理
- 使用try-catch包装异步操作
- 用户确认操作使用confirm()函数
- 数据验证使用类型检查和默认值

```javascript
async function load_game_data() {
    try {
        const data = await fetch('/api/game-data');
        return data.json();
    } catch (error) {
        console.error('加载游戏数据失败:', error);
        return default_game_data;
    }
}
```

### 注释规范
- 复杂业务逻辑添加中文注释
- 函数用途使用JSDoc格式
- 重要常量添加说明注释

```javascript
/**
 * 构建蓝图
 */
function newBulprint(title = "新蓝图", size = { x: 1, y: 1 }, dragBoxSize = size) {
    // 判断modList是否合理，并调整顺序
    // 巨构是深空的前置依赖
    let b1 = false;
    let b2 = false;
    // ...
}
```

### 状态管理
- 使用React Context进行全局状态管理
- Context命名遵循：[功能]Context / [功能]SetterContext
- 复杂状态使用useSetState from ahooks

```javascript
// Context定义
export const GameInfoContext = createContext(null);
export const GameInfoSetterContext = createContext(null);

// 状态更新
const set_game_data = useContext(GameInfoSetterContext);
const [state, setState] = useSetState(initialState);
```

### MOD开发注意事项
- 巨型建筑（MoreMegaStructure）是深空来客（TheyComeFromVoid）的前置依赖
- MOD切换时会清空当前产线数据
- MOD顺序按照game_data_info_list中定义的顺序排列
- 不同MOD组合有不同的默认采矿速率设置

### 数据结构规范
- recipe_data: 配方数据数组，包含原料、产物、设施、时间、增产信息
- proliferator_data: 增产剂效果数据
- factory_data: 建筑参数表（耗能、倍率、占地）
- 使用localStorage保存用户的生产策略、需求列表等数据

### 蓝图生成系统
- src/buleprint/目录包含蓝图生成的核心逻辑
- builder.js: 蓝图构建器
- parser.js: 蓝图解析器
- paramParser/: 参数解析器系统
- itemsData.js: 物品数据处理
- constant.js: 常量定义

### 性能优化
- 使用React.memo包装纯组件
- 大数据列表使用虚拟滚动
- 图片资源使用WebP格式和压缩优化
- 开发环境跳过精灵图生成

### 浏览器兼容性
- 支持IE11+等传统浏览器
- 使用@ungap/structured-clone兼容旧版浏览器
- Vite配置legacy插件提供polyfill