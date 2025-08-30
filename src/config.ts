/**
 * MES历史数据获取配置
 */

export interface MESFetcherConfig {
  /** IBKR连接配置 */
  connection: {
    /** TWS/IB Gateway主机地址 */
    host: string;
    /** TWS/IB Gateway端口 */
    port: number;
    /** 客户端ID */
    clientId: number;
  };

  /** 数据获取配置 */
  dataFetch: {
    /** 每分钟最大请求数 */
    maxRequestsPerMinute: number;
    /** 每次请求的最大天数 */
    maxDurationDays: number;
    /** 历史数据回溯年数 */
    historyYears: number;
    /** 是否包含盘后交易数据 */
    includeAfterHours: boolean;
  };

  /** 输出配置 */
  output: {
    /** 输出文件名前缀 */
    filenamePrefix: string;
    /** 是否包含时间戳 */
    includeTimestamp: boolean;
    /** CSV分隔符 */
    csvSeparator: string;
  };
}

/** 默认配置 */
export const DEFAULT_CONFIG: MESFetcherConfig = {
  connection: {
    host: "127.0.0.1",
    port: 7496, // TWS paper trading 默认端口
    clientId: 1,
  },

  dataFetch: {
    maxRequestsPerMinute: 60,
    maxDurationDays: 7,
    historyYears: 2,
    includeAfterHours: true,
  },

  output: {
    filenamePrefix: "MES_1min_historical",
    includeTimestamp: true,
    csvSeparator: ",",
  },
};

/**
 * 合并用户配置与默认配置
 */
export function mergeConfig(
  userConfig: Partial<MESFetcherConfig> = {}
): MESFetcherConfig {
  return {
    connection: { ...DEFAULT_CONFIG.connection, ...userConfig.connection },
    dataFetch: { ...DEFAULT_CONFIG.dataFetch, ...userConfig.dataFetch },
    output: { ...DEFAULT_CONFIG.output, ...userConfig.output },
  };
}
