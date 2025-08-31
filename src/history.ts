import { BarSizeSetting, WhatToShow, type Contract } from "@stoqey/ib";
import { MarketDataManager } from "@stoqey/ibkr";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import fs from "fs-extra";
import path from "path";
import { concatMap, of, timer } from "rxjs";

// 配置 dayjs 插件
dayjs.extend(timezone);
dayjs.extend(utc);

// 频控管理器类
class RateLimiter {
  private requestHistory: Map<string, number[]> = new Map(); // 存储每个合约的请求时间戳
  private globalRequestTimes: number[] = []; // 全局请求时间戳
  private lastRequestTime = 0; // 上次请求时间

  // 生成请求的唯一标识符
  private getRequestKey(contract: Contract, dateStr: string): string {
    return `${contract.localSymbol}-${contract.exchange}-${dateStr}`;
  }

  // 检查是否可以发起请求
  canMakeRequest(contract: Contract, dateStr: string): boolean {
    const now = Date.now();
    const requestKey = this.getRequestKey(contract, dateStr);

    // 1. 检查 15 秒内是否有相同请求
    const contractRequests = this.requestHistory.get(requestKey) || [];
    const recentSameRequests = contractRequests.filter(
      (time) => now - time < 15000
    );
    if (recentSameRequests.length > 0) {
      console.log(`跳过重复请求: ${requestKey} (15秒内已请求过)`);
      return false;
    }

    // 2. 检查 2 秒内同一合约的请求次数（不超过 5 次，留 1 次缓冲）
    const contractKey = `${contract.localSymbol}-${contract.exchange}`;
    const contractAllRequests = Array.from(this.requestHistory.entries())
      .filter(([key]) => key.startsWith(contractKey))
      .flatMap(([, times]) => times)
      .filter((time) => now - time < 2000);

    if (contractAllRequests.length >= 5) {
      return false;
    }

    // 3. 检查 10 分钟内全局请求次数（不超过 50 次，留 10 次缓冲）
    this.globalRequestTimes = this.globalRequestTimes.filter(
      (time) => now - time < 600000
    );
    if (this.globalRequestTimes.length >= 50) {
      return false;
    }

    // 4. 检查与上次请求的最小间隔（至少 3 秒）
    if (now - this.lastRequestTime < 3000) {
      return false;
    }

    return true;
  }

  // 记录请求
  recordRequest(contract: Contract, dateStr: string): void {
    const now = Date.now();
    const requestKey = this.getRequestKey(contract, dateStr);

    // 记录具体请求
    const contractRequests = this.requestHistory.get(requestKey) || [];
    contractRequests.push(now);
    this.requestHistory.set(requestKey, contractRequests);

    // 记录全局请求
    this.globalRequestTimes.push(now);
    this.lastRequestTime = now;

    // 清理过期记录
    this.cleanup();
  }

  // 清理过期记录
  private cleanup(): void {
    const now = Date.now();

    // 清理 15 分钟前的记录
    for (const [key, times] of this.requestHistory.entries()) {
      const validTimes = times.filter((time) => now - time < 900000); // 15 分钟
      if (validTimes.length === 0) {
        this.requestHistory.delete(key);
      } else {
        this.requestHistory.set(key, validTimes);
      }
    }

    // 清理全局请求记录
    this.globalRequestTimes = this.globalRequestTimes.filter(
      (time) => now - time < 900000
    );
  }

  // 获取建议的等待时间
  getWaitTime(contract: Contract, dateStr: string): number {
    const now = Date.now();

    // 检查最小间隔
    const minWait = Math.max(0, 3000 - (now - this.lastRequestTime));

    // 检查 2 秒窗口
    const contractKey = `${contract.localSymbol}-${contract.exchange}`;
    const contractAllRequests = Array.from(this.requestHistory.entries())
      .filter(([key]) => key.startsWith(contractKey))
      .flatMap(([, times]) => times)
      .filter((time) => now - time < 2000);

    const contractWait = contractAllRequests.length >= 5 ? 2000 : 0;

    // 检查 10 分钟窗口
    const globalWait = this.globalRequestTimes.length >= 50 ? 60000 : 0; // 等待 1 分钟

    return Math.max(minWait, contractWait, globalWait);
  }
}

