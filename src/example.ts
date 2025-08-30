#!/usr/bin/env bun

/**
 * MES历史数据获取示例
 * 使用方法: bun run src/example.ts
 */

import { fetchMESHistoricalData, MESHistoricalDataFetcher } from "./history/index.js";
import type { MESFetcherConfig } from "./config.js";

async function main() {
  try {
    console.log("🚀 启动MES历史数据获取程序（支持断点续传）...");
    console.log("⚠️  请确保TWS或IB Gateway已经运行并且API已启用");
    console.log("📋 程序特性:");
    console.log("   - 🔍 自动搜索过去指定年数内的所有MES合约");
    console.log("   - ⏱️ 获取每个合约的1分钟级历史数据");
    console.log("   - 🚦 智能流控制（遵守IBKR API限制）");
    console.log("   - 💾 增量保存（每获取一周数据立即保存到CSV）");
    console.log("   - 🔄 断点续传（程序中断后可继续获取）");
    console.log("   - 📊 实时进度跟踪和元数据管理");
    console.log("");

    // 检查命令行参数
    const args = process.argv.slice(2);
    const shouldReset = args.includes('--reset');

    // 自定义配置示例
    const customConfig: Partial<MESFetcherConfig> = {
      connection: {
        host: "127.0.0.1",
        port: 7496, // TWS live trading (7497 for paper)
        clientId: 1,
      },
      dataFetch: {
        maxRequestsPerMinute: 50, // 稍微保守一些，避免触发限制
        maxDurationDays: 7,       // 每次获取7天数据
        historyYears: 2,          // 获取过去2年数据
        includeAfterHours: true,  // 包含盘后交易数据
      },
      output: {
        filenamePrefix: "MES_1min_historical",
        includeTimestamp: false,  // 不在文件名中包含时间戳
        csvSeparator: ",",
      },
    };

    if (shouldReset) {
      console.log("🔄 重置模式：清除所有进度重新开始...");
      const fetcher = new MESHistoricalDataFetcher(customConfig);
      await fetcher.reset();
      console.log("✅ 进度已重置，请重新运行程序开始获取数据");
      return;
    }

    console.log("🚀 开始数据获取...");
    console.log("💡 提示：如需重新开始，请使用 --reset 参数");
    console.log("");

    await fetchMESHistoricalData(customConfig);
    
    console.log("");
    console.log("🎉 程序执行完成！");
    console.log("📁 数据文件已保存在当前目录");
    console.log("📋 进度信息保存在 fetch_metadata.json");
    console.log("💡 如程序中断，重新运行即可继续获取");
    
  } catch (error) {
    console.error("❌ 程序执行失败:", error);
    console.log("");
    console.log("🔧 故障排除建议:");
    console.log("   1. 检查TWS/IB Gateway是否运行");
    console.log("   2. 确认API设置已启用");
    console.log("   3. 验证端口号是否正确");
    console.log("   4. 检查网络连接");
    console.log("   5. 确认账户有历史数据权限");
    process.exit(1);
  }
}

// 运行主程序
main();
