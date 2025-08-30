/**
 * 数据获取元数据管理
 * 用于跟踪每个合约的数据获取进度，支持断点续传
 */

import dayjs from "dayjs";

export interface ContractProgress {
  /** 合约ID */
  conId: number;
  /** 合约代码 */
  symbol: string;
  /** 合约到期日 */
  expiry: string;
  /** 最后获取的数据时间点 */
  lastFetchedDateTime: string;
  /** 目标开始时间 */
  targetStartDateTime: string;
  /** 是否已完成 */
  completed: boolean;
  /** 已获取的数据条数 */
  totalRecords: number;
  /** 最后更新时间 */
  lastUpdated: string;
  /** CSV文件路径 */
  csvFilePath: string;
}

export interface FetchMetadata {
  /** 开始时间 */
  startTime: string;
  /** 配置信息 */
  config: {
    historyYears: number;
    maxDurationDays: number;
    includeAfterHours: boolean;
  };
  /** 所有合约的进度 */
  contracts: Record<number, ContractProgress>;
  /** 最后更新时间 */
  lastUpdated: string;
}

export class MetadataManager {
  private metadataFile: string;
  private metadata: FetchMetadata;

  constructor(metadataFile: string = "fetch_metadata.json") {
    this.metadataFile = metadataFile;
    // 初始化为默认值，实际加载在init方法中进行
    this.metadata = {
      startTime: dayjs().toISOString(),
      config: {
        historyYears: 2,
        maxDurationDays: 7,
        includeAfterHours: false,
      },
      contracts: {},
      lastUpdated: dayjs().toISOString(),
    };
  }

  /**
   * 异步初始化元数据
   */
  async init(): Promise<void> {
    this.metadata = await this.loadMetadata();
  }

  /**
   * 加载元数据文件
   */
  private async loadMetadata(): Promise<FetchMetadata> {
    try {
      const file = Bun.file(this.metadataFile);
      if (await file.exists()) {
        const content = JSON.parse(await file.text());
        console.log(`📋 加载现有元数据: ${Object.keys(content.contracts || {}).length} 个合约`);
        return content;
      }
    } catch (error) {
      console.log("📋 创建新的元数据文件");
    }

    return {
      startTime: dayjs().toISOString(),
      config: {
        historyYears: 2,
        maxDurationDays: 7,
        includeAfterHours: false,
      },
      contracts: {},
      lastUpdated: dayjs().toISOString(),
    };
  }

  /**
   * 保存元数据到文件
   */
  async saveMetadata(): Promise<void> {
    this.metadata.lastUpdated = dayjs().toISOString();
    try {
      await Bun.write(this.metadataFile, JSON.stringify(this.metadata, null, 2));
    } catch (error) {
      console.error("❌ 保存元数据失败:", error);
    }
  }

  /**
   * 初始化会话
   */
  async initSession(config: { historyYears: number; maxDurationDays: number; includeAfterHours: boolean }): Promise<void> {
    // 确保元数据已加载
    if (!this.metadata.contracts) {
      await this.init();
    }

    // 如果配置发生变化，重置所有进度
    const configChanged = 
      this.metadata.config.historyYears !== config.historyYears ||
      this.metadata.config.maxDurationDays !== config.maxDurationDays ||
      this.metadata.config.includeAfterHours !== config.includeAfterHours;

    if (configChanged) {
      console.log("⚠️ 配置已更改，重置所有进度");
      this.metadata.contracts = {};
    }

    this.metadata.config = config;
    this.metadata.startTime = dayjs().toISOString();
  }

  /**
   * 初始化合约进度
   */
  initContractProgress(
    conId: number,
    symbol: string,
    expiry: Date,
    targetStartDateTime: string,
    csvFilePath: string
  ): ContractProgress {
    const expiryStr = dayjs(expiry).toISOString();
    
    if (!this.metadata.contracts[conId]) {
      this.metadata.contracts[conId] = {
        conId,
        symbol,
        expiry: expiryStr,
        lastFetchedDateTime: dayjs(expiry).toISOString(), // 从到期日开始向前获取
        targetStartDateTime,
        completed: false,
        totalRecords: 0,
        lastUpdated: dayjs().toISOString(),
        csvFilePath,
      };
    }

    return this.metadata.contracts[conId];
  }

  /**
   * 更新合约进度
   */
  async updateContractProgress(
    conId: number,
    lastFetchedDateTime: string,
    recordCount: number
  ): Promise<void> {
    if (this.metadata.contracts[conId]) {
      this.metadata.contracts[conId].lastFetchedDateTime = lastFetchedDateTime;
      this.metadata.contracts[conId].totalRecords += recordCount;
      this.metadata.contracts[conId].lastUpdated = dayjs().toISOString();
      
      // 检查是否已完成
      const progress = this.metadata.contracts[conId];
      if (dayjs(progress.lastFetchedDateTime).isBefore(dayjs(progress.targetStartDateTime))) {
        progress.completed = true;
        console.log(`✅ 合约 ${progress.symbol} 数据获取完成 (${progress.totalRecords} 条记录)`);
      }

      await this.saveMetadata();
    }
  }

  /**
   * 获取需要继续获取数据的合约列表
   */
  getPendingContracts(): ContractProgress[] {
    return Object.values(this.metadata.contracts).filter(contract => !contract.completed);
  }

  /**
   * 获取合约的下一个请求时间点
   */
  getNextFetchDateTime(conId: number, maxDurationDays: number): string | null {
    const progress = this.metadata.contracts[conId];
    if (!progress || progress.completed) {
      return null;
    }

    const lastFetched = dayjs(progress.lastFetchedDateTime);
    const targetStart = dayjs(progress.targetStartDateTime);
    
    if (lastFetched.isBefore(targetStart)) {
      return null; // 已完成
    }

    // 计算下一个请求的结束时间（向前回溯）
    const nextEnd = lastFetched.subtract(1, 'minute'); // 避免重复数据
    return nextEnd.format("YYYYMMDD HH:mm:ss");
  }

  /**
   * 获取统计信息
   */
  getStatistics(): {
    totalContracts: number;
    completedContracts: number;
    pendingContracts: number;
    totalRecords: number;
  } {
    const contracts = Object.values(this.metadata.contracts);
    return {
      totalContracts: contracts.length,
      completedContracts: contracts.filter(c => c.completed).length,
      pendingContracts: contracts.filter(c => !c.completed).length,
      totalRecords: contracts.reduce((sum, c) => sum + c.totalRecords, 0),
    };
  }

  /**
   * 清理元数据（重新开始）
   */
  async reset(): Promise<void> {
    this.metadata = {
      startTime: dayjs().toISOString(),
      config: this.metadata.config,
      contracts: {},
      lastUpdated: dayjs().toISOString(),
    };
    await this.saveMetadata();
    console.log("🔄 元数据已重置");
  }
}