// 历史数据获取选项接口
export interface HistoryFetchOptions {
  duration?: string; // 数据持续时间，默认 "1 H"
  barSize?: BarSizeSetting; // K线大小，默认 SECONDS_FIVE
  whatToShow?: WhatToShow; // 数据类型，默认 TRADES
  progressInterval?: number; // 进度显示间隔，默认每10个请求
}

async function getHistoricalData(
  contract: Contract,
  dateStr: string,
  rateLimiter: RateLimiter,
  mdm: MarketDataManager,
  options: HistoryFetchOptions = {}
) {
  // 记录请求
  rateLimiter.recordRequest(contract, dateStr);

  const {
    duration = "3600 S",
    barSize = BarSizeSetting.SECONDS_FIVE,
    whatToShow = WhatToShow.TRADES,
  } = options;

  const data = await mdm.getHistoricalData(
    contract,
    dateStr,
    duration,
    barSize,
    whatToShow,
    false
  );

  if (!data?.length) {
    console.log(`${contract.localSymbol}-${dateStr} 没有数据`);
    return [];
  }

  const filePath = `history_data/${contract.localSymbol}-${contract.lastTradeDate}.csv`;
  if (!(await fs.pathExists(filePath))) {
    // 写入表头
    await fs.writeFile(filePath, `datetime,open,high,low,close,volume\n`);
  }

  await fs.appendFile(
    filePath,
    data
      .map(
        (item) =>
          `${dayjs(item.date)
            .tz("America/Chicago")
            .format("YYYY-MM-DD HH:mm:ss")},${item.open},${item.high},${
            item.low
          },${item.close},${item.volume}`
      )
      .join("\n") + "\n"
  );

  console.log(
    `${contract.localSymbol}-${dateStr} ${data.length} 条记录写入成功`
  );
  return data;
}

