from ib_insync import *
import pandas as pd
import time  # 新增时间模块用于速率控制
from datetime import datetime, timedelta
import pytz  # 用于处理时区
import os
import json

# 连接 TWS / IB Gateway（增加超时参数）
ib = IB()
try:
    ib.connect('127.0.0.1', 7496, clientId=1, timeout=30)  # 增加超时时间至30秒
    print("✅ 成功连接到TWS")
except Exception as e:
    print(f"❌ 连接TWS失败: {str(e)}")
    print("请检查：1. TWS是否运行 2. API设置是否启用 3. 端口是否正确")
    exit()

# 定义产品
base_contract = Future(symbol='MES', exchange='CME', currency='USD')
base_contract.includeExpired = True  # 包含已到期合约

# 获取所有可用合约
print("🔍 正在获取合约列表...")
contracts = ib.reqContractDetails(base_contract)

# 过滤过去两年内的合约
two_years_ago = datetime.now(tz=pytz.timezone('US/Central')) - timedelta(days=730)
valid_contracts = []
for c in contracts:
    expiry_str = c.contract.lastTradeDateOrContractMonth
    try:
        # 尝试完整日期格式
        expiry_date = datetime.strptime(expiry_str, "%Y%m%d")
    except:
        try:
            # 尝试年月格式（自动补01日）
            expiry_date = datetime.strptime(expiry_str + "01", "%Y%m%d")
        except:
            continue
    # 为 expiry_date 添加时区（假设与数据一致）
    expiry_date = expiry_date.replace(tzinfo=pytz.timezone('US/Central'))
    if expiry_date >= two_years_ago:
        valid_contracts.append(c.contract)

print(f"✅ 找到 {len(valid_contracts)} 个有效 MES 合约（过去两年内）")
print("合约列表:", [c.localSymbol for c in valid_contracts])

# 加载日志文件（用于恢复）
log_file = 'fetch_log.json'
if os.path.exists(log_file):
    with open(log_file, 'r') as f:
        log = json.load(f)
else:
    log = {}

# 定义一个函数获取某个合约的 1min 历史数据
def fetch_contract_data(contract, max_retries=3):
    """
    获取单个合约的历史数据（带重试机制和磁盘持久化）
    :param contract: 合约对象
    :param max_retries: 最大重试次数
    :return: None（数据直接保存到磁盘）
    """
    local_symbol = contract.localSymbol
    temp_file = f"{local_symbol}_temp.csv"
    
    # 恢复位置
    end_dt = log.get(local_symbol, '')
    
    # 计算到期日
    expiry_str = contract.lastTradeDateOrContractMonth
    try:
        expiry_date = datetime.strptime(expiry_str, "%Y%m%d").replace(tzinfo=pytz.timezone('US/Central'))
    except:
        try:
            expiry_date = datetime.strptime(expiry_str + "01", "%Y%m%d").replace(tzinfo=pytz.timezone('US/Central'))
        except:
            print(f" ⚠️ 无法解析 {local_symbol} 的到期日，跳过")
            return
    
    now = datetime.now(tz=pytz.timezone('US/Central'))
    if end_dt == '' and expiry_date < now:
        # 对于已到期合约，从到期日结束开始获取，避免超时
        end_dt = expiry_date.strftime("%Y%m%d 23:59:59")
        print(f" 📅 {local_symbol} 已到期，设置初始 end_dt 为 {end_dt}")
    
    start_date = now - timedelta(days=730)  # 两年起始点
    
    print(f"\n📌 开始获取 {local_symbol} 数据... (从 {end_dt if end_dt else '现在'} 恢复)")
    while True:
        # === 核心优化1：减小单次请求量 ===
        bars = None
        for retry in range(max_retries):
            try:
                bars = ib.reqHistoricalData(
                    contract,
                    endDateTime=end_dt,
                    durationStr='7 D',  # 从30D减少到7D（关键优化）
                    barSizeSetting='1 min',
                    whatToShow='TRADES',
                    useRTH=False,
                    formatDate=1,
                    keepUpToDate=False,
                    timeout=60  # 增加单次请求超时
                )
                break  # 成功则跳出重试循环
            except Exception as e:
                print(f" ⚠️ 请求失败 (重试 {retry+1}/{max_retries}): {str(e)}")
                if retry < max_retries - 1:
                    wait_time = 2 ** retry
                    print(f" ⏳ 等待 {wait_time} 秒后重试...")
                    time.sleep(wait_time)
                else:
                    print(f" ❌ 合约 {local_symbol} 请求失败")
                    return
        
        if not bars:
            break
            
        df = util.df(bars)
        if df.empty:
            break
        
        # === 核心优化2：数据有效性检查 ===
        df = df[df['date'] >= start_date]  # 确保只保留两年内数据
        if df.empty:
            break
        
        # 立即保存到临时CSV（追加模式）
        header = not os.path.exists(temp_file)
        df.to_csv(temp_file, mode='a', header=header, index=False)
        
        # === 核心优化3：严格速率控制 ===
        time.sleep(1.1)  # 严格遵守IB 1秒/请求限制
        
        # 更新请求时间点（提前1分钟避免数据重叠）
        new_end_dt = df['date'].min() - timedelta(minutes=1)
        end_dt = new_end_dt.strftime("%Y%m%d %H:%M:%S")
        
        # 更新日志
        log[local_symbol] = end_dt
        with open(log_file, 'w') as f:
            json.dump(log, f)
        
        print(f" ✅ {local_symbol}: 获取 {len(df)} 条 | 范围: {df['date'].min().strftime('%Y-%m-%d')} ~ {df['date'].max().strftime('%Y-%m-%d')} | 已保存到 {temp_file}")
        
        # 提前终止条件
        if df['date'].min() <= start_date:
            break

