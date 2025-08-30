# 项目结构说明

## 📁 目录结构

```
ibkr_history_data_fetch/
├── src/                           # 源代码目录
│   ├── index.ts                   # CLI入口文件 (Commander.js)
│   ├── example.ts                 # 使用示例文件
│   └── history/                   # 历史数据获取模块
│       ├── index.ts               # 主要数据获取逻辑
│       ├── config.ts              # 配置管理
│       └── metadata.ts            # 元数据和进度管理
├── dist/                          # 构建输出目录
│   └── index.js                   # 构建后的CLI工具
├── node_modules/                  # 依赖包
├── package.json                   # 项目配置和依赖
├── tsconfig.json                  # TypeScript配置
├── bun.lock                       # Bun锁定文件
├── README.md                      # 项目主文档
├── USAGE.md                       # 详细使用指南
├── CHANGELOG.md                   # 更新日志
├── README_MES.md                  # 技术文档
└── PROJECT_STRUCTURE.md           # 本文件
```

## 🔧 核心模块

### 1. CLI入口 (`src/index.ts`)
- **功能**: 基于Commander.js的命令行界面
- **命令**: `mes`, `status`, `config`, `reset`, `help`
- **特性**: 参数解析、配置构建、错误处理

### 2. 历史数据获取 (`src/history/index.ts`)
- **核心类**: `MESHistoricalDataFetcher`
- **功能**: 
  - MES合约搜索和筛选
  - 历史数据请求和流控制
  - 增量保存和断点续传
  - 进度跟踪和统计

### 3. 配置管理 (`src/history/config.ts`)
- **接口**: `MESFetcherConfig`
- **默认配置**: `DEFAULT_CONFIG`
- **功能**: 配置合并和验证

### 4. 元数据管理 (`src/history/metadata.ts`)
- **核心类**: `MetadataManager`
- **功能**:
  - 进度持久化 (`fetch_metadata.json`)
  - 合约状态跟踪
  - 断点续传支持

## 🚀 使用流程

### 1. CLI命令解析
```
用户输入 → Commander.js → 参数解析 → 配置构建
```

### 2. 数据获取流程
```
合约搜索 → 进度检查 → 请求生成 → RxJS流控制 → 数据保存 → 进度更新
```

### 3. 断点续传机制
```
启动 → 加载元数据 → 检查进度 → 生成待处理请求 → 继续获取
```

## 📦 依赖关系

### 生产依赖
- `@stoqey/ib`: IBKR API客户端
- `@stoqey/ibkr`: IBKR高级封装
- `commander`: CLI框架
- `dayjs`: 日期处理
- `rxjs`: 响应式编程和流控制

### 开发依赖
- `@types/bun`: Bun类型定义
- `@types/node`: Node.js类型定义
- `typescript`: TypeScript编译器

## 🔄 数据流

### 1. 配置流
```
默认配置 → 用户参数 → 合并配置 → 验证配置
```

### 2. 数据流
```
IBKR API → 原始数据 → 格式化 → CSV保存 → 进度更新
```

### 3. 元数据流
```
启动检查 → 进度加载 → 实时更新 → 持久化保存
```

## 🛠️ 开发指南

### 添加新命令
1. 在 `src/index.ts` 中添加新的 `program.command()`
2. 实现命令处理逻辑
3. 更新帮助文档

### 扩展配置
1. 在 `src/history/config.ts` 中扩展 `MESFetcherConfig` 接口
2. 更新 `DEFAULT_CONFIG`
3. 在CLI中添加对应参数

### 添加新的数据源
1. 在 `src/history/` 下创建新模块
2. 实现类似 `MESHistoricalDataFetcher` 的类
3. 在CLI中添加新命令

## 📊 性能考虑

### 内存优化
- 使用RxJS流式处理，避免大量数据在内存中堆积
- 增量保存，及时释放内存

### 网络优化
- 智能流控制，遵守API限制
- 错误重试机制，提高成功率

### 磁盘优化
- 分文件保存，避免单文件过大
- 追加写入，减少磁盘IO

## 🔍 调试和监控

### 日志系统
- 详细的控制台输出
- 进度实时显示
- 错误信息和建议

### 状态监控
- `bun start status` 查看进度
- 元数据文件记录详细状态
- 统计信息实时更新

### 错误处理
- 分层错误处理
- 友好的错误提示
- 故障排除建议

## 🚀 部署和分发

### 构建
```bash
bun run build    # 构建CLI工具
```

### 清理
```bash
bun run clean    # 清理所有生成文件
```

### 脚本快捷方式
```bash
bun run mes      # 直接运行MES获取
bun run status   # 查看状态
bun run config   # 查看配置
```

## 🔮 扩展性

### 支持新合约类型
- 复制 `history` 模块结构
- 实现特定合约的获取逻辑
- 添加新的CLI命令

### 支持新数据格式
- 扩展输出配置
- 实现新的保存格式
- 保持向后兼容

### 支持新功能
- 模块化设计便于扩展
- 清晰的接口定义
- 完善的类型系统
