# IBKR 历史数据获取工具 - 命令行使用指南

## 概述

该工具现在支持通过命令行接口进行操作，提供了两个主要命令：
- `init`: 初始化合约列表和时间分片
- `history`: 批量获取历史数据（带智能频控管理）

## 安装和运行

```bash
# 安装依赖
bun install

# 查看帮助
bun run src/index.ts --help
```

## 命令详解

### 1. init 命令

初始化合约列表和时间分片数据。

```bash
bun run src/index.ts init [选项]
```

**选项:**
- `-s, --symbol <symbol>`: 合约符号
- `-e, --exchange <exchange>`: 交易所
- `-c, --currency <currency>`: 货币
- `-t, --secType <secType>`: 证券类型

**示例:**
```bash
# 初始化 MES 期货合约
bun run src/index.ts init -s MES -e CME -c USD -t FUT
```

### 2. history 命令

批量获取历史数据，具备智能频控管理功能。

```bash
bun run src/index.ts history [选项]
```

**选项:**
- `-d, --duration <duration>`: 数据持续时间（默认: "1 H"）
- `-b, --barSize <barSize>`: K线大小（默认: "5"）
- `-w, --whatToShow <whatToShow>`: 数据类型（默认: "TRADES"）
- `-p, --progressInterval <interval>`: 进度显示间隔（默认: "10"）

#### K线大小选项 (barSize)

| 值 | 说明 | 对应枚举 |
|---|---|---|
| 1 | 1秒 | SECONDS_ONE |
| 5 | 5秒 | SECONDS_FIVE |
| 10 | 10秒 | SECONDS_TEN |
| 15 | 15秒 | SECONDS_FIFTEEN |
| 30 | 30秒 | SECONDS_THIRTY |
| 60 | 1分钟 | MINUTES_ONE |
| 300 | 5分钟 | MINUTES_FIVE |
| 900 | 15分钟 | MINUTES_FIFTEEN |
| 1800 | 30分钟 | MINUTES_THIRTY |
| 3600 | 1小时 | HOURS_ONE |
| 14400 | 4小时 | HOURS_FOUR |
| 86400 | 1天 | DAYS_ONE |

#### 数据类型选项 (whatToShow)

| 值 | 说明 |
|---|---|
| TRADES | 成交数据（默认） |
| MIDPOINT | 中间价 |
| BID | 买价 |
| ASK | 卖价 |
| BID_ASK | 买卖价（计为双倍请求） |

## 使用示例

### 基础使用

```bash
# 使用默认设置获取历史数据
bun run src/index.ts history

# 获取1分钟K线的成交数据，持续30分钟
bun run src/index.ts history -d "30 M" -b "60" -w "TRADES"

# 获取5秒K线的买卖价数据，每5个请求显示一次进度
bun run src/index.ts history -d "1 H" -b "5" -w "BID_ASK" -p "5"
```

### 高级配置

```bash
# 获取日线数据
bun run src/index.ts history -d "1 Y" -b "86400" -w "TRADES" -p "1"

# 获取高频数据（1秒K线）
bun run src/index.ts history -d "2 H" -b "1" -w "TRADES" -p "20"

# 获取中间价数据
bun run src/index.ts history -d "4 H" -b "300" -w "MIDPOINT" -p "10"
```

## 智能频控功能

history 命令内置了智能频控管理，自动遵守 IBKR 的限制：

### 自动处理的限制
- ✅ 15秒内不重复相同请求
- ✅ 2秒内同一合约不超过5次请求（留1次缓冲）
- ✅ 10分钟内全局请求不超过50次（留10次缓冲）
- ✅ 每次请求间隔至少3秒

### 智能特性
- 🔄 **自动重试**: 触发频控时使用指数退避策略
- 📊 **进度跟踪**: 实时显示处理进度和统计信息
- 🔀 **智能调度**: 按合约交替处理，避免单一合约频控
- 💾 **断点续传**: 程序中断后可继续处理剩余请求

### 输出示例

```
🚀 开始批量获取历史数据...
配置: 持续时间=1 H, K线大小=5秒, 数据类型=TRADES
开始处理 11040 个历史数据请求...
预计完成时间: 552 分钟
发现 7 个不同的合约
处理队列已创建，共 11040 个请求
MESZ3-20230915 09:30:00 US/Central 720 条记录写入成功
进度: 0.1% (10/11040) - 成功: 10, 跳过: 0, 错误: 0
...
=== 处理完成 ===
总计: 11040 个请求
成功: 11040 个
跳过: 0 个
错误: 0 个
剩余未处理: 0 个
🎉 所有历史数据请求已完成！
```

## 注意事项

1. **运行前准备**: 确保已运行 `init` 命令生成合约列表
2. **网络连接**: 确保 IBKR TWS/Gateway 正常连接
3. **数据权限**: 确保账户有相应的市场数据权限
4. **存储空间**: 大量历史数据需要足够的磁盘空间
5. **运行时间**: 大批量数据获取可能需要数小时

## 故障排除

### 常见错误

1. **"No security definition"**: 合约定义不存在，检查合约信息
2. **"HMDS query returned no data"**: 查询时间段无数据
3. **"pacing violation"**: 频控限制（程序会自动处理）

### 性能优化建议

- 对于大量数据，建议使用较大的 K线间隔（如300秒或更大）
- 调整进度显示间隔以减少输出频率
- 在网络条件良好时运行以减少重试

## 文件输出

- **数据文件**: `history_data/{合约符号}-{到期日}.csv`
- **进度文件**: `history_data/contract-list-splices.json`（自动更新）

数据文件格式：
```csv
datetime,open,high,low,close,volume
2023-09-15 08:30:00,4500.25,4501.00,4499.75,4500.50,1250
```
