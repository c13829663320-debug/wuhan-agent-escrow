import { useCallback, useEffect, useState } from 'react'
import { BrowserProvider, Contract } from 'ethers'
import { NETWORKS, type NetworkDef, txLink } from './chains'
import registryAbi from './AgentRegistry.abi.json'
import escrowAbi from './TaskEscrow.abi.json'

declare global {
  interface Window {
    ethereum?: any
  }
}

export type TxNote = { hash: string; label: string; url: string }

export function useWallet() {
  const [account, setAccount] = useState<string>('')
  const [provider, setProvider] = useState<BrowserProvider | null>(null)
  const [chainId, setChainId] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ticks, setTicks] = useState<TxNote[]>([])

  const refreshChain = useCallback(async (p: BrowserProvider) => {
    const n = await p.getNetwork()
    setChainId(Number(n.chainId))
  }, [])

  useEffect(() => {
    if (!window.ethereum) return
    const p = new BrowserProvider(window.ethereum)
    setProvider(p)
    refreshChain(p)
    window.ethereum.on?.('chainChanged', () => refreshChain(p))
    window.ethereum.on?.('accountsChanged', (accs: string[]) => setAccount(accs[0] || ''))
    return () => {
      window.ethereum?.removeAllListeners?.('chainChanged')
      window.ethereum?.removeAllListeners?.('accountsChanged')
    }
  }, [refreshChain])

  const connect = useCallback(async () => {
    setError('')
    if (!window.ethereum) {
      setError('未检测到 EVM 钱包（MetaMask / BO Wallet）。请先安装。')
      return
    }
    try {
      const p = new BrowserProvider(window.ethereum)
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAccount(accs[0])
      setProvider(p)
      await refreshChain(p)
    } catch (e: any) {
      setError(e?.message || '连接钱包失败')
    }
  }, [refreshChain])

  const switchTo = useCallback(async (net: NetworkDef) => {
    setError('')
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: net.chainIdHex }],
      })
    } catch (e: any) {
      // 4902 = 钱包未识别该链 → 触发加链
      if (e?.code === 4902 || /unrecognized/i.test(e?.message || '')) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: net.chainIdHex,
              chainName: net.label,
              nativeCurrency: { name: net.symbol, symbol: net.symbol, decimals: 18 },
              rpcUrls: [net.rpc],
              blockExplorerUrls: [net.explorer],
            },
          ],
        })
      } else {
        setError(e?.message || '切换链失败')
      }
    }
    if (provider) await refreshChain(provider)
  }, [provider, refreshChain])

  const signer = async () => {
    if (!provider) throw new Error('请先连接钱包')
    return provider.getSigner()
  }

  const reg = async (addr: string) => new Contract(addr, registryAbi, await signer())
  const esc = async (addr: string) => new Contract(addr, escrowAbi, await signer())

  /** 发送一笔交易并记录其浏览器链接。 */
  const send = async (label: string, net: NetworkDef, fn: () => Promise<{ hash: string; wait: () => Promise<any> }>) => {
    setBusy(true)
    setError('')
    try {
      const tx = await fn()
      setTicks(t => [{ hash: tx.hash, label, url: txLink(net, tx.hash) }, ...t].slice(0, 12))
      await tx.wait()
      return tx
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || '交易失败')
      throw e
    } finally {
      setBusy(false)
    }
  }

  return {
    account,
    chainId,
    busy,
    error,
    ticks,
    connect,
    switchTo,
    reg,
    esc,
    send,
    networks: NETWORKS,
  }
}
