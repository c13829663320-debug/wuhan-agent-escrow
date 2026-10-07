import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Wallet, Plus, Handshake, Upload, CheckCircle2, XCircle, Gavel, Link2 } from 'lucide-react'
import { Glass, GlassButton } from './components/Glass'
import { useWallet } from './lib/useWallet'
import { NETWORKS, DEFAULT_NETWORK, REGISTRY_ADDRESS, ESCROW_ADDRESS, addrLink } from './lib/chains'
import { ethers } from 'ethers'
import registryAbi from './lib/AgentRegistry.abi.json'
import escrowAbi from './lib/TaskEscrow.abi.json'

type NetKey = 'bohr' | 'botchain'

const STATUS_LABEL = ['Open', 'Assigned', 'Submitted', 'Accepted', 'Disputed', 'ResolvedReleased', 'ResolvedRefunded', 'Cancelled']

type TaskView = {
  id: bigint
  publisher: string
  bounty: bigint
  metadataURI: string
  agent: string
  deliverableHash: string
  deliverableURI: string
  status: number
}

export default function App() {
  const w = useWallet()
  const [netKey, setNetKey] = useState<NetKey>(DEFAULT_NETWORK.key)
  const net = NETWORKS[netKey]

  const [agentInfo, setAgentInfo] = useState<{ active: boolean; stake: bigint; good: bigint; bad: bigint; score: number } | null>(null)
  const [tasks, setTasks] = useState<TaskView[]>([])
  const [bounty, setBounty] = useState('0.5')
  const [need, setNeed] = useState('ipfs://wuhan-agent-escrow/task/demo')
  const delivURI = 'ipfs://wuhan-agent-escrow/deliv/web'
  const slashAmt = '0.2'

  const wrongChain = w.chainId !== 0 && w.chainId !== net.chainId

  async function refresh() {
    if (!REGISTRY_ADDRESS || !ESCROW_ADDRESS) return
    try {
      const p = new ethers.JsonRpcProvider(net.rpc)
      const reg = new ethers.Contract(REGISTRY_ADDRESS, registryAbi, p)
      const esc = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, p)
      if (w.account) {
        const a = await reg.agents(w.account)
        setAgentInfo({ active: a.active, stake: a.stake, good: a.goodCount, bad: a.badCount, score: Number(await reg.score(w.account)) })
      } else {
        setAgentInfo(null)
      }
      const n = await esc.taskCount()
      const list: TaskView[] = []
      for (let i = 1n; i <= n; i++) {
        const t = await esc.tasks(i)
        list.push({ id: t.id, publisher: t.publisher, bounty: t.bounty, metadataURI: t.metadataURI, agent: t.agent, deliverableHash: t.deliverableHash, deliverableURI: t.deliverableURI, status: Number(t.status) })
      }
      setTasks(list.reverse())
    } catch (e) {
      /* rpc 未连上时静默 */
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.account, w.chainId, netKey])

  async function doRegister() {
    const reg = await w.reg(REGISTRY_ADDRESS)
    await w.send('注册+质押 1 BOT', net, () => reg.register('ipfs://wuhan-agent-escrow/agent/web', { value: ethers.parseEther('1') }))
    refresh()
  }
  async function doCreate() {
    const esc = await w.esc(ESCROW_ADDRESS)
    await w.send('创建任务托管', net, () => esc.createTask(need, { value: ethers.parseEther(bounty) }))
    refresh()
  }
  async function doAssign(id: bigint) {
    const esc = await w.esc(ESCROW_ADDRESS)
    await w.send('接单 #' + id, net, () => esc.assign(id))
    refresh()
  }
  async function doSubmit(id: bigint) {
    const esc = await w.esc(ESCROW_ADDRESS)
    const hash = ethers.keccak256(ethers.toUtf8Bytes('deliverable-' + Date.now()))
    await w.send('提交交付物 #' + id, net, () => esc.submitDeliverable(id, hash, delivURI))
    refresh()
  }
  async function doAccept(id: bigint) {
    const esc = await w.esc(ESCROW_ADDRESS)
    await w.send('验收放款 #' + id, net, () => esc.accept(id))
    refresh()
  }
  async function doReject(id: bigint) {
    const esc = await w.esc(ESCROW_ADDRESS)
    await w.send('拒收→争议 #' + id, net, () => esc.reject(id))
    refresh()
  }
  async function doResolveRefund(id: bigint) {
    const esc = await w.esc(ESCROW_ADDRESS)
    await w.send('裁决退款+罚没 #' + id, net, () => esc.resolveRefund(id, ethers.parseEther(slashAmt)))
    refresh()
  }

  return (
    <div className="lab">
      <div className="page-tint" />
      <div className="topbar">
        <div className="wordmark">
          江城信约
          <small>AGENT ESCROW · BOT CHAIN</small>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={netKey} onChange={e => setNetKey(e.target.value as NetKey)} style={{ minHeight: 38, width: 150 }}>
            <option value="bohr">Bohr 测试网 (968)</option>
            <option value="botchain">BOT 主网 (677)</option>
          </select>
          {w.account ? (
            <div className="netpill">
              <b>{net.label}</b> · {w.account.slice(0, 6)}…{w.account.slice(-4)}
            </div>
          ) : (
            <GlassButton className="primary" onClick={w.connect}>
              <Wallet size={14} /> 连接钱包
            </GlassButton>
          )}
        </div>
      </div>

      <main>
        <div className="hero">
          <div className="eyebrow"><span /> 链上信誉 × 任务托管 · 抗女巫</div>
          <h1>信约发任务，<em>质押 Agent</em> 来接单。</h1>
          <p>发布者托管 BOT 赏金 → 注册 Agent 质押接单 → 提交交付物 hash → 验收放款并记信誉；拒收进入争议，仲裁可退款并罚没质押。</p>
        </div>

        {!REGISTRY_ADDRESS && (
          <div className="error">未配置合约地址：请先按 README 部署合约，并把 VITE_REGISTRY_ADDRESS / VITE_ESCROW_ADDRESS 填入 frontend/.env。</div>
        )}
        {w.account && wrongChain && (
          <div className="error">
            当前钱包在 chainId {w.chainId}，请切换到 {net.label} ({net.chainId})。
            <div className="row"><GlassButton className="primary" onClick={() => w.switchTo(net)}>切换到 {net.label}</GlassButton></div>
          </div>
        )}
        {w.error && <div className="error">{w.error}</div>}

        <div className="grid">
          {/* 我的 Agent */}
          <Glass className="card">
            <h2><Handshake size={16} style={{ marginRight: 6 }} />我的 Agent</h2>
            <div className="sub">质押 BOT 注册成为可接单的 Agent</div>
            {agentInfo?.active ? (
              <>
                <div className="metrics">
                  <div className="metric"><span>质押</span><strong>{ethers.formatEther(agentInfo.stake)} BOT</strong></div>
                  <div className="metric"><span>好评 / 差评</span><strong>{Number(agentInfo.good)} / {Number(agentInfo.bad)}</strong></div>
                  <div className="metric"><span>信誉分</span><strong>{agentInfo.score}</strong></div>
                </div>
                <p className="muted">已在册，可在下方开放任务中接单。</p>
              </>
            ) : (
              <>
                <p className="muted">尚未注册。注册需质押 ≥ 1 BOT（抗女巫门槛）。</p>
                <div className="row">
                  <GlassButton className="primary" onClick={doRegister} disabled={w.busy}>
                    {w.busy ? <span className="spin" /> : <Plus size={14} />} 注册 + 质押 1 BOT
                  </GlassButton>
                </div>
              </>
            )}
          </Glass>

          {/* 发任务 */}
          <Glass className="card">
            <h2><Plus size={16} style={{ marginRight: 6 }} />发布赏金任务</h2>
            <div className="sub">托管 BOT 赏金，带需求 metadata URI</div>
            <label>赏金 (BOT)
              <input value={bounty} onChange={e => setBounty(e.target.value)} />
            </label>
            <label>需求 URI (metadata)
              <input value={need} onChange={e => setNeed(e.target.value)} />
            </label>
            <GlassButton className="primary" onClick={doCreate} disabled={w.busy || !w.account}>
              <Gavel size={14} /> 托管发任务
            </GlassButton>
          </Glass>
        </div>

        {/* 任务列表 */}
        <h2 style={{ fontSize: 20, margin: '26px 0 12px' }}>任务大厅</h2>
        <div className="tasklist">
          {tasks.length === 0 && <div className="muted">暂无任务。先发布一个，或等待注册 Agent 接单。</div>}
          {tasks.map(t => {
            const mine = w.account && (t.publisher.toLowerCase() === w.account.toLowerCase() || t.agent.toLowerCase() === w.account.toLowerCase())
            return (
              <motion.div key={t.id.toString()} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="task">
                <div className="top">
                  <span className="id">#{t.id.toString()}</span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="bounty">{ethers.formatEther(t.bounty)} BOT</span>
                    <span className={'status ' + STATUS_LABEL[t.status]}>{STATUS_LABEL[t.status]}</span>
                  </span>
                </div>
                <div className="meta">需求: {t.metadataURI}</div>
                {t.status === 2 && <div className="meta">交付: {t.deliverableURI} · hash <span className="mono">{t.deliverableHash.slice(0, 18)}…</span></div>}
                <div className="row">
                  {t.status === 0 && <GlassButton className="secondary" onClick={() => doAssign(t.id)} disabled={w.busy || !w.account}><Handshake size={13} /> 接单</GlassButton>}
                  {t.status === 1 && mine && <GlassButton className="secondary" onClick={() => doSubmit(t.id)} disabled={w.busy}><Upload size={13} /> 提交交付物</GlassButton>}
                  {t.status === 2 && t.publisher.toLowerCase() === (w.account || '').toLowerCase() && (
                    <>
                      <GlassButton className="primary" onClick={() => doAccept(t.id)} disabled={w.busy}><CheckCircle2 size={13} /> 验收放款</GlassButton>
                      <GlassButton className="secondary" onClick={() => doReject(t.id)} disabled={w.busy}><XCircle size={13} /> 拒收(争议)</GlassButton>
                    </>
                  )}
                  {t.status === 4 && (
                    <GlassButton className="secondary" onClick={() => doResolveRefund(t.id)} disabled={w.busy}><Gavel size={13} /> 裁决退款+罚没 {slashAmt} BOT</GlassButton>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* 交易记录 */}
        <h2 style={{ fontSize: 20, margin: '30px 0 12px' }}>我的交易记录</h2>
        <div className="txlist">
          {w.ticks.length === 0 && <div className="muted">每一笔链上交易都会显示在此，点击直达浏览器核验。</div>}
          {w.ticks.map((t, i) => (
            <a key={i} href={t.url} target="_blank" rel="noreferrer">
              <span>{t.label} <Link2 size={11} style={{ marginLeft: 4 }} /></span>
              <span className="hash">{t.hash.slice(0, 20)}…</span>
            </a>
          ))}
        </div>

        <div className="addrbox">
          合约地址 · {net.label}<br />
          Registry: <a href={addrLink(net, REGISTRY_ADDRESS)} target="_blank" rel="noreferrer" className="mono">{REGISTRY_ADDRESS}</a><br />
          Escrow: <a href={addrLink(net, ESCROW_ADDRESS)} target="_blank" rel="noreferrer" className="mono">{ESCROW_ADDRESS}</a>
        </div>
      </main>

      <footer>
        江城信约 AgentEscrow · 为 BOT Chain BUILD BEYOND 2026 从零新建 · 原生代币 BOT ·
        测试网 Faucet: https://faucet.botchain.ai/zh/basic
      </footer>
    </div>
  )
}