# 逐个合约获取数据
for i, contract in enumerate(valid_contracts):
    print(f"\n{'='*50}")
    print(f"⏳ 处理合约 {i+1}/{len(valid_contracts)}: {contract.localSymbol}")
    print(f"{'='*50}")
    
    # 确保为已到期合约设置 includeExpired
    if 'includeExpired' in dir(contract):
        contract.includeExpired = True
    
    try:
        fetch_contract_data(contract)
    except Exception as e:
        print(f" ❗ 跳过合约 {contract.localSymbol} 错误: {str(e)}")
        continue

# 从临时文件合并所有数据
all_data = []
for contract in valid_contracts:
    temp_file = f"{contract.localSymbol}_temp.csv"
    if os.path.exists(temp_file):
        try:
            df = pd.read_csv(temp_file, parse_dates=['date'])
            if not df.empty:
                df['contract'] = contract.localSymbol
                all_data.append(df)
                print(f" 📊 加载 {contract.localSymbol} 数据: {len(df)} 条")
            else:
                print(f" ⚠️ {temp_file} 为空")
        except Exception as e:
            print(f" ❌ 加载 {temp_file} 失败: {str(e)}")

# 拼接所有合约数据
if all_data:
    result = pd.concat(all_data).drop_duplicates().sort_values('date').reset_index(drop=True)
    
    # 添加数据质量检查
    print(f"\n🔍 数据质量检查:")
    print(f" - 总数据量: {len(result)} 条")
    print(f" - 时间范围: {result['date'].min()} ~ {result['date'].max()}")
    if not result.empty:
        total_minutes = (result['date'].max() - result['date'].min()).total_seconds() / 60
        if total_minutes > 0:
            missing_rate = 100 * (1 - len(result) / total_minutes)
            print(f" - 数据连续性: 每分钟数据缺失率 {missing_rate:.2f}%")
        else:
            print(" - 数据连续性: 无法计算（时间范围为0）")
    else:
        print(" - 数据连续性: 无数据")
    
    # 保存到 CSV
    filename = f"MES_1min_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    result.to_csv(filename, index=False)
    print(f"\n✅ 数据已保存到 {filename}")
    
    # 生成数据摘要
    print("\n📊 数据摘要:")
    print(result.describe(include='all', datetime_is_numeric=True))
else:
    print("\n❌ 未获取到任何有效数据")

# 断开连接
try:
    ib.disconnect()
    print("\n🔌 已安全断开TWS连接")
except:
    pass