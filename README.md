# IBKR 历史数据获取工具

一个高效的 Interactive Brokers (IBKR) 历史数据批量获取工具，具备智能频控管理功能，避免触发 IBKR API 的限制。

## 🚀 特性

- **智能频控管理**: 自动遵守 IBKR API 限制，避免 pacing violation
- **批量处理**: 支持大量历史数据的批量获取
- **断点续传**: 程序中断后可继续处理剩余请求
- **进度跟踪**: 实时显示处理进度和统计信息
- **命令行界面**: 友好的 CLI 工具，支持多种配置选项
- **智能调度**: 按合约交替处理，优化请求效率

## 📋 系统要求

- **Node.js**: 16.0 或更高版本
- **Bun**: 1.0 或更高版本（推荐）
- **操作系统**: macOS, Linux, Windows
- **IBKR 连接**: TWS (Trader Workstation) 或 IB Gateway

## 🛠️ 安装指南

### 1. 安装 Bun

#### macOS / Linux

```bash
# 使用官方安装脚本
curl -fsSL https://bun.sh/install | bash

# 或使用 Homebrew (macOS)
brew install bun

# 或使用包管理器 (Linux)
# Ubuntu/Debian
curl -fsSL https://bun.sh/install | bash

# Arch Linux
yay -S bun-bin
```

#### Windows

```powershell
# 使用 PowerShell
powershell -c "irm bun.sh/install.ps1 | iex"

# 或使用 Scoop
scoop install bun

# 或使用 Chocolatey
choco install bun
```

#### 验证安装

```bash
bun --version
# 应该显示类似: 1.0.x
```

### 2. 克隆项目

```bash
git clone <repository-url>
cd ibkr_history_data_fetch
```

### 3. 安装依赖

```bash
bun install
```

## ⚙️ 环境配置

### 1. IBKR TWS/Gateway 配置

#### 启动 TWS 或 IB Gateway

1. 登录你的 IBKR 账户
2. 启动 TWS (Trader Workstation) 或 IB Gateway
3. 确保 API 连接已启用

#### 配置 API 设置

1. 在 TWS 中：`File > Global Configuration > API > Settings`
2. 或在 IB Gateway 中：`Configure > Settings > API`
3. 配置以下设置：
   - ✅ **Enable ActiveX and Socket Clients**
   - ✅ **Allow connections from localhost only** (推荐)
   - 📝 **Socket Port**: 默认 7497 (TWS) 或 4001 (Gateway)
   - ✅ **Master API client ID**: 设置为 0 或其他值
   - ✅ **Read-Only API**: 可选启用（更安全）

### 2. 环境变量配置

创建 `.env` 文件（可选）：

```bash
# 复制示例配置文件
cp .env.example .env
```

编辑 `.env` 文件：

```env
# IBKR 连接配置
IBKR_HOST=127.0.0.1
IBKR_PORT=7497
IBKR_CLIENT_ID=1
```

### 3. 创建数据目录

```bash
mkdir -p history_data
```

## 🎯 快速开始

### 1. 初始化合约数据

```bash
# 初始化 MES 期货合约
bun run src/index.ts init -s MES -e CME -c USD -t FUT

# 初始化其他合约示例
bun run src/index.ts init -s SPY -e SMART -c USD -t STK
```

### 2. 获取历史数据

```bash
# 使用默认设置
bun run src/index.ts history

# 自定义参数
bun run src/index.ts history -d "3600 S" -b "5" -w "TRADES" -p "10"
```

## 📖 详细使用说明

### 命令行接口

#### 查看帮助

```bash
# 查看所有命令
bun run src/index.ts --help

# 查看特定命令帮助
bun run src/index.ts init --help
bun run src/index.ts history --help
```

#### init 命令

初始化合约列表和时间分片数据。

```bash
bun run src/index.ts init [选项]
```

**选项:**

- `-s, --symbol <symbol>`: 合约符号 (必需)
- `-e, --exchange <exchange>`: 交易所 (必需)
- `-c, --currency <currency>`: 货币 (必需)
- `-t, --secType <secType>`: 证券类型 (必需)

**示例:**

```bash
# 期货合约
bun run src/index.ts init -s MES -e CME -c USD -t FUT
bun run src/index.ts init -s NQ -e CME -c USD -t FUT

# 股票
bun run src/index.ts init -s AAPL -e SMART -c USD -t STK
bun run src/index.ts init -s TSLA -e NASDAQ -c USD -t STK
```

#### history 命令

批量获取历史数据，具备智能频控管理。

```bash
bun run src/index.ts history [选项]
```

**选项:**

- `-d, --duration <duration>`: 数据持续时间 (默认: "3600 S")
- `-b, --barSize <barSize>`: K 线大小 (默认: "5")
- `-w, --whatToShow <whatToShow>`: 数据类型 (默认: "TRADES")
- `-p, --progressInterval <interval>`: 进度显示间隔 (默认: "10")

