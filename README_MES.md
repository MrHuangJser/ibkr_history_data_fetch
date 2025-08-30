# MES历史数据获取工具

这个工具使用 `@stoqey/ibkr` 库从Interactive Brokers获取MES（微型E-mini S&P 500期货）的1分钟级历史数据。

## 功能特点

- 🔍 自动搜索过去2年内的所有MES合约
- ⏱️ 获取1分钟级别的历史数据
- 🚦 智能流控制：遵守IBKR API限制（每分钟最多60次请求）
- 📊 使用RxJS实现异步数据流处理
- 💾 自动保存数据为CSV格式
- 🔄 支持断点续传和错误重试

## 技术实现

### API限制处理
- **请求频率限制**: 每分钟最多60次请求，程序自动控制为每秒1次请求
- **数据量限制**: 1分钟级数据每次最多获取1周数据，程序自动分批请求
- **错误处理**: 单个请求失败不会中断整个流程

### 流控制策略
使用RxJS的`concatMap`和`timer`操作符实现：
```typescript
concatMap((item, index) => {
  return timer(index * REQUEST_INTERVAL_MS).pipe(
    mergeMap(() => executeHistoricalDataRequest(item.request))
  );
})
```

## 使用方法

### 1. 环境准备

确保已安装依赖：
```bash
bun install
```

### 2. 启动TWS或IB Gateway

- 启动Interactive Brokers的TWS或IB Gateway
- 确保API功能已启用
- 默认端口：TWS (7497), IB Gateway (4002)

### 3. 运行程序

```bash
# 运行示例程序
bun run src/example.ts

# 或者直接导入使用
import { fetchMESHistoricalData } from "./src/history/index.js";
await fetchMESHistoricalData();
```

## 输出文件

程序会生成CSV文件，格式如下：
```csv
symbol,date,open,high,low,close,volume,count,wap
MESZ4,2024-01-02 09:30:00,4750.25,4751.00,4749.75,4750.50,125,15,4750.38
```

字段说明：
- `symbol`: 合约代码
- `date`: 时间戳
- `open`: 开盘价
- `high`: 最高价
- `low`: 最低价
- `close`: 收盘价
- `volume`: 成交量
- `count`: 成交笔数
- `wap`: 加权平均价

## 程序架构

### 核心类：`MESHistoricalDataFetcher`

主要方法：
- `getPastContracts()`: 获取过去2年的MES合约列表
- `fetchAllMESHistoricalData()`: 使用RxJS流控制获取所有数据
- `startFetching()`: 启动数据获取流程
- `saveDataToFile()`: 保存数据到CSV文件

### 流程图

```
搜索MES合约 → 生成请求序列 → RxJS流控制 → 批量请求数据 → 合并保存CSV
     ↓              ↓              ↓              ↓              ↓
  过去2年合约    按7天分批      每秒1次请求     错误重试机制    时间排序输出
```

## 注意事项

1. **数据量**: 2年的1分钟数据量很大，请确保有足够的磁盘空间
2. **网络稳定性**: 建议在网络稳定的环境下运行
3. **TWS连接**: 确保TWS/IB Gateway保持连接状态
4. **API权限**: 确保账户有历史数据访问权限

## 错误处理

程序包含完善的错误处理机制：
- 单个请求失败会记录错误但不中断整个流程
- 网络超时会自动重试
- 连接断开会给出明确的错误提示

## 性能优化

- 使用RxJS的流式处理，内存占用低
- 分批请求避免单次请求数据量过大
- 智能流控制避免触发API限制
- 异步处理提高整体效率

## 扩展功能

可以轻松扩展支持其他合约类型，只需修改合约搜索条件：
```typescript
const contractBase: Partial<Contract> = {
  symbol: "ES",  // 改为其他合约
  secType: SecType.FUT,
  exchange: "CME",
  currency: "USD",
  includeExpired: true,
};
```
