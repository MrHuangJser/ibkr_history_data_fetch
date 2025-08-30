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
import { mergeConfig, type MESFetcherConfig } from "./config.js";
import { MetadataManager, type ContractProgress } from "./metadata.js";

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
  private metadataManager: MetadataManager;

  constructor(userConfig: Partial<MESFetcherConfig> = {}) {
    this.config = mergeConfig(userConfig);
    this.mdm = MarketDataManager.Instance;
    this.REQUEST_INTERVAL_MS =
      (60 * 1000) / this.config.dataFetch.maxRequestsPerMinute;
    this.metadataManager = new MetadataManager();

    // 初始化会话将在startFetching中异步进行

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

    // 恢复信息将在startFetching中显示
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
   * 执行单个历史数据请求并立即保存
   */
  private executeHistoricalDataRequest(
    request: HistoricalDataRequest,
    contractProgress: ContractProgress
  ): Observable<{ success: boolean; recordCount: number }> {
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
      mergeMap(async (data) => {
        console.log(
          `✅ 获取到 ${data.length} 条数据 (${request.contract.localSymbol})`
        );

        if (data.length > 0) {
          // 立即保存数据到CSV
          await this.appendDataToCSV(
            data,
            request.contract,
            contractProgress.csvFilePath
          );

          // 更新元数据
          const oldestDataTime = data[0]?.date
            ? String(data[0].date)
            : request.endDateTime;
          await this.metadataManager.updateContractProgress(
            request.contract.conId!,
            oldestDataTime,
            data.length
          );
        }

        return { success: true, recordCount: data.length };
      }),
      catchError((error) => {
        console.error(
          `❌ 请求失败 (${request.contract.localSymbol}):`,
          error.message
        );
        return of({ success: false, recordCount: 0 });
      })
    );
  }

  /**
   * 将数据追加到CSV文件
   */
  private async appendDataToCSV(
    data: MarketData[],
    contract: Contract,
    csvFilePath: string
  ): Promise<void> {
    if (data.length === 0) return;

    const symbol = contract.localSymbol || contract.symbol || "MES";

    // 按时间排序（从旧到新）
    const sortedData = data.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // 检查文件是否存在，如果不存在则创建并写入表头
    const file = Bun.file(csvFilePath);
    const fileExists = await file.exists();

    let csvContent = "";

    if (!fileExists) {
      // 写入CSV表头
      csvContent += "symbol,date,open,high,low,close,volume,count,wap\n";
    }

    // 添加数据行
    const csvRows = sortedData.map((item) => {
      return [
        symbol,
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

    csvContent += csvRows.join("\n") + "\n";

    try {
      // 追加写入文件
      if (fileExists) {
        const existingContent = await file.text();
        await Bun.write(csvFilePath, existingContent + csvContent);
      } else {
        await Bun.write(csvFilePath, csvContent);
      }

      console.log(`💾 已保存 ${data.length} 条数据到 ${csvFilePath}`);
    } catch (error) {
      console.error(`❌ 保存数据失败:`, error);
      throw error;
    }
  }

  /**
   * 获取所有MES合约的1分钟级历史数据（支持断点续传）
   * 使用RxJS实现流控制
   */
  fetchAllMESHistoricalData(): Observable<{
    success: boolean;
    recordCount: number;
  }> {
    return from(this.initializeContracts()).pipe(
      // 展开待处理的请求
      mergeMap((pendingRequests) => {
        console.log(`📋 总共需要处理 ${pendingRequests.length} 个数据请求`);

        if (pendingRequests.length === 0) {
          console.log("✅ 所有合约数据已获取完成！");
          return EMPTY;
        }

        return from(pendingRequests);
      }),

      // 实现流控制：每秒最多1个请求
      concatMap((item, index) => {
        return timer(index * this.REQUEST_INTERVAL_MS).pipe(
          mergeMap(() =>
            this.executeHistoricalDataRequest(
              item.request,
              item.contractProgress
            ).pipe(
              tap((result) => {
                console.log(
                  `⏳ 进度: ${index + 1}/${item.totalRequests} 个请求完成`
                );
              })
            )
          )
        );
      })
    );
  }

  /**
   * 初始化合约和生成待处理的请求列表
   */
  private async initializeContracts(): Promise<
    Array<{
      contractProgress: ContractProgress;
      request: HistoricalDataRequest;
      totalRequests: number;
    }>
  > {
    // 获取所有MES合约
    const contracts = await this.getPastContracts();
    console.log(`🔍 找到 ${contracts.length} 个MES合约`);

    const allPendingRequests: Array<{
      contractProgress: ContractProgress;
      request: HistoricalDataRequest;
      totalRequests: number;
    }> = [];

    // 为每个合约初始化进度和生成请求
    for (const contractInfo of contracts) {
      const now = new Date();
      const yearsAgo = new Date(
        now.getFullYear() - this.config.dataFetch.historyYears,
        now.getMonth(),
        now.getDate()
      );

      // 生成CSV文件路径
      const timestamp = dayjs().format("YYYYMMDD");
      const csvFilePath = `${this.config.output.filenamePrefix}_${contractInfo.contract.localSymbol}_${timestamp}.csv`;

      // 初始化合约进度
      const contractProgress = this.metadataManager.initContractProgress(
        contractInfo.conId,
        contractInfo.contract.localSymbol ||
          contractInfo.contract.symbol ||
          "MES",
        contractInfo.expiry,
        dayjs(yearsAgo).toISOString(),
        csvFilePath
      );

      // 如果合约已完成，跳过
      if (contractProgress.completed) {
        console.log(`⏭️ 跳过已完成的合约: ${contractProgress.symbol}`);
        continue;
      }

      // 生成待处理的请求
      const pendingRequests = this.generatePendingRequests(
        contractInfo,
        contractProgress,
        yearsAgo
      );

      pendingRequests.forEach((request) => {
        allPendingRequests.push({
          contractProgress,
          request,
          totalRequests: pendingRequests.length,
        });
      });
    }

    // 保存初始化的元数据
    await this.metadataManager.saveMetadata();

    return allPendingRequests;
  }

  /**
   * 为单个合约生成待处理的请求列表（支持断点续传）
   */
  private generatePendingRequests(
    contractInfo: ContractInfo,
    contractProgress: ContractProgress,
    targetStartDate: Date
  ): HistoricalDataRequest[] {
    const requests: HistoricalDataRequest[] = [];

    // 从元数据中获取下一个请求时间点
    let currentEndDateTime = this.metadataManager.getNextFetchDateTime(
      contractInfo.conId,
      this.config.dataFetch.maxDurationDays
    );

    if (!currentEndDateTime) {
      console.log(`✅ 合约 ${contractProgress.symbol} 已完成所有数据获取`);
      return requests;
    }

    let currentEnd = dayjs(currentEndDateTime);
    const targetStart = dayjs(targetStartDate);

    console.log(
      `🔄 合约 ${contractProgress.symbol} 从 ${currentEndDateTime} 继续获取数据`
    );

    // 生成请求序列
    while (currentEnd.isAfter(targetStart)) {
      const durationDays = this.config.dataFetch.maxDurationDays;
      const requestStart = currentEnd.subtract(durationDays, "day");

      requests.push({
        contract: contractInfo.contract,
        endDateTime: currentEnd.format("YYYYMMDD HH:mm:ss"),
        durationStr: `${durationDays} D`,
      });

      currentEnd = requestStart;
    }

    console.log(
      `📊 合约 ${contractProgress.symbol} 生成 ${requests.length} 个待处理请求`
    );
    return requests;
  }

  /**
   * 启动数据获取流程（支持断点续传）
   */
  async startFetching(): Promise<void> {
    console.log("🚀 开始获取MES历史数据...");

    // 异步初始化会话
    await this.metadataManager.initSession({
      historyYears: this.config.dataFetch.historyYears,
      maxDurationDays: this.config.dataFetch.maxDurationDays,
      includeAfterHours: this.config.dataFetch.includeAfterHours,
    });

    // 显示恢复信息
    const stats = this.metadataManager.getStatistics();
    if (stats.totalContracts > 0) {
      console.log(`🔄 检测到现有进度:`);
      console.log(`   - 总合约数: ${stats.totalContracts}`);
      console.log(`   - 已完成: ${stats.completedContracts}`);
      console.log(`   - 待处理: ${stats.pendingContracts}`);
      console.log(`   - 已获取记录: ${stats.totalRecords}`);
    }

    let totalRequests = 0;
    let completedRequests = 0;
    let totalRecords = 0;

    return new Promise((resolve, reject) => {
      this.fetchAllMESHistoricalData().subscribe({
        next: (result) => {
          completedRequests++;
          totalRecords += result.recordCount;

          if (result.success) {
            console.log(
              `📈 成功处理第 ${completedRequests} 个请求，获取 ${result.recordCount} 条记录`
            );
          } else {
            console.log(`⚠️ 第 ${completedRequests} 个请求失败`);
          }
        },
        error: (error) => {
          console.error("❌ 数据获取过程中发生错误:", error);
          reject(error);
        },
        complete: async () => {
          console.log(`✅ 所有数据获取完成！`);
          console.log(`📊 统计信息:`);
          console.log(`   - 处理请求: ${completedRequests} 个`);
          console.log(`   - 获取记录: ${totalRecords} 条`);

          // 显示最终统计
          const finalStats = this.metadataManager.getStatistics();
          console.log(`📋 最终状态:`);
          console.log(`   - 总合约数: ${finalStats.totalContracts}`);
          console.log(`   - 已完成: ${finalStats.completedContracts}`);
          console.log(`   - 待处理: ${finalStats.pendingContracts}`);
          console.log(`   - 总记录数: ${finalStats.totalRecords}`);

          if (finalStats.pendingContracts > 0) {
            console.log(
              `⚠️ 还有 ${finalStats.pendingContracts} 个合约未完成，可重新运行程序继续获取`
            );
          }

          resolve();
        },
      });
    });
  }

  /**
   * 添加重置功能，清除所有进度重新开始
   */
  async reset(): Promise<void> {
    await this.metadataManager.reset();
    console.log("🔄 已重置所有进度，下次运行将重新开始获取数据");
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
