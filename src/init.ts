import { SecType, type Contract } from "@stoqey/ib";
import { MarketDataManager } from "@stoqey/ibkr";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import weekday from "dayjs/plugin/weekday.js";
import fs from "fs-extra";
import path from "path";

dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.extend(weekday);
dayjs.extend(isoWeek);

interface InitOptions {
  symbol: string;
  exchange: string;
  currency: string;
  secType: string;
}

interface ContractItem {
  startTime: string;
  endTime: string;
  contract: Contract;
}

interface ContractWithTimes extends Contract {
  calculatedStartTime?: string;
  calculatedEndTime: string;
}

/**
 * 计算CME季度合约的最后交易日
 * 规则：到期月份第三个星期五上午 8:30 (Chicago Time, CT)
 * 如果这天是交易假日，则提前到前一个交易日
 * @param lastTradeDateOrContractMonth 合约月份，格式如 "202403" 或 "20240315"
 * @returns 最后交易日时间字符串，格式 "YYYYMMDD HH:mm:ss"
 */
function calculateLastTradeDate(lastTradeDateOrContractMonth: string): string {
  // 提取日期部分，去掉可能的时间信息
  const dateOnly = lastTradeDateOrContractMonth.split(" ")[0]!;
  const year = parseInt(dateOnly.substring(0, 4));
  const month = parseInt(dateOnly.substring(4, 6));

  // 创建该月第一天
  const firstDayOfMonth = dayjs()
    .year(year)
    .month(month - 1)
    .date(1)
    .tz("America/Chicago");

  // 找到第一个星期五
  let firstFriday = firstDayOfMonth;
  while (firstFriday.day() !== 5) {
    // 5 = Friday
    firstFriday = firstFriday.add(1, "day");
  }

  // 第三个星期五
  const thirdFriday = firstFriday.add(14, "day"); // 加两周

  // 设置时间为上午8:30
  let lastTradeDateTime = thirdFriday
    .hour(8)
    .minute(30)
    .second(0)
    .millisecond(0);

  // 检查并调整假日
  lastTradeDateTime = adjustForHolidays(lastTradeDateTime);

  return lastTradeDateTime.format("YYYYMMDD HH:mm:ss");
}

/**
 * 检查给定日期是否为美国交易假日
 * 简化版本，只检查常见假日
 * @param date dayjs对象
 * @returns 是否为假日
 */
function isUSHoliday(date: dayjs.Dayjs): boolean {
  const month = date.month() + 1; // dayjs月份从0开始
  const day = date.date();
  const dayOfWeek = date.day();

  // 新年
  if (month === 1 && day === 1) return true;

  // 独立日
  if (month === 7 && day === 4) return true;

  // 圣诞节
  if (month === 12 && day === 25) return true;

  // 感恩节（11月第四个星期四）
  if (month === 11 && dayOfWeek === 4) {
    let firstThursday = date.startOf("month");
    while (firstThursday.day() !== 4) {
      firstThursday = firstThursday.add(1, "day");
    }
    const fourthThursday = firstThursday.add(21, "day");
    if (date.isSame(fourthThursday, "day")) return true;
  }

  // 可以添加更多假日...

  return false;
}

/**
 * 调整最后交易日，如果是假日则提前到前一个交易日
 * @param lastTradeDate 原始最后交易日
 * @returns 调整后的最后交易日
 */
function adjustForHolidays(lastTradeDate: dayjs.Dayjs): dayjs.Dayjs {
  let adjustedDate = lastTradeDate;

  // 如果是周末或假日，向前调整到最近的交易日
  while (
    adjustedDate.day() === 0 ||
    adjustedDate.day() === 6 ||
    isUSHoliday(adjustedDate)
  ) {
    adjustedDate = adjustedDate.subtract(1, "day");
  }

  return adjustedDate;
}

/**
 * 计算合约的开始时间
 * 对于第一个合约，开始时间设为null（需要手动确定或使用其他方法）
 * 对于后续合约，开始时间为前一个合约的结束时间
 * @param contracts 按时间排序的合约列表
 * @returns 带有计算时间的合约列表
 */
function calculateContractTimes(contracts: Contract[]): ContractWithTimes[] {
  // 按合约月份排序
  const sortedContracts = contracts.sort(
    (a, b) =>
      Number(a.lastTradeDateOrContractMonth) -
      Number(b.lastTradeDateOrContractMonth)
  );

  const result: ContractWithTimes[] = [];

  for (let i = 0; i < sortedContracts.length; i++) {
    const contract = sortedContracts[i];
    if (!contract || !contract.lastTradeDateOrContractMonth) {
      console.warn(
        `合约 ${
          contract?.symbol || "unknown"
        } 缺少 lastTradeDateOrContractMonth，跳过`
      );
      continue;
    }

    const calculatedEndTime = calculateLastTradeDate(
      contract.lastTradeDateOrContractMonth
    );

    let calculatedStartTime: string | undefined;

    if (i === 0) {
      // 第一个合约的开始时间设为undefined，表示需要其他方法确定
      calculatedStartTime = undefined;
    } else {
      // 后续合约的开始时间为前一个合约的结束时间
      calculatedStartTime = result[result.length - 1]?.calculatedEndTime;
    }

    result.push({
      ...contract,
      calculatedStartTime,
      calculatedEndTime,
    });
  }

  return result;
}

