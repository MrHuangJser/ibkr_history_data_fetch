import { BarSizeSetting, SecType, WhatToShow, type Contract } from "@stoqey/ib";
import { MarketDataManager, type MarketData } from "@stoqey/ibkr";
import dayjs from "dayjs";
import {
  EMPTY,
  Observable,
  catchError,
  concatMap,
  from,
  mergeMap,
  of,
  tap,
  timer,
} from "rxjs";
import { mergeConfig, type MESFetcherConfig } from "../config.js";

interface ContractInfo {
  conId: number;
  expiryStr: string;
  expiry: Date;
  contract: Contract;
}

interface HistoricalDataRequest {
  contract: Contract;
  endDateTime: string;
  durationStr: string;
}

/**
 * MES历史数据获取器
 * 实现IBKR API限制：每分钟最多60次请求，1分钟级数据每次最多获取1周
 */
export class MESHistoricalDataFetcher {
  private mdm: MarketDataManager;
  private readonly config: MESFetcherConfig;
  private readonly REQUEST_INTERVAL_MS: number;

  constructor(userConfig: Partial<MESFetcherConfig> = {}) {
    this.config = mergeConfig(userConfig);
    this.mdm = MarketDataManager.Instance;
    this.REQUEST_INTERVAL_MS =
      (60 * 1000) / this.config.dataFetch.maxRequestsPerMinute;

    console.log(`🔧 配置信息:`);
    console.log(
      `   - 请求间隔: ${this.REQUEST_INTERVAL_MS}ms (每分钟${this.config.dataFetch.maxRequestsPerMinute}次)`
    );
    console.log(
      `   - 每次获取: ${this.config.dataFetch.maxDurationDays}天数据`
    );
    console.log(`   - 历史范围: ${this.config.dataFetch.historyYears}年`);
    console.log(
      `   - 盘后数据: ${
        this.config.dataFetch.includeAfterHours ? "包含" : "不包含"
      }`
    );
  }

