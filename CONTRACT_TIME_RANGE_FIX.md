# 合约时间范围修复说明

## 🎯 问题描述

之前的逻辑存在以下问题：
1. **固定时间范围假设**: 假设所有期货合约都有固定的3个月生命周期
2. **错误的开始时间计算**: 所有合约的 `targetStartDateTime` 都设置为同一个历史时间点
3. **无限回溯问题**: 在生成请求时没有考虑合约的实际交易时间范围，导致超出合约有效期继续获取数据

## ✅ 解决方案

### 1. 动态合约时间范围计算

通过分析 `getPastContracts` 返回的合约列表，动态计算每个合约的实际开始时间：

```typescript
private calculateContractStartDates(contracts: Array<{
  conId: number;
  expiryStr: string;
  expiry: Date;
  contract: Contract;
}>): ContractInfo[] {
  // 按到期时间排序（从早到晚）
  const sortedContracts = contracts.sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
  
  for (let i = 0; i < sortedContracts.length; i++) {
    const currentContract = sortedContracts[i];
    let startDate: Date;
    
    if (i === 0) {
      // 第一个合约：假设在到期前3个月开始交易
      startDate = new Date(currentContract.expiry);
      startDate.setMonth(startDate.getMonth() - 3);
    } else {
      // 后续合约：从前一个合约到期时开始交易
      const previousContract = sortedContracts[i - 1];
      startDate = new Date(previousContract.expiry);
    }
    
    // 添加 startDate 到合约信息中
  }
}
```

### 2. 合约接口扩展

为 `ContractInfo` 接口添加 `startDate` 字段：

```typescript
interface ContractInfo {
  conId: number;
  expiryStr: string;
  expiry: Date;
  startDate: Date;  // 新增：合约开始时间
  contract: Contract;
}
```

### 3. 正确的时间范围初始化

在 `initializeContracts` 中使用合约的实际时间范围：

```typescript
// 计算合约的有效时间范围
const contractStart = contractInfo.startDate;
const contractEnd = contractInfo.expiry;

// 确保不超过用户设置的历史年数限制
const yearsAgo = new Date(
  now.getFullYear() - this.config.dataFetch.historyYears,
  now.getMonth(),
  now.getDate()
);

// 使用合约开始时间和用户设置的历史限制中较晚的那个
const effectiveStartDate = contractStart > yearsAgo ? contractStart : yearsAgo;
```

### 4. 请求生成边界检查

在 `generatePendingRequests` 中添加合约时间范围检查：

```typescript
let currentEnd = dayjs(currentEndDateTime);
const targetStart = dayjs(targetStartDate);
const contractStart = dayjs(contractInfo.startDate);

// 使用合约开始时间和目标开始时间中较晚的那个
const effectiveStart = contractStart.isAfter(targetStart) ? contractStart : targetStart;

// 生成请求序列时检查合约边界
while (
  currentEnd.isAfter(effectiveStart) &&
  requestCount < MAX_REQUESTS_PER_CONTRACT
) {
  // 生成请求...
}
```

## 🔄 逻辑流程

### 合约时间范围计算逻辑

1. **获取所有合约**: 通过 `getPastContracts()` 获取符合条件的MES合约
2. **按时间排序**: 将合约按到期时间从早到晚排序
3. **计算开始时间**:
   - 第一个合约：到期前3个月开始交易
   - 后续合约：从前一个合约到期时开始交易
4. **生成完整信息**: 返回包含 `startDate` 的 `ContractInfo[]`

### 数据获取边界控制

```
合约A: [2023-06-15] ────────────── [2023-09-15]
合约B:                           [2023-09-15] ────────────── [2023-12-15]
合约C:                                                      [2023-12-15] ──── [2024-03-15]

用户设置: 获取2年历史数据 (从2022-08-30开始)

实际获取范围:
- 合约A: [2023-06-15] 到 [2023-09-15] (合约开始时间 > 用户历史限制)
- 合约B: [2023-09-15] 到 [2023-12-15] 
- 合约C: [2023-12-15] 到 [2024-03-15]
```

## 📊 改进效果

### 1. 精确的时间范围控制
- ✅ 每个合约只在其有效交易期间获取数据
- ✅ 避免获取合约生效前的无效数据
- ✅ 防止超出合约到期时间继续获取

### 2. 更好的进度跟踪
- ✅ 每个合约显示实际的时间范围
- ✅ 准确的请求数量估算
- ✅ 合理的完成进度显示

### 3. 避免无限循环
- ✅ 明确的合约边界检查
- ✅ 安全的请求数量限制
- ✅ 正确的时间点推进逻辑

## 🧪 测试验证

### 测试脚本
创建了 `test_contract_ranges.js` 来验证合约时间范围计算：

```bash
bun test_contract_ranges.js
```

### 验证内容
1. **合约列表获取**: 确认能正确获取MES合约
2. **时间范围计算**: 验证每个合约的开始和结束时间
3. **重叠检查**: 确认相邻合约之间的时间关系
4. **边界验证**: 检查是否存在时间间隙或异常重叠

## 📝 使用示例

### 查看合约时间范围
```bash
# 运行测试脚本查看所有合约的时间范围
bun test_contract_ranges.js

# 或者运行实际的数据获取（会显示详细的时间范围信息）
bun run mes --dry-run
```

### 预期输出
```
📅 合约 MESU3: 2023-06-15 → 2023-09-15
📅 合约 MESZ3: 2023-09-15 → 2023-12-15
📅 合约 MESH4: 2023-12-15 → 2024-03-15
...
```

## 🔧 配置说明

### 历史年数限制
```typescript
// 在配置中设置历史数据获取年数
const config = {
  dataFetch: {
    historyYears: 2,  // 最多获取2年历史数据
    // ...
  }
};
```

### 合约时间范围优先级
1. **合约实际开始时间** (基于合约序列计算)
2. **用户历史年数限制** (配置中的 `historyYears`)
3. **最终生效时间** = `max(合约开始时间, 历史年数限制)`

## 🚀 后续优化

### 可能的改进方向
1. **更精确的合约开始时间**: 通过历史交易数据验证合约实际开始交易的时间
2. **动态时间范围调整**: 根据实际数据可用性动态调整时间范围
3. **合约重叠期处理**: 优化相邻合约重叠期间的数据获取策略
4. **时区处理**: 考虑不同时区对合约时间的影响

### 配置扩展
```typescript
// 未来可能的配置选项
export interface MESFetcherConfig {
  dataFetch: {
    contractOverlapHandling?: 'skip' | 'merge' | 'separate';
    contractStartBuffer?: number;  // 合约开始前的缓冲天数
    // ...
  };
}
```

## 📋 注意事项

1. **第一个合约**: 由于没有前置合约，使用到期前3个月作为开始时间
2. **时间精度**: 目前使用天级别的精度，未来可考虑小时级别
3. **节假日处理**: 当前未考虑交易所节假日对合约时间的影响
4. **数据验证**: 建议在实际使用前通过测试脚本验证时间范围的合理性

## ✨ 总结

通过这次修复，解决了合约时间范围计算的核心问题：

- 🎯 **精确边界**: 每个合约只在其有效期内获取数据
- 🔄 **动态计算**: 基于实际合约序列计算时间范围
- 🛡️ **安全控制**: 防止无限循环和超出边界的数据获取
- 📊 **清晰进度**: 提供准确的进度跟踪和时间范围显示

这确保了数据获取的准确性和效率，避免了之前出现的超出合约范围继续获取数据的问题。