async function safeGetHistoricalData(
  contract: Contract,
  dateStr: string,
  rateLimiter: RateLimiter,
  mdm: MarketDataManager,
  options: HistoryFetchOptions = {}
) {
  // 检查是否可以立即请求
  if (!rateLimiter.canMakeRequest(contract, dateStr)) {
    const waitTime = rateLimiter.getWaitTime(contract, dateStr);
    if (waitTime > 0) {
      console.log(
        `等待 ${Math.ceil(waitTime / 1000)} 秒后请求 ${
          contract.localSymbol
        }-${dateStr}`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      return await getHistoricalData(
        contract,
        dateStr,
        rateLimiter,
        mdm,
        options
      );
    } catch (err: any) {
      retryCount++;

      if (err.message.includes("pacing violation")) {
        const backoffTime = Math.min(30000, 5000 * Math.pow(2, retryCount)); // 指数退避，最多30秒
        console.warn(
          `触发 pacing violation (重试 ${retryCount}/${maxRetries})，等待 ${
            backoffTime / 1000
          } 秒后重试...`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
      } else if (err.message.includes("No security definition")) {
        console.warn(`合约定义不存在: ${contract.localSymbol}, 跳过此请求`);
        return [];
      } else if (err.message.includes("HMDS query returned no data")) {
        console.log(`${contract.localSymbol}-${dateStr} HMDS 查询无数据`);
        return [];
      } else {
        console.error(
          `请求失败 (重试 ${retryCount}/${maxRetries}):`,
          err.message
        );
        if (retryCount >= maxRetries) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  throw new Error(
    `请求失败，已达到最大重试次数: ${contract.localSymbol}-${dateStr}`
  );
}

/**
 * 批量获取历史数据的主函数
 * @param options 配置选项
 * @returns Promise<void>
 */
export async function fetchHistoryData(
  options: HistoryFetchOptions = {}
): Promise<void> {
  const mdm = MarketDataManager.Instance;
  const rateLimiter = new RateLimiter();

  // 读取待处理的请求列表
  const SPLICES = await fs.readJson(
    path.join(process.cwd(), "./history_data/contract-list-splices.json")
  );

  const SPLICES_LIST = SPLICES as {
    startTime: string;
    endTime: string;
    contract: Contract;
  }[];

  // 添加进度跟踪
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const totalCount = SPLICES_LIST.length;
  const progressInterval = options.progressInterval || 10;

  console.log(`开始处理 ${totalCount} 个历史数据请求...`);
  console.log(`预计完成时间: ${Math.ceil((totalCount * 3) / 60)} 分钟`);

  // 按合约分组以优化处理顺序
  const groupedByContract = SPLICES_LIST.reduce((groups, item) => {
    const key = `${item.contract.localSymbol}-${item.contract.exchange}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<string, typeof SPLICES_LIST>);

  console.log(`发现 ${Object.keys(groupedByContract).length} 个不同的合约`);

  // 创建处理队列，交替处理不同合约以避免单一合约频控
  const processingQueue: typeof SPLICES_LIST = [];
  const contractKeys = Object.keys(groupedByContract);
  let maxLength = Math.max(
    ...Object.values(groupedByContract).map((arr) => arr.length)
  );

  for (let i = 0; i < maxLength; i++) {
    for (const contractKey of contractKeys) {
      const contractItems = groupedByContract[contractKey];
      if (contractItems && i < contractItems.length) {
        const item = contractItems[i];
        if (item) {
          processingQueue.push(item);
        }
      }
    }
  }

  console.log(`处理队列已创建，共 ${processingQueue.length} 个请求`);

  return new Promise((resolve, reject) => {
    of(...processingQueue)
      .pipe(
        concatMap((item) => {
          // 动态调整延迟时间
          const baseDelay = 3000; // 基础延迟 3 秒
          const adaptiveDelay = rateLimiter.canMakeRequest(
            item.contract,
            item.endTime
          )
            ? baseDelay
            : baseDelay * 2;

          return timer(adaptiveDelay).pipe(
            concatMap(async () => {
              try {
                const result = await safeGetHistoricalData(
                  item.contract,
                  item.endTime + " US/Central",
                  rateLimiter,
                  mdm,
                  options
                );
                processedCount++;

                // 更新 SPLICES_LIST（移除已处理的项目）
                const index = SPLICES_LIST.findIndex(
                  (spliceItem) =>
                    spliceItem.endTime === item.endTime &&
                    spliceItem.contract.localSymbol ===
                      item.contract.localSymbol
                );

                if (index !== -1) {
                  SPLICES_LIST.splice(index, 1);
                  await fs.writeFile(
                    path.join(
                      process.cwd(),
                      "./history_data/contract-list-splices.json"
                    ),
                    JSON.stringify(SPLICES_LIST, null, 2)
                  );
                }

                // 每处理指定数量的请求显示一次进度
                if (
                  processedCount % progressInterval === 0 ||
                  processedCount === totalCount
                ) {
                  const progress = (
                    ((processedCount + skippedCount + errorCount) /
                      totalCount) *
                    100
                  ).toFixed(1);
                  console.log(
                    `进度: ${progress}% (${
                      processedCount + skippedCount + errorCount
                    }/${totalCount}) - 成功: ${processedCount}, 跳过: ${skippedCount}, 错误: ${errorCount}`
                  );
                }

                return result;
              } catch (err: any) {
                errorCount++;
                console.error(
                  `处理失败: ${item.contract.localSymbol}-${item.endTime}:`,
                  err.message
                );
                return [];
              }
            })
          );
        })
      )
      .subscribe({
        next: (data) => {
          // 处理成功的数据
        },
        error: (err) => {
          console.error("处理过程中发生错误:", err);
          reject(err);
        },
        complete: () => {
          console.log("\n=== 处理完成 ===");
          console.log(`总计: ${totalCount} 个请求`);
          console.log(`成功: ${processedCount} 个`);
          console.log(`跳过: ${skippedCount} 个`);
          console.log(`错误: ${errorCount} 个`);
          console.log(`剩余未处理: ${SPLICES_LIST.length} 个`);

          if (SPLICES_LIST.length === 0) {
            console.log("🎉 所有历史数据请求已完成！");
          } else {
            console.log("⚠️  仍有未完成的请求，可以重新运行程序继续处理");
          }

          resolve();
        },
      });
  });
}
