// Company metadata: Chinese name, full English name, sector tagline
// Logo URLs use Clearbit public API (no key required, just domain)
export const COMPANY_INFO = {
  AAPL: {
    zh: '苹果',
    en: 'Apple Inc.',
    tagline: '消费电子与软件生态平台',
    logo: 'https://logo.clearbit.com/apple.com',
  },
  SPY: {
    zh: '标普500ETF',
    en: 'SPDR S&P 500 ETF Trust',
    tagline: '追踪标普500指数，全市场基准',
    logo: 'https://logo.clearbit.com/ssga.com',
  },
  QQQ: {
    zh: '纳斯达克100ETF',
    en: 'Invesco QQQ Trust',
    tagline: '追踪纳斯达克100科技权重指数',
    logo: 'https://logo.clearbit.com/invesco.com',
  },
  TSLA: {
    zh: '特斯拉',
    en: 'Tesla, Inc.',
    tagline: '新能源汽车、储能与AI自动驾驶',
    logo: 'https://logo.clearbit.com/tesla.com',
  },
  MSFT: {
    zh: '微软',
    en: 'Microsoft Corporation',
    tagline: '云计算、AI企业软件与操作系统',
    logo: 'https://logo.clearbit.com/microsoft.com',
  },
  XOM: {
    zh: '埃克森美孚',
    en: 'Exxon Mobil Corporation',
    tagline: '综合石油天然气，全球传统能源巨头',
    logo: 'https://logo.clearbit.com/exxonmobil.com',
  },
  GLD: {
    zh: '黄金ETF',
    en: 'SPDR Gold Shares',
    tagline: '实物黄金支持的避险资产ETF',
    logo: 'https://logo.clearbit.com/spdrgoldshares.com',
  },
  NVDA: {
    zh: '英伟达',
    en: 'NVIDIA Corporation',
    tagline: 'AI算力芯片、数据中心GPU',
    logo: 'https://logo.clearbit.com/nvidia.com',
  },
  AMD: {
    zh: '超威半导体',
    en: 'Advanced Micro Devices',
    tagline: 'CPU/GPU处理器、AI推理芯片',
    logo: 'https://logo.clearbit.com/amd.com',
  },
  META: {
    zh: 'Meta',
    en: 'Meta Platforms, Inc.',
    tagline: '社交广告平台与AI应用、元宇宙',
    logo: 'https://logo.clearbit.com/meta.com',
  },
  MRVL: {
    zh: '迈威尔科技',
    en: 'Marvell Technology, Inc.',
    tagline: '数据基础设施芯片、网络与存储',
    logo: 'https://logo.clearbit.com/marvell.com',
  },
  NOK: {
    zh: '诺基亚',
    en: 'Nokia Corporation',
    tagline: '5G网络设备与电信基础设施',
    logo: 'https://logo.clearbit.com/nokia.com',
  },
};

export function getCompanyInfo(symbol) {
  return COMPANY_INFO[symbol?.toUpperCase()] || null;
}