### 配置选项详解

#### 数据持续时间 (duration)

```bash
# 时间格式示例
"60 S"      # 60秒
"30 M"      # 30分钟
"2 H"       # 2小时
"1 D"       # 1天
"1 W"       # 1周
"1 M"       # 1个月
"1 Y"       # 1年
```

#### K 线大小 (barSize)

| 值    | 说明    | 适用场景       |
| ----- | ------- | -------------- |
| 1     | 1 秒    | 超高频交易分析 |
| 5     | 5 秒    | 高频交易分析   |
| 10    | 10 秒   | 短期技术分析   |
| 15    | 15 秒   | 短期技术分析   |
| 30    | 30 秒   | 短期技术分析   |
| 60    | 1 分钟  | 日内交易       |
| 300   | 5 分钟  | 日内交易       |
| 900   | 15 分钟 | 短期分析       |
| 1800  | 30 分钟 | 中期分析       |
| 3600  | 1 小时  | 中期分析       |
| 14400 | 4 小时  | 长期分析       |
| 86400 | 1 天    | 长期分析       |

#### 数据类型 (whatToShow)

| 值       | 说明     | 注意事项                   |
| -------- | -------- | -------------------------- |
| TRADES   | 成交数据 | 最常用，包含成交价和成交量 |
| MIDPOINT | 中间价   | (买价+卖价)/2              |
| BID      | 买价     | 需要 L1 数据权限           |
| ASK      | 卖价     | 需要 L1 数据权限           |
| BID_ASK  | 买卖价   | ⚠️ 计为双倍请求！          |

## 📊 输出文件格式

### CSV 数据文件

位置: `history_data/{合约符号}-{到期日}.csv`

格式:

```csv
datetime,open,high,low,close,volume
2023-09-15 08:30:00,4500.25,4501.00,4499.75,4500.50,1250
2023-09-15 08:30:05,4500.50,4500.75,4500.00,4500.25,980
```

### 进度文件

位置: `history_data/contract-list-splices.json`

自动维护的待处理请求列表，支持断点续传。

## 🔧 故障排除

### 常见问题

#### 1. 连接问题

```
Error: connect ECONNREFUSED 127.0.0.1:7497
```

**解决方案:**

- 确保 TWS/Gateway 正在运行
- 检查端口配置 (TWS: 7497, Gateway: 4001)
- 确认 API 设置已启用

#### 2. 权限问题

```
Error: No security definition has been found
```

**解决方案:**

- 检查合约符号是否正确
- 确认账户有相应的市场数据权限
- 验证交易所和货币设置

#### 3. 频控问题

```
Error: pacing violation
```

**解决方案:**

- 程序会自动处理，无需手动干预
- 如频繁出现，可增加基础延迟时间

#### 4. 数据权限问题

```
Error: HMDS query returned no data
```

**解决方案:**

- 检查请求的时间范围是否有效
- 确认账户有历史数据权限
- 验证合约在请求时间段内是否存在

### 性能优化

#### 1. 网络优化

- 使用稳定的网络连接
- 在交易时间外运行以减少延迟
- 考虑使用专用服务器

#### 2. 参数调优

```bash
# 对于大量数据，使用较大的K线间隔
bun run src/index.ts history -b "3600" -d "1 D"

# 减少进度显示频率
bun run src/index.ts history -p "50"
```

#### 3. 系统资源

- 确保足够的磁盘空间
- 监控内存使用情况
- 使用 SSD 存储以提高写入性能

## 📝 开发指南

### 项目结构

```
ibkr_history_data_fetch/
├── src/
│   ├── index.ts          # 主入口和CLI
│   ├── init.ts           # 初始化功能
│   └── history.ts        # 历史数据获取
├── history_data/         # 数据存储目录
├── package.json          # 项目配置
├── tsconfig.json         # TypeScript配置
└── README.md            # 本文档
```

### 自定义开发

#### 扩展数据处理

```typescript
// 在 history.ts 中自定义数据处理逻辑
async function processData(data: any[]) {
  // 添加你的数据处理逻辑
  return data;
}
```

#### 添加新的数据源

```typescript
// 扩展 HistoryFetchOptions 接口
export interface HistoryFetchOptions {
  // 现有选项...
  customProcessor?: (data: any[]) => Promise<any[]>;
}
```

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## ⚠️ 免责声明

本工具仅用于教育和研究目的。使用本工具进行交易决策的风险由用户自行承担。作者不对因使用本工具而产生的任何损失负责。

请确保遵守 Interactive Brokers 的服务条款和相关法律法规。

## 📞 支持

如果你遇到问题或有建议，请：

1. 查看 [故障排除](#-故障排除) 部分
2. 搜索现有的 [Issues](../../issues)
3. 创建新的 Issue 并提供详细信息

---

**Happy Trading! 📈**