  /**
   * 获取过去两年内的MES合约
   */
  async getPastContracts(): Promise<ContractInfo[]> {
    // 定义 MES 基础合约（不指定到期）
    const mesBase: Partial<Contract> = {
      symbol: "MES",
      secType: SecType.FUT,
      exchange: "CME",
      currency: "USD",
      includeExpired: true,
    };

    const all = await this.mdm.searchContracts(mesBase);
    if (!all || all.length === 0) {
      console.error("❌ 未找到任何 MES 合约");
      throw new Error("未找到MES合约");
    }

    const now = new Date();
    const pastYears = new Date(
      Date.UTC(
        now.getUTCFullYear() - this.config.dataFetch.historyYears,
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );

    // 映射 + 解析到期日
    const parsed = all.map((d) => {
      const expStr = d.contract.lastTradeDateOrContractMonth;
      const exp = dayjs(expStr).toDate();
      return {
        conId: d.contract.conId!,
        expiryStr: expStr ?? "",
        expiry: exp,
        contract: d.contract,
      };
    });

    // 过滤指定年数范围内（含今天），排除未来
    const filtered = parsed.filter(
      (x) => x.expiry && x.expiry <= now && x.expiry >= pastYears
    );

    // 去重（按 conId）
    const seen = new Set<number>();
    const deduped = filtered.filter((x) => {
      if (seen.has(x.conId)) return false;
      seen.add(x.conId);
      return true;
    });

    // 升序排序
    return deduped.sort((a, b) => a.expiry!.getTime() - b.expiry!.getTime());
  }

  /**
   * 为单个合约生成历史数据请求序列
   * 从当前时间向前回溯，每次请求7天数据
   */
  private generateRequestsForContract(
    contract: Contract,
    startDate: Date,
    endDate: Date = new Date()
  ): HistoricalDataRequest[] {
    const requests: HistoricalDataRequest[] = [];
    let currentEnd = endDate;

    while (currentEnd > startDate) {
      const daysBefore = new Date(
        currentEnd.getTime() -
          this.config.dataFetch.maxDurationDays * 24 * 60 * 60 * 1000
      );
      const actualStart = daysBefore > startDate ? daysBefore : startDate;

      requests.push({
        contract,
        endDateTime: dayjs(currentEnd).format("YYYYMMDD HH:mm:ss"),
        durationStr: `${this.config.dataFetch.maxDurationDays} D`,
      });

      currentEnd = actualStart;
    }

    return requests;
  }

  /**
   * 执行单个历史数据请求
   */
  private executeHistoricalDataRequest(
    request: HistoricalDataRequest
  ): Observable<MarketData[]> {
    console.log(
      `📊 请求历史数据: ${request.contract.localSymbol} 结束时间: ${request.endDateTime}`
    );

    return from(
      this.mdm.getHistoricalData(
        request.contract,
        request.endDateTime,
        request.durationStr,
        BarSizeSetting.MINUTES_ONE,
        WhatToShow.TRADES,
        !this.config.dataFetch.includeAfterHours // useRTH，true=仅常规交易时间
      )
    ).pipe(
      tap((data) => {
        console.log(
          `✅ 获取到 ${data.length} 条数据 (${request.contract.localSymbol})`
        );
      }),
      catchError((error) => {
        console.error(
          `❌ 请求失败 (${request.contract.localSymbol}):`,
          error.message
        );
        return of([]); // 返回空数组而不是中断整个流
      })
    );
  }

  /**
   * 获取所有MES合约的1分钟级历史数据
   * 使用RxJS实现流控制
   */
  fetchAllMESHistoricalData(): Observable<{
    contract: Contract;
    data: MarketData[];
  }> {
    return from(this.getPastContracts()).pipe(
      // 展开合约数组
      mergeMap((contracts) => {
        console.log(`🔍 找到 ${contracts.length} 个MES合约`);

        // 为每个合约生成请求序列
        const allRequests: Array<{
          contractInfo: ContractInfo;
          request: HistoricalDataRequest;
        }> = [];

        contracts.forEach((contractInfo) => {
          // 计算该合约的数据获取时间范围
          const now = new Date();
          const yearsAgo = new Date(
            now.getFullYear() - this.config.dataFetch.historyYears,
            now.getMonth(),
            now.getDate()
          );

          // 对于已到期的合约，结束时间为到期日
          const endDate = contractInfo.expiry < now ? contractInfo.expiry : now;

          const requests = this.generateRequestsForContract(
            contractInfo.contract,
            yearsAgo,
            endDate
          );

          requests.forEach((request) => {
            allRequests.push({ contractInfo, request });
          });
        });

        console.log(`📋 总共生成 ${allRequests.length} 个数据请求`);

        return from(allRequests);
      }),

      // 实现流控制：每秒最多1个请求
      concatMap((item, index) => {
        return timer(index * this.REQUEST_INTERVAL_MS).pipe(
          mergeMap(() =>
            this.executeHistoricalDataRequest(item.request).pipe(
              tap(() => {
                const progress = (((index + 1) / 100) * 100).toFixed(1);
                console.log(`⏳ 进度: ${index + 1} 个请求完成`);
              }),
              // 将数据与合约信息关联
              mergeMap((data) =>
                data.length > 0
                  ? of({ contract: item.contractInfo.contract, data })
                  : EMPTY
              )
            )
          )
        );
      })
    );
  }

  /**
   * 启动数据获取流程
   */
  async startFetching(): Promise<void> {
    console.log("🚀 开始获取MES历史数据...");

    const allData: Array<{ contract: Contract; data: MarketData[] }> = [];

    return new Promise((resolve, reject) => {
      this.fetchAllMESHistoricalData().subscribe({
        next: (result) => {
          allData.push(result);
          console.log(
            `📈 已收集 ${result.contract.localSymbol} 的 ${result.data.length} 条数据`
          );
        },
        error: (error) => {
          console.error("❌ 数据获取过程中发生错误:", error);
          reject(error);
        },
        complete: async () => {
          console.log(
            `✅ 所有数据获取完成！总共收集了 ${allData.length} 个合约的数据`
          );

          // 保存数据到文件
          await this.saveDataToFile(allData);
          resolve();
        },
      });
    });
  }

  /**
   * 保存数据到文件
   */
  private async saveDataToFile(
    allData: Array<{ contract: Contract; data: MarketData[] }>
  ): Promise<void> {
    if (allData.length === 0) {
      console.log("⚠️ 没有数据需要保存");
      return;
    }

    // 合并所有数据
    const combinedData: Array<MarketData & { symbol: string }> = [];

    allData.forEach(({ contract, data }) => {
      data.forEach((item) => {
        combinedData.push({
          ...item,
          symbol: contract.localSymbol || contract.symbol || "MES",
        });
      });
    });

    if (combinedData.length === 0) {
      console.log("⚠️ 合并后没有有效数据");
      return;
    }

    // 按时间排序
    combinedData.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    console.log(`💾 准备保存 ${combinedData.length} 条历史数据记录`);
    console.log(
      `📅 数据时间范围: ${combinedData[0]?.date} 至 ${
        combinedData[combinedData.length - 1]?.date
      }`
    );

    // 生成CSV内容
    const csvHeader = "symbol,date,open,high,low,close,volume,count,wap";
    const csvRows = combinedData.map((item) => {
      return [
        item.symbol,
        item.date,
        item.open,
        item.high,
        item.low,
        item.close,
        item.volume,
        item.count || 0,
        item.wap || item.close,
      ].join(this.config.output.csvSeparator);
    });

    const csvContent = [csvHeader, ...csvRows].join("\n");

    // 生成文件名
    const timestamp = this.config.output.includeTimestamp
      ? `_${dayjs().format("YYYYMMDD_HHmmss")}`
      : "";
    const filename = `${this.config.output.filenamePrefix}${timestamp}.csv`;

    try {
      // 使用Bun的内置文件写入功能
      await Bun.write(filename, csvContent);
      console.log(`✅ 数据已成功保存到: ${filename}`);

      // 显示数据统计
      const uniqueSymbols = [
        ...new Set(combinedData.map((item) => item.symbol)),
      ];
      console.log(`📊 数据统计:`);
      console.log(`   - 合约数量: ${uniqueSymbols.length}`);
      console.log(`   - 数据记录: ${combinedData.length} 条`);
      console.log(`   - 合约列表: ${uniqueSymbols.join(", ")}`);
    } catch (error) {
      console.error(`❌ 保存文件失败:`, error);
    }
  }
}

// 导出主要功能
export async function fetchMESHistoricalData(
  config?: Partial<MESFetcherConfig>
): Promise<void> {
  const fetcher = new MESHistoricalDataFetcher(config);
  await fetcher.startFetching();
}

// 保持原有的函数以兼容现有代码
async function getPastContracts() {
  const fetcher = new MESHistoricalDataFetcher();
  return await fetcher.getPastContracts();
}