/**
 * 检查合约是否为季度合约（3、6、9、12月）
 * @param lastTradeDateOrContractMonth 合约月份字符串，如 "202403" 或 "20240315"
 * @returns 是否为季度合约
 */
function isQuarterlyContract(lastTradeDateOrContractMonth: string): boolean {
  let month: number;

  // 提取日期部分，去掉可能的时间信息
  const dateOnly = lastTradeDateOrContractMonth.split(" ")[0]!;

  if (dateOnly.length === 6) {
    // 格式如 "202403"
    month = parseInt(dateOnly.substring(4, 6));
  } else if (dateOnly.length === 8) {
    // 格式如 "20240315"
    month = parseInt(dateOnly.substring(4, 6));
  } else {
    console.warn(`无法解析合约月份格式: ${lastTradeDateOrContractMonth}`);
    return false;
  }

  return [3, 6, 9, 12].includes(month);
}

/**
 * 根据合约的开始和结束时间将合约按照30分钟分割为多个时间段
 * @param item
 */
function generateContractSplice(
  item: ContractWithTimes,
  sliceDuration: number,
  sliceUnit: "minutes" | "hours" | "days"
) {
  const startTime = dayjs(item.calculatedStartTime); // 转换为芝加哥时间
  const endTime = dayjs(item.calculatedEndTime);
  const duration = endTime.diff(startTime, sliceUnit);

  const splices: {
    startTime: string;
    endTime: string;
    contract: Contract;
  }[] = [];

  for (let i = 0; i < duration; i += sliceDuration) {
    const sliceStart = startTime.add(i, sliceUnit);
    const sliceEnd = startTime.add(i + sliceDuration, sliceUnit);

    // 判断当前 sliceStart 是否为周六或周日
    const dayOfWeek = sliceStart.day(); // 0: Sunday, 6: Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue; // 跳过周末
    }

    splices.push({
      startTime: sliceStart.format("YYYYMMDD HH:mm:ss"),
      endTime: sliceEnd.format("YYYYMMDD HH:mm:ss"),
      // @ts-ignore
      contract: item.contract,
    });
  }

  return splices;
}

export async function init(options: InitOptions): Promise<void> {
  const mdm = MarketDataManager.Instance;
  const contracts = await mdm.searchContracts({
    symbol: options.symbol,
    exchange: options.exchange,
    currency: options.currency,
    secType: options.secType as SecType,
    includeExpired: true,
  });

  // 过滤出已过期的季度合约
  const expiredQuarterlyContracts = contracts.filter((item) => {
    // 检查是否已过期
    const isExpired = dayjs(item.lastTradeDate).isBefore(dayjs());
    // 检查是否为季度合约
    const isQuarterly = item.lastTradeDateOrContractMonth
      ? isQuarterlyContract(item.lastTradeDateOrContractMonth)
      : false;
    return isExpired && isQuarterly;
  });

  // 计算每个合约的开始和结束时间
  const contractsWithTimes = calculateContractTimes(expiredQuarterlyContracts);

  console.log(`找到 ${contractsWithTimes.length} 个已过期的季度合约`);

  // 打印合约信息
  contractsWithTimes.forEach((contract, index) => {
    console.log(`\n合约 ${index + 1}:`);
    console.log(`  符号: ${contract.symbol}`);
    console.log(`  合约月份: ${contract.lastTradeDateOrContractMonth}`);
    console.log(`  最后交易日: ${contract.lastTradeDate}`);
    console.log(`  计算的结束时间: ${contract.calculatedEndTime}`);
    console.log(
      `  计算的开始时间: ${
        contract.calculatedStartTime || "需要手动确定（第一个合约）"
      }`
    );
  });

  const list = contractsWithTimes
    .filter((item) => item.calculatedStartTime)
    .map((item) => generateContractSplice(item, 1, "hours"))
    .reduce((acc, item) => acc.concat(item), []);
  // 将list扁平化并写入到history_data/contract-list-splices.json
  await fs.ensureDir(path.join(process.cwd(), "history_data"));
  await fs.writeFile(
    path.join(process.cwd(), "history_data/contract-list-splices.json"),
    JSON.stringify(list, null, 2)
  );
}
