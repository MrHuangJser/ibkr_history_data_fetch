# MES历史数据获取工具 - 使用指南 (v2.0 断点续传版)

## 🆕 v2.0 新特性

### 断点续传系统
- **增量保存**: 每获取一周数据立即保存到CSV，避免数据丢失
- **智能恢复**: 程序中断后重新启动可从上次停止的地方继续
- **进度跟踪**: 自动记录每个合约的获取进度
- **分文件保存**: 每个合约单独保存，便于管理

### 改进的数据管理
- **实时写入**: 数据获取后立即写入磁盘，减少内存占用
- **元数据管理**: 所有进度信息保存在 `fetch_metadata.json`
- **重复避免**: 智能检测已获取的时间段

## 快速开始

### 1. 环境准备

确保已安装Bun和依赖：
```bash
bun install
```

### 2. 启动TWS/IB Gateway

- 启动Interactive Brokers的TWS或IB Gateway
- 在TWS中启用API功能：
  - 打开 `Configure` → `API` → `Settings`
  - 勾选 `Enable ActiveX and Socket Clients`
  - 设置端口（默认：TWS 7497，IB Gateway 4002）
  - 添加可信IP地址（本地使用127.0.0.1）

### 3. 运行程序

```bash
# 使用默认配置（支持断点续传）
bun start

# 重置所有进度重新开始
bun start -- --reset

# 或者使用完整命令
bun run src/example.ts
bun run src/example.ts --reset
```

## 配置选项

程序支持灵活的配置，可以在代码中自定义：

```typescript
import { fetchMESHistoricalData } from "./src/history/index.js";

const config = {
  connection: {
    host: "127.0.0.1",
    port: 7497,        // TWS paper: 7497, TWS live: 7496
    clientId: 1,       // 客户端ID，每个连接需要唯一
  },
  dataFetch: {
    maxRequestsPerMinute: 50,  // 每分钟最大请求数（建议50-60）
    maxDurationDays: 7,        // 每次请求的最大天数
    historyYears: 2,           // 历史数据回溯年数
    includeAfterHours: false,  // 是否包含盘后交易数据
  },
  output: {
    filenamePrefix: "MES_data",     // 输出文件名前缀
    includeTimestamp: true,         // 是否在文件名中包含时间戳
    csvSeparator: ",",              // CSV分隔符
  },
};

await fetchMESHistoricalData(config);
```

## 断点续传功能

### 自动恢复
程序会自动检测之前的进度：
```
🔄 检测到现有进度:
   - 总合约数: 8
   - 已完成: 3
   - 待处理: 5
   - 已获取记录: 125,430
```

### 进度管理
- **元数据文件**: `fetch_metadata.json` 记录所有进度信息
- **增量保存**: 每次获取7天数据后立即保存
- **智能恢复**: 从上次中断的确切位置继续

### 重置功能
如需重新开始：
```bash
bun start -- --reset
```

## 输出文件格式

### 文件组织
```
MES_1min_historical_MESZ4_20241219.csv    # 单个合约数据
MES_1min_historical_MESH5_20241219.csv    # 单个合约数据
fetch_metadata.json                        # 进度元数据
```

### CSV数据格式
每个CSV文件包含以下字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| symbol | 合约代码 | MESZ4 |
| date | 时间戳 | 2024-01-02 09:30:00 |
| open | 开盘价 | 4750.25 |
| high | 最高价 | 4751.00 |
| low | 最低价 | 4749.75 |
| close | 收盘价 | 4750.50 |
| volume | 成交量 | 125 |
| count | 成交笔数 | 15 |
| wap | 加权平均价 | 4750.38 |

## 性能特点

### 流控制
- **智能限流**: 自动遵守IBKR API限制（每分钟最多60次请求）
- **分批请求**: 1分钟级数据每次最多获取7天，自动分批处理
- **错误恢复**: 单个请求失败不会中断整个流程

### 内存优化
- **流式处理**: 使用RxJS流式处理，避免内存溢出
- **增量保存**: 数据获取完成后统一保存，减少磁盘IO

### 时间管理
- **智能时间范围**: 自动处理已到期合约的时间边界
- **时区处理**: 正确处理市场时区和数据时间戳

## 故障排除

### 常见错误

1. **连接失败**
   ```
   ❌ 未找到任何 MES 合约
   ```
   - 检查TWS/IB Gateway是否运行
   - 确认API设置已启用
   - 验证端口号是否正确

2. **请求超时**
   ```
   ❌ 请求失败: timeout
   ```
   - 检查网络连接
   - 降低请求频率（减少maxRequestsPerMinute）
   - 确认账户有历史数据权限

3. **数据为空**
   ```
   ⚠️ 没有数据需要保存
   ```
   - 检查合约是否在指定时间范围内有交易
   - 确认市场数据订阅状态
   - 尝试调整时间范围

### 调试技巧

1. **启用详细日志**: 程序会输出详细的进度信息
2. **检查配置**: 程序启动时会显示当前配置
3. **监控请求**: 观察请求频率和响应时间

## 扩展使用

### 获取其他合约
修改合约搜索条件即可支持其他期货合约：

```typescript
// 在 getPastContracts() 方法中修改
const contractBase: Partial<Contract> = {
  symbol: "ES",     // 改为ES（标准E-mini S&P 500）
  secType: SecType.FUT,
  exchange: "CME",
  currency: "USD",
  includeExpired: true,
};
```

### 不同时间粒度
修改BarSizeSetting可以获取不同时间粒度的数据：

```typescript
// 在 executeHistoricalDataRequest() 方法中修改
BarSizeSetting.MINUTES_FIVE,  // 5分钟级数据
BarSizeSetting.HOURS_ONE,     // 1小时级数据
BarSizeSetting.DAYS_ONE,      // 日级数据
```

### 自定义数据处理
可以在`saveDataToFile`方法中添加自定义的数据处理逻辑：

```typescript
// 添加技术指标计算
// 数据清洗和验证
// 不同格式的输出（JSON、Parquet等）
```

## 注意事项

1. **数据量**: 2年的1分钟数据量很大，确保有足够磁盘空间
2. **市场时间**: 注意期货市场的交易时间和节假日
3. **权限**: 确保账户有相应的市场数据权限
4. **网络**: 建议在稳定的网络环境下运行
5. **资源**: 长时间运行时注意系统资源使用情况

## 技术支持

如遇到问题，请检查：
1. TWS/IB Gateway连接状态
2. API设置和权限
3. 网络连接稳定性
4. 系统资源使用情况
5. 程序日志输出
