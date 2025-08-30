#!/usr/bin/env bun

/**
 * IBKR历史数据获取工具 CLI
 * 支持MES期货合约的1分钟级历史数据获取，具备断点续传功能
 */

import ibkr from "@stoqey/ibkr";
import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { MESFetcherConfig } from "./history/config.js";
import {
  fetchMESHistoricalData,
  MESHistoricalDataFetcher,
} from "./history/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取package.json获取版本信息
const packageJsonPath = join(__dirname, "..", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

const program = new Command();

program
  .name("ibkr-history-fetch")
  .description(
    "Interactive Brokers历史数据获取工具 - 支持MES期货合约1分钟级数据获取"
  )
  .version(packageJson.version);

// MES历史数据获取命令
program
  .command("mes")
  .description("获取MES期货合约的历史数据（支持断点续传）")
  .option("-h, --host <host>", "TWS/IB Gateway主机地址", "127.0.0.1")
  .option("-p, --port <port>", "TWS/IB Gateway端口", "7496")
  .option("-c, --client-id <id>", "客户端ID", "1")
  .option("-r, --requests-per-minute <num>", "每分钟最大请求数", "50")
  .option("-d, --duration-days <days>", "每次请求的最大天数", "7")
  .option("-y, --history-years <years>", "历史数据回溯年数", "2")
  .option("--include-after-hours", "包含盘后交易数据")
  .option("--exclude-after-hours", "排除盘后交易数据")
  .option(
    "-o, --output-prefix <prefix>",
    "输出文件名前缀",
    "MES_1min_historical"
  )
  .option("--no-timestamp", "输出文件名不包含时间戳")
  .option("--separator <sep>", "CSV分隔符", ",")
  .option("--reset", "重置所有进度重新开始")
  .option("--dry-run", "预览模式，不实际获取数据")
  .action(async (options) => {
    await ibkr();
    try {
      console.log("🚀 IBKR MES历史数据获取工具");
      console.log("=".repeat(50));

      // 构建配置
      const config: Partial<MESFetcherConfig> = {
        connection: {
          host: options.host,
          port: parseInt(options.port),
          clientId: parseInt(options.clientId),
        },
        dataFetch: {
          maxRequestsPerMinute: parseInt(options.requestsPerMinute),
          maxDurationDays: parseInt(options.durationDays),
          historyYears: parseInt(options.historyYears),
          includeAfterHours:
            options.includeAfterHours || !options.excludeAfterHours,
        },
        output: {
          filenamePrefix: options.outputPrefix,
          includeTimestamp: !options.noTimestamp,
          csvSeparator: options.separator,
        },
      };

      // 显示配置信息
      console.log("📋 配置信息:");
      console.log(
        `   连接: ${config.connection?.host}:${config.connection?.port} (客户端ID: ${config.connection?.clientId})`
      );
      console.log(
        `   请求: 每分钟${config.dataFetch?.maxRequestsPerMinute}次，每次${config.dataFetch?.maxDurationDays}天`
      );
      console.log(`   范围: 过去${config.dataFetch?.historyYears}年`);
      console.log(
        `   盘后: ${config.dataFetch?.includeAfterHours ? "包含" : "排除"}`
      );
      console.log(`   输出: ${config.output?.filenamePrefix}*.csv`);
      console.log("");

      if (options.dryRun) {
        console.log("🔍 预览模式 - 不会实际获取数据");
        console.log("如需实际运行，请移除 --dry-run 参数");
        return;
      }

      if (options.reset) {
        console.log("🔄 重置模式：清除所有进度...");
        const fetcher = new MESHistoricalDataFetcher(config);
        await fetcher.reset();
        console.log("✅ 进度已重置");
        console.log("💡 请重新运行命令开始获取数据（不使用--reset参数）");
        return;
      }

      console.log("⚠️  请确保TWS或IB Gateway已经运行并且API已启用");
      console.log("🚀 开始获取MES历史数据...");
      console.log("");

      await fetchMESHistoricalData(config);

      console.log("");
      console.log("🎉 数据获取完成！");
      console.log("📁 数据文件已保存在当前目录");
      console.log("📋 进度信息保存在 fetch_metadata.json");
    } catch (error) {
      console.error(
        "❌ 执行失败:",
        error instanceof Error ? error.message : error
      );
      console.log("");
      console.log("🔧 故障排除建议:");
      console.log("   1. 检查TWS/IB Gateway是否运行");
      console.log("   2. 确认API设置已启用");
      console.log("   3. 验证端口号是否正确");
      console.log("   4. 检查网络连接");
      console.log("   5. 确认账户有历史数据权限");
      process.exit(1);
    }
  });

// 状态查看命令
program
  .command("status")
  .description("查看当前获取进度和统计信息")
  .action(async () => {
    try {
      const { MetadataManager } = await import("./history/metadata.js");
      const metadataManager = new MetadataManager();
      await metadataManager.init();

      const stats = metadataManager.getStatistics();

      console.log("📊 当前进度统计:");
      console.log("=".repeat(30));
      console.log(`总合约数: ${stats.totalContracts}`);
      console.log(`已完成: ${stats.completedContracts}`);
      console.log(`待处理: ${stats.pendingContracts}`);
      console.log(`总记录数: ${stats.totalRecords.toLocaleString()}`);

      if (stats.pendingContracts > 0) {
        console.log("");
        console.log("📋 待处理合约:");
        const pendingContracts = metadataManager.getPendingContracts();
        pendingContracts.forEach((contract) => {
          console.log(
            `   - ${
              contract.symbol
            }: ${contract.totalRecords.toLocaleString()} 条记录`
          );
        });

        console.log("");
        console.log("💡 运行 'bun start mes' 继续获取数据");
      } else if (stats.totalContracts > 0) {
        console.log("");
        console.log("✅ 所有合约数据获取完成！");
      } else {
        console.log("");
        console.log("ℹ️  尚未开始数据获取");
        console.log("💡 运行 'bun start mes' 开始获取数据");
      }
    } catch (error) {
      console.error(
        "❌ 无法读取状态信息:",
        error instanceof Error ? error.message : error
      );
    }
  });

// 重置命令
program
  .command("reset")
  .description("重置所有进度，清除元数据文件")
  .option("-f, --force", "强制重置，不询问确认")
  .action(async (options) => {
    try {
      if (!options.force) {
        console.log("⚠️  此操作将清除所有获取进度！");
        console.log("💡 如需继续，请使用 --force 参数");
        return;
      }

      const { MESHistoricalDataFetcher } = await import("./history/index.js");
      const fetcher = new MESHistoricalDataFetcher();
      await fetcher.reset();

      console.log("✅ 所有进度已重置");
      console.log("💡 运行 'bun start mes' 重新开始获取数据");
    } catch (error) {
      console.error(
        "❌ 重置失败:",
        error instanceof Error ? error.message : error
      );
    }
  });

// 配置命令
program
  .command("config")
  .description("显示默认配置信息")
  .action(async () => {
    try {
      const { DEFAULT_CONFIG } = await import("./history/config.js");

      console.log("⚙️  默认配置:");
      console.log("=".repeat(30));
      console.log("连接配置:");
      console.log(`   主机: ${DEFAULT_CONFIG.connection.host}`);
      console.log(`   端口: ${DEFAULT_CONFIG.connection.port}`);
      console.log(`   客户端ID: ${DEFAULT_CONFIG.connection.clientId}`);
      console.log("");
      console.log("数据获取配置:");
      console.log(
        `   请求频率: ${DEFAULT_CONFIG.dataFetch.maxRequestsPerMinute} 次/分钟`
      );
      console.log(
        `   每次天数: ${DEFAULT_CONFIG.dataFetch.maxDurationDays} 天`
      );
      console.log(`   历史年数: ${DEFAULT_CONFIG.dataFetch.historyYears} 年`);
      console.log(
        `   盘后数据: ${
          DEFAULT_CONFIG.dataFetch.includeAfterHours ? "包含" : "排除"
        }`
      );
      console.log("");
      console.log("输出配置:");
      console.log(`   文件前缀: ${DEFAULT_CONFIG.output.filenamePrefix}`);
      console.log(
        `   时间戳: ${
          DEFAULT_CONFIG.output.includeTimestamp ? "包含" : "不包含"
        }`
      );
      console.log(`   分隔符: "${DEFAULT_CONFIG.output.csvSeparator}"`);
      console.log("");
      console.log("💡 使用命令行参数可以覆盖这些默认值");
    } catch (error) {
      console.error(
        "❌ 无法读取配置:",
        error instanceof Error ? error.message : error
      );
    }
  });

// 帮助信息
program
  .command("help")
  .description("显示详细帮助信息")
  .action(() => {
    console.log("🔧 IBKR历史数据获取工具 - 详细帮助");
    console.log("=".repeat(50));
    console.log("");
    console.log("📋 主要功能:");
    console.log("   • 获取MES期货合约1分钟级历史数据");
    console.log("   • 支持断点续传，程序中断后可继续");
    console.log("   • 智能流控制，遵守IBKR API限制");
    console.log("   • 增量保存，每获取一周数据立即保存");
    console.log("");
    console.log("🚀 快速开始:");
    console.log("   bun start mes                    # 开始获取数据");
    console.log("   bun start mes --reset            # 重置进度重新开始");
    console.log("   bun start status                 # 查看当前进度");
    console.log("");
    console.log("⚙️  常用选项:");
    console.log("   -p, --port 7497                 # 使用TWS纸盘交易端口");
    console.log("   -r, --requests-per-minute 30    # 降低请求频率");
    console.log("   -y, --history-years 1           # 只获取1年历史数据");
    console.log("   --include-after-hours            # 包含盘后交易数据");
    console.log("   --dry-run                        # 预览模式，不实际获取");
    console.log("");
    console.log("📁 输出文件:");
    console.log("   MES_1min_historical_MESZ4_*.csv # 单个合约数据");
    console.log("   fetch_metadata.json             # 进度元数据");
    console.log("");
    console.log("💡 更多信息请查看 README.md 和 USAGE.md");
  });

// 解析命令行参数
program.parse();

// 如果没有提供命令，显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
