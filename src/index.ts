import { SecType, type Contract } from "@stoqey/ib";
import ibkr, { MarketDataManager } from "@stoqey/ibkr";

// 兼容 "YYYYMM", "YYYYMMDD", "YYYYMMDD HH:mm:ss TZ" 等格式
function parseExpiryToDate(exp?: string): Date | null {
  if (!exp) return null;

  // 先找 8 位纯数字（YYYYMMDD）
  const m8 = exp.match(/\b(\d{8})\b/);
  if (m8) {
    const y = Number(m8[1]?.slice(0, 4));
    const mo = Number(m8[1]?.slice(4, 6)) - 1;
    const d = Number(m8[1]?.slice(6, 8));
    return new Date(Date.UTC(y, mo, d));
  }

  // 再退化到 6 位（YYYYMM），取当月1日
  const m6 = exp.match(/^\d{6}$/);
  if (m6) {
    const y = Number(exp.slice(0, 4));
    const mo = Number(exp.slice(4, 6)) - 1;
    return new Date(Date.UTC(y, mo, 1));
  }

  return null;
}

async function main() {
  // 初始化连接（会读取 .env 中 IBKR_HOST/PORT/CLIENT_ID 等配置）
  await ibkr();

  // 定义 MES 基础合约（不指定到期）
  const mesBase: Partial<Contract> = {
    symbol: "MES",
    secType: SecType.FUT,
    exchange: "CME",
    currency: "USD",
    includeExpired: true,
  };

  const mdm = MarketDataManager.Instance;

  const all = await mdm.searchContracts(mesBase);
  if (!all || all.length === 0) {
    console.error("❌ 未找到任何 MES 合约");
    process.exit(1);
  }

  const now = new Date();
  const past2 = new Date(
    Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate())
  );

  // 映射 + 解析到期日
  const parsed = all.map((d) => {
    const expStr = d.contract.lastTradeDateOrContractMonth;
    const exp = parseExpiryToDate(expStr);
    return {
      conId: d.contract.conId!,
      expiryStr: expStr ?? "",
      expiry: exp,
    };
  });

  // 过滤过去两年（含今天），排除未来
  const filtered = parsed.filter(
    (x) => x.expiry && x.expiry <= now && x.expiry >= past2
  );

  // 去重（按 conId）
  const seen = new Set<number>();
  const deduped = filtered.filter((x) => {
    if (seen.has(x.conId)) return false;
    seen.add(x.conId);
    return true;
  });

  // 升序排序
  deduped.sort((a, b) => a.expiry!.getTime() - b.expiry!.getTime());

  console.log("✅ 过去两年的 MES 合约（到期日升序）:");
  for (const x of deduped) {
    const iso = x.expiry!.toISOString().slice(0, 10); // YYYY-MM-DD
    console.log(`合约: ${x.expiryStr} -> ${iso}, conId=${x.conId}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => console.error("❌ 出错:", err));
