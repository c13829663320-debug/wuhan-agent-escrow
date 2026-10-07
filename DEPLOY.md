# DEPLOY.md · 部署手册（测试网优先 → 主网）

> 你没有也不需要把私钥交给我。本手册所有「发链」命令都由**你自己**在本地执行，
> 私钥只写在你本机的 `.env` 里，绝不入库。

---

## 0. 前置

- Node.js ≥ 18
- 一个 EVM 钱包（BO Wallet / MetaMask）
- 已领测试币：https://faucet.botchain.ai/zh/basic

```bash
cd wuhan-agent-escrow
npm install
cp .env.example .env
```

编辑 `.env`，填入（仅本机）：
```
PRIVATE_KEY=0x你的部署钱包私钥
```

---

## 1. 编译与测试（发链前必过）

```bash
npx hardhat compile
npx hardhat test
```
预期：`14 passing`。

---

## 2. 测试网 Bohr (chainId 968) 部署

```bash
npx hardhat run scripts/deploy.js --network bohr
```

**预期终端输出样例**（地址/hash 为示意）：
```
═══════════════════════════════════════════════════════
  江城信约 AgentEscrow · 部署
═══════════════════════════════════════════════════════
 网络       : bohr (chainId 968)
 部署者     : 0xYourDeployer…
 浏览器     : https://scan.bohr.life

✅ AgentRegistry 已部署
   地址  : 0x1111111111111111111111111111111111111111
   合约  : https://scan.bohr.life/address/0x1111111111111111111111111111111111111111
   交易  : https://scan.bohr.life/tx/0xaaaaaaaa…

✅ TaskEscrow 已部署
   地址  : 0x2222222222222222222222222222222222222222
   合约  : https://scan.bohr.life/address/0x2222222222222222222222222222222222222222
   交易  : https://scan.bohr.life/tx/0xbbbbbbbb…

✅ 已授权 TaskEscrow 写入信誉
   交易  : https://scan.bohr.life/tx/0xcccccccc…

VITE_REGISTRY_ADDRESS=0x1111111111111111111111111111111111111111
VITE_ESCROW_ADDRESS=0x2222222222222222222222222222222222222222
📝 部署记录已写入 deployments/bohr.json
```

## 3. 测试网演示（产生多笔可核验交易）

```bash
npx hardhat run scripts/demo.js --network bohr
```
预期：依次打印「注册质押 → 建任务 → 接单 → 提交 → 验收放款+好评 → 拒收 → 争议 → 裁决退款+罚没」共 7+ 笔交易，每笔都有 `https://scan.bohr.life/tx/0x…` 链接。

> 说明：测试网只用一个部署钱包，脚本让同一地址依次扮演 发布者/Agent/仲裁人，仅为产出可核验的链上证据。

## 4. 前端构建与部署（Demo URL）

```bash
cd frontend
cp .env.example .env
```
把第 2 步打印的两行填进 `frontend/.env`：
```
VITE_DEFAULT_NETWORK=bohr
VITE_REGISTRY_ADDRESS=0x1111…
VITE_ESCROW_ADDRESS=0x2222…
```

构建（子目录托管，与姊妹项目 `/agent-trust/` 同模式）：
```bash
VITE_BASE_PATH=/agent-escrow/ npm run build
```
把 `frontend/dist/` 上传到静态托管，得到公开 URL，例如 `https://<站点>/agent-escrow/`。

本地调试：
```bash
npm run dev     # http://127.0.0.1:5210 ，钱包切到 Bohr 即可
```

---

## 5. 提交 Gas 申请

打开 https://forms.gle/7WJNKfcyJLQ4vujt7 ，按 README 表格填 6 栏。

---

## 6. 主网 BOT Chain (chainId 677) 部署

收到 1 BOT 后：
```bash
# 回到项目根目录，.env 不变
npx hardhat run scripts/deploy.js --network botchain
npx hardhat run scripts/demo.js  --network botchain
```
打印的链接为 `https://scan.botchain.ai/address|tx/0x…`。

把 `deployments/botchain.json` 里的新地址填入 `frontend/.env`，重设 `VITE_DEFAULT_NETWORK=botchain`，重新 `build` 并部署前端。

---

## 预期主网交易清单（核验用）

| # | 交易 | 方法 | 浏览器链接 |
|---|---|---|---|
| 1 | 部署 AgentRegistry | constructor(1 BOT 最低质押) | `scan.botchain.ai/tx/0x…` |
| 2 | 部署 TaskEscrow | constructor(registry) | 同上 |
| 3 | 授权 escrow 写信誉 | `registry.setEscrow(escrow)` | 同上 |
| 4 | Agent 注册+质押 | `register{value:1 BOT}` | 同上 |
| 5 | 建任务托管 | `createTask{value:0.5 BOT}` | 同上 |
| 6 | 接单 | `assign(taskId)` | 同上 |
| 7 | 提交交付物 | `submitDeliverable(hash,uri)` | 同上 |
| 8 | 验收结算放款 | `accept(taskId)` | 同上 |
| 9 | 拒收/争议 | `reject(taskId)` | 同上 |
| 10 | 仲裁退款+罚没 | `resolveRefund(taskId,0.2 BOT)` | 同上 |
