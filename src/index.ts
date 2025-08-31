import ibkr, { MarketDataManager } from "@stoqey/ibkr";
import { Command } from "commander";
import { BarSizeSetting, WhatToShow } from "@stoqey/ib";
import { init } from "./init";
import { fetchHistoryData, type HistoryFetchOptions } from "./history";

await ibkr();
const mdm = MarketDataManager.Instance;

const commander = new Command("IBKR History Fetch Tool");

commander.version(process.env.npm_package_version!);

commander
  .command("init")
  .description("初始化合约列表和时间分片")
  .option("-s, --symbol <symbol>", "合约符号")
  .option("-e, --exchange <exchange>", "交易所")
  .option("-c, --currency <currency>", "货币")
  .option("-t, --secType <secType>", "证券类型")
  .action(async ({ symbol, exchange, currency, secType }) => {
    await init({ symbol, exchange, currency, secType });
    process.exit(0);
  });

commander
  .command("history")
  .description("批量获取历史数据")
  .option("-d, --duration <duration>", "数据持续时间", "3600 S")
  .option("-b, --barSize <barSize>", "K线大小 (1|5|10|15|30|60|300|900|1800|3600|14400|86400)", "5")
  .option("-w, --whatToShow <whatToShow>", "数据类型 (TRADES|MIDPOINT|BID|ASK|BID_ASK)", "TRADES")
  .option("-p, --progressInterval <interval>", "进度显示间隔", "10")
  .action(async ({ duration, barSize, whatToShow, progressInterval }) => {
    try {
      // 解析 barSize 参数
      let parsedBarSize: BarSizeSetting;
      switch (barSize) {
        case "1":
          parsedBarSize = BarSizeSetting.SECONDS_ONE;
          break;
        case "5":
          parsedBarSize = BarSizeSetting.SECONDS_FIVE;
          break;
        case "10":
          parsedBarSize = BarSizeSetting.SECONDS_TEN;
          break;
        case "15":
          parsedBarSize = BarSizeSetting.SECONDS_FIFTEEN;
          break;
        case "30":
          parsedBarSize = BarSizeSetting.SECONDS_THIRTY;
          break;
        case "60":
          parsedBarSize = BarSizeSetting.MINUTES_ONE;
          break;
        case "300":
          parsedBarSize = BarSizeSetting.MINUTES_FIVE;
          break;
        case "900":
          parsedBarSize = BarSizeSetting.MINUTES_FIFTEEN;
          break;
        case "1800":
          parsedBarSize = BarSizeSetting.MINUTES_THIRTY;
          break;
        case "3600":
          parsedBarSize = BarSizeSetting.HOURS_ONE;
          break;
        case "14400":
          parsedBarSize = BarSizeSetting.HOURS_FOUR;
          break;
        case "86400":
          parsedBarSize = BarSizeSetting.DAYS_ONE;
          break;
        default:
          parsedBarSize = BarSizeSetting.SECONDS_FIVE;
      }

      // 解析 whatToShow 参数
      let parsedWhatToShow: WhatToShow;
      switch (whatToShow.toUpperCase()) {
        case "TRADES":
          parsedWhatToShow = WhatToShow.TRADES;
          break;
        case "MIDPOINT":
          parsedWhatToShow = WhatToShow.MIDPOINT;
          break;
        case "BID":
          parsedWhatToShow = WhatToShow.BID;
          break;
        case "ASK":
          parsedWhatToShow = WhatToShow.ASK;
          break;
        case "BID_ASK":
          parsedWhatToShow = WhatToShow.BID_ASK;
          break;
        default:
          parsedWhatToShow = WhatToShow.TRADES;
      }

      const options: HistoryFetchOptions = {
        duration,
        barSize: parsedBarSize,
        whatToShow: parsedWhatToShow,
        progressInterval: parseInt(progressInterval, 10)
      };

      console.log("🚀 开始批量获取历史数据...");
      console.log(`配置: 持续时间=${duration}, K线大小=${barSize}秒, 数据类型=${whatToShow}`);
      
      await fetchHistoryData(options);
      
      console.log("✅ 历史数据获取完成！");
      process.exit(0);
    } catch (error: any) {
      console.error("❌ 获取历史数据时发生错误:", error.message);
      process.exit(1);
    }
  });

commander.parse(process.argv);
