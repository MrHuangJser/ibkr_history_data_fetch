# IBKR历史数据获取工具 v2.0

一个专业的Interactive Brokers历史数据获取CLI工具，支持MES期货合约1分钟级数据获取，具备断点续传功能。

## ✨ 主要特性

- 🔍 **智能合约搜索**: 自动发现过去2年内的所有MES期货合约
- ⏱️ **1分钟级数据**: 获取高精度的分钟级OHLCV数据
- 🚦 **智能流控制**: 自动遵守IBKR API限制（每分钟最多60次请求）
- 💾 **增量保存**: 每获取一周数据立即保存，避免数据丢失
- 🔄 **断点续传**: 程序中断后可从上次停止的地方继续
- 📊 **实时进度**: 详细的进度跟踪和统计信息
- 🛠️ **专业CLI**: 基于Commander.js的现代命令行界面

## 🚀 快速开始

### 安装依赖

```bash
bun install
```

### 启动TWS/IB Gateway

1. 启动Interactive Brokers的TWS或IB Gateway
2. 启用API功能：`Configure` → `API` → `Settings`
3. 勾选 `Enable ActiveX and Socket Clients`
4. 设置端口（TWS: 7496/7497, IB Gateway: 4001/4002）

### 基本使用

```bash
# 查看帮助
bun start

# 开始获取MES历史数据
bun start mes

# 查看当前进度
bun start status

# 查看配置信息
bun start config
```

## 📋 CLI命令

### `mes` - 获取MES历史数据

```bash
bun start mes [选项]
```

**主要选项:**
- `-h, --host <host>`: TWS/IB Gateway主机地址 (默认: 127.0.0.1)
- `-p, --port <port>`: 端口号 (默认: 7496)
- `-c, --client-id <id>`: 客户端ID (默认: 1)
- `-r, --requests-per-minute <num>`: 每分钟最大请求数 (默认: 50)
- `-d, --duration-days <days>`: 每次请求天数 (默认: 7)
- `-y, --history-years <years>`: 历史数据年数 (默认: 2)
- `--include-after-hours`: 包含盘后交易数据
- `--exclude-after-hours`: 排除盘后交易数据
- `-o, --output-prefix <prefix>`: 输出文件前缀
- `--no-timestamp`: 文件名不包含时间戳
- `--reset`: 重置所有进度重新开始
- `--dry-run`: 预览模式，不实际获取数据

**使用示例:**

```bash
# 使用默认配置
bun start mes

# 使用TWS纸盘交易端口
bun start mes --port 7497

# 降低请求频率，更保守
bun start mes --requests-per-minute 30

# 只获取1年数据，包含盘后
bun start mes --history-years 1 --include-after-hours

# 预览配置，不实际运行
bun start mes --dry-run

# 重置所有进度重新开始
bun start mes --reset
```

### `status` - 查看进度

```bash
bun start status
```

显示当前获取进度和统计信息：
- 总合约数和完成状态
- 已获取的数据记录数
- 待处理的合约列表

### `config` - 查看配置

```bash
bun start config
```

显示所有默认配置参数，包括连接、数据获取和输出设置。

### `reset` - 重置进度

```bash
bun start reset --force
```

清除所有获取进度和元数据文件，重新开始。

### `help` - 详细帮助

```bash
bun start help
```

显示详细的使用说明和示例。

## 📁 输出文件

### 数据文件
```
MES_1min_historical_MESZ4_20241219.csv    # 单个合约数据
MES_1min_historical_MESH5_20241219.csv    # 单个合约数据
...
```

### 元数据文件
```
fetch_metadata.json    # 进度和配置信息
```

### CSV数据格式

| 字段 | 说明 | 示例 |
|------|------|------|
| symbol | 合约代码 | MESZ4 |
| date | 时间戳 (UTC+8) | 2024-01-02 09:30:00 |
| open | 开盘价 | 4750.25 |
| high | 最高价 | 4751.00 |
| low | 最低价 | 4749.75 |
| close | 收盘价 | 4750.50 |
| volume | 成交量 | 125 |
| count | 成交笔数 | 15 |
| wap | 加权平均价 | 4750.38 |

**日期格式说明**: 所有时间戳都格式化为UTC+8时区的 `YYYY-MM-DD HH:mm:ss` 格式，便于数据分析和处理。

## 🔄 断点续传

### 自动恢复
程序启动时会自动检测之前的进度：

```
🔄 检测到现有进度:
   - 总合约数: 8
   - 已完成: 3
   - 待处理: 5
   - 已获取记录: 125,430
```

### 进度管理
- **元数据文件**: `fetch_metadata.json` 记录所有进度
- **增量保存**: 每获取7天数据后立即保存到CSV
- **智能恢复**: 从上次中断的确切时间点继续

### 重置功能
如需重新开始：
```bash
bun start mes --reset
# 或
bun start reset --force
```

## ⚙️ 配置选项

### 连接配置
- **主机**: TWS/IB Gateway的IP地址
- **端口**: 
  - TWS Live: 7496
  - TWS Paper: 7497
  - IB Gateway Live: 4001
  - IB Gateway Paper: 4002
- **客户端ID**: 每个连接的唯一标识

### 数据获取配置
- **请求频率**: 建议30-50次/分钟，避免触发限制
- **每次天数**: 1分钟级数据建议7天/次
- **历史年数**: 根据需要调整，注意数据量
- **盘后数据**: 是否包含盘前盘后交易

### 输出配置
- **文件前缀**: 自定义输出文件名
- **时间戳**: 是否在文件名中包含时间戳
- **分隔符**: CSV文件的字段分隔符

## 🛠️ 开发和构建

### 开发模式
```bash
bun run dev mes --dry-run
```

### 构建
```bash
bun run build
```

### 清理
```bash
bun run clean    # 清理构建文件和数据文件
```

## 📊 性能特点

- **内存效率**: 流式处理，支持大量数据
- **网络优化**: 智能请求调度，最大化API利用率
- **错误恢复**: 单点故障隔离，自动重试机制
- **数据安全**: 增量保存，避免数据丢失

## 🔧 故障排除

### 常见问题

1. **连接失败**
   ```
   ❌ 执行失败: Connection refused
   ```
   - 检查TWS/IB Gateway是否运行
   - 确认API设置已启用
   - 验证端口号是否正确

2. **API限制**
   ```
   ❌ 请求失败: Rate limit exceeded
   ```
   - 降低请求频率: `--requests-per-minute 30`
   - 检查是否有其他程序在使用API

3. **权限问题**
   ```
   ❌ 请求失败: No permission
   ```
   - 确认账户有历史数据权限
   - 检查市场数据订阅状态

### 调试技巧

1. **使用预览模式**: `--dry-run` 检查配置
2. **查看详细日志**: 程序会输出详细的执行信息
3. **检查进度**: `bun start status` 查看当前状态
4. **重置重试**: 如遇问题可重置后重新开始

## 📚 更多信息

- [详细使用指南](USAGE.md)
- [更新日志](CHANGELOG.md)
- [技术文档](README_MES.md)

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request来改进这个工具！