# 江城信约 · AgentEscrow

> 为 **BOT Chain · BUILD BEYOND 2026** 分赛道【从零新建】的黑客松项目。
> 链上信誉 + 任务托管系统：AI Agent 质押注册 → 领取赏金任务 → 提交交付物 → 验收放款并评分；欺诈可被罚没质押（抗女巫）。

## 这是什么

- **AgentRegistry**：Agent 用原生 BOT 质押注册，累计好评/差评，链上聚合一个 0–100 信誉分；欺诈或差评超阈值时治理方可 `slash` 罚没质押，抬高女巫注册成本；信誉良好可注销提回。
- **TaskEscrow**：发布者 `createTask{value: BOT}` 托管赏金并带需求 metadata → Agent `assign` 接单 → `submitDeliverable(hash, uri)` → `accept` 放款并记好评 / `reject` 进入争议 → 仲裁人 `resolveRelease`（放款）或 `resolveRefund`（退款 + 可选罚没 Agent）。

### 跨项目故事线
> **江城信约**发任务托管 → 质押 Agent 接单 → 用「**江城验真**」的方法验收交付物 → 信约放款并记信誉 → 「**江城链察**」对这笔链上交易做复盘。

## 网络

| 网络 | Chain ID | RPC | 浏览器 | 代币 |
|---|---|---|---|---|
| **Bohr 测试网**（默认） | `968` (`0x3C8`) | https://rpc.bohr.life | https://scan.bohr.life | BOT |
| BOT Chain 主网 | `677` (`0x2A5`) | https://rpc.botchain.ai | https://scan.botchain.ai | BOT |

- 测试币 Faucet：https://faucet.botchain.ai/zh/basic
- 钱包：BO Wallet / MetaMask（均为标准 EVM）

## 目录结构

```
wuhan-agent-escrow/
├── contracts/            # Solidity 合约（AgentRegistry.sol, TaskEscrow.sol）
├── test/                 # Hardhat 测试（14 个用例）
├── scripts/
│   ├── deploy.js         # 一键部署 + 打印 scan 链接 + 写 deployments/<net>.json
│   └── demo.js           # 测试网演示：全流程 + 争议罚没分支
├── deployments/          # 部署后落盘的地址记录
└── frontend/             # React19 + Vite + TS + ethers v6 液态玻璃 dApp
```

## 环境依赖

- Node.js ≥ 18（开发机为 v22），npm
- 一个 EVM 钱包（BO Wallet / MetaMask），自有测试网 BOT

## 本地快速开始

```bash
# 1) 合约
npm install
npx hardhat compile
npx hardhat test            # 14 passing

# 2) 起本地链并部署 + 跑全流程演示
npx hardhat node &          # 保持运行
npm run deploy:local         # 部署到 localhost
npm run demo:local           # 注册→发任务→接单→提交→验收放款+好评；拒收→争议→罚没

# 3) 前端
cd frontend
npm install
cp .env.example .env         # 把 deploy 打印的地址填进 VITE_REGISTRY/ESCROW_ADDRESS
npm run typecheck
npm run dev                  # http://127.0.0.1:5210
```

---

## 🚀 测试网 → Gas 申请 → 主网（按此顺序）

> 背景：BOT Chain Gas Support 每个合格项目可申请 **1 BOT（主网部署用）**，仅可提交一次，申请表 6 栏。
> 必须**先在测试网 Bohr(968) 部署并跑通**，拿到第 ②③ 栏链接，才能提交申请。

### 第 1 步：配置网络
在钱包中添加 Bohr 测试网（脚本 `w.switchTo` 也会自动触发加链）：
- Network Name: `Bohr Testnet`
- RPC URL: `https://rpc.bohr.life`
- Chain ID: `968`
- Currency Symbol: `BOT`
- Block Explorer: `https://scan.bohr.life`

### 第 2 步：领测试币
打开 https://faucet.botchain.ai/zh/basic ，用你的钱包地址领测试 BOT。

### 第 3 步：测试网部署与验证
```bash
cp .env.example .env        # 填入你自己的 PRIVATE_KEY（0x…，仅本地，绝不提交）
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network bohr
```
终端会打印两个合约地址、合约浏览器链接、每笔部署交易链接 —— **这些就是申请表第 ③ 栏可直接粘贴的内容**。

随后跑演示，产生多笔可核验交易：
```bash
npx hardhat run scripts/demo.js --network bohr
```

### 第 4 步：部署前端（申请表第 ② 栏 Demo URL）
```bash
cd frontend
cp .env.example .env
# 填入上一步打印的 VITE_REGISTRY_ADDRESS / VITE_ESCROW_ADDRESS
VITE_BASE_PATH=/agent-escrow/ npm run build      # 产出 dist/
# 把 dist/ 部署到静态托管（Vercel/Netlify/GitHub Pages/自有 wutiantian.cn 子目录）
# 得到公开 URL，例如 https://<你的站点>/agent-escrow/
```
前端默认连 Bohr(968)，右上角可切到主网(677)；每笔交易都给出对应 scan 链接。

### 第 5 步：填写 Gas 申请表（https://forms.gle/7WJNKfcyJLQ4vujt7 ）
| 栏 | 填什么 |
|---|---|
| ① 项目名称 | 江城信约 AgentEscrow |
| ② Demo URL | 第 4 步的公开前端 URL |
| ③ 测试网合约/交易链接 | 第 3 步打印的 `scan.bohr.life/address/0x…` 与 `/tx/0x…` |
| ④ 收款钱包 | 你的 BOT Chain 地址 |
| ⑤ 姓名/角色 | 你自己填写 |
| ⑥ Telegram/Wechat | 你自己填写 |

### 第 6 步：收到 1 BOT → 主网部署
```bash
# .env 不变（同一个有余额的部署钱包）
npx hardhat run scripts/deploy.js --network botchain
npx hardhat run scripts/demo.js  --network botchain
# 把打印的主网合约地址与交易记录作为最终可验证交付
```

## 主网部署命令序列（速查）

```bash
npm install
npx hardhat compile
cp .env.example .env     # 填 PRIVATE_KEY
npx hardhat run scripts/deploy.js  --network botchain
npx hardhat run scripts/demo.js   --network botchain
# 把 deployments/botchain.json 里的地址填入 frontend/.env，重新 build 前端
```

详见 [`DEPLOY.md`](./DEPLOY.md)。

## 安全

- **绝不**在仓库硬编码私钥；`PRIVATE_KEY` 仅从 `.env` / 环境变量读取，`.env` 已被 `.gitignore` 排除。
- 合约遵守 checks-effects-interactions、ReentrancyGuard、Ownable2Step；原生 BOT 转账均做成功校验。
- 仲裁/罚没路径为 MVP 治理方案：owner=部署者=默认仲裁人，`setArbitrator` 可移交。

## 第三方归属

- 合约基于 [OpenZeppelin Contracts v5](https://github.com/OpenZeppelin/openzeppelin-contracts)（MIT）。
- 前端液态玻璃样式语言复用姊妹项目 `wuhan-agent-trust`（MIT）。
- 其余为本项目原创。

## License

MIT — 见 [LICENSE](./LICENSE)。
