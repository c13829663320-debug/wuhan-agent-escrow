// 链参数与合约地址：全部由 env 注入，同一构建可在测试网/主网切换。
//
// env 变量（见 frontend/.env.example）：
//   VITE_DEFAULT_NETWORK = bohr | botchain
//   VITE_REGISTRY_ADDRESS, VITE_ESCROW_ADDRESS  —— 部署后由 deploy.js 打印

export type NetworkDef = {
  key: 'bohr' | 'botchain'
  label: string
  chainId: number
  chainIdHex: string
  rpc: string
  explorer: string
  symbol: string
  decimals: number
}

export const NETWORKS: Record<'bohr' | 'botchain', NetworkDef> = {
  // 测试网 Bohr（默认）
  bohr: {
    key: 'bohr',
    label: 'Bohr 测试网',
    chainId: 968,
    chainIdHex: '0x3C8', // 968
    rpc: 'https://rpc.bohr.life',
    explorer: 'https://scan.bohr.life',
    symbol: 'BOT',
    decimals: 18,
  },
  // 主网 BOT Chain
  botchain: {
    key: 'botchain',
    label: 'BOT Chain 主网',
    chainId: 677,
    chainIdHex: '0x2A5',
    rpc: 'https://rpc.botchain.ai',
    explorer: 'https://scan.botchain.ai',
    symbol: 'BOT',
    decimals: 18,
  },
}

export const DEFAULT_NETWORK_KEY =
  ((import.meta.env.VITE_DEFAULT_NETWORK as string) || 'bohr') === 'botchain'
    ? 'botchain'
    : 'bohr'

export const DEFAULT_NETWORK = NETWORKS[DEFAULT_NETWORK_KEY]

export const REGISTRY_ADDRESS = (import.meta.env.VITE_REGISTRY_ADDRESS as string) || ''
export const ESCROW_ADDRESS = (import.meta.env.VITE_ESCROW_ADDRESS as string) || ''

export const txLink = (net: NetworkDef, hash: string) => `${net.explorer}/tx/${hash}`
export const addrLink = (net: NetworkDef, addr: string) => `${net.explorer}/address/${addr}`
