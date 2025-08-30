#!/usr/bin/env bun

/**
 * MES历史数据获取示例
 * 使用方法: bun run src/example.ts
 */

import { fetchMESHistoricalData } from "./history/index.js";
import type { MESFetcherConfig } from "./config.js";

async function main() {
  try {
    console.log("🚀 启动MES历史数据获取程序...");
    console.log("⚠️  请确保TWS或IB Gateway已经运行并且API已启用");
    console.log("📋 程序将自动:");
    console.log("   - 搜索过去指定年数内的所有MES合约");
    console.log("   - 获取每个合约的1分钟级历史数据");
    console.log("   - 遵守IBKR API限制（可配置请求频率）");
    console.log("   - 将数据保存到CSV文件");
    console.log("");

    // 自定义配置示例
    const customConfig: Partial<MESFetcherConfig> = {
      connection: {
        host: "127.0.0.1",
        port: 7497, // TWS paper trading
        clientId: 1,
      },
      dataFetch: {
        maxRequestsPerMinute: 50, // 稍微保守一些
        maxDurationDays: 7,
        historyYears: 2,
        includeAfterHours: false, // 只获取常规交易时间数据
      },
      output: {
        filenamePrefix: "MES_1min_data",
        includeTimestamp: true,
        csvSeparator: ",",
      },
    };

    await fetchMESHistoricalData(customConfig);
    
    console.log("🎉 程序执行完成！");
  } catch (error) {
    console.error("❌ 程序执行失败:", error);
    process.exit(1);
  }
}

// 运行主程序
main();
