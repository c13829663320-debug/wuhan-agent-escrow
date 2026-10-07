// SPDX-License-Identifier: MIT
// 一键部署：AgentRegistry + TaskEscrow，并打印可粘贴进 Gas 申请表的浏览器链接。
//
//   测试网: npx hardhat run scripts/deploy.js --network bohr
//   主网:   npx hardhat run scripts/deploy.js --network botchain
//
// 部署完成后会把地址写进 frontend/.env 片段，方便前端填入。
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const EXPLORER = {
  bohr: "https://scan.bohr.life",
  botchain: "https://scan.botchain.ai",
  localhost: "http://127.0.0.1:8545",
};

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const net = hre.network.name;
  const explorer = (EXPLORER[net] || "https://scan.botchain.ai").replace(/\/$/, "");
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  江城信约 AgentEscrow · 部署");
  console.log("═══════════════════════════════════════════════════════");
  console.log(" 网络       :", net, "(chainId", chainId.toString() + ")");
  console.log(" 部署者     :", deployer.address);
  console.log(" 浏览器     :", explorer);
  console.log("");

  // 1) 部署 AgentRegistry，最低质押 1 BOT
  const MIN_STAKE = hre.ethers.parseEther("1");
  const Registry = await hre.ethers.getContractFactory("AgentRegistry");
  const registry = await Registry.deploy(MIN_STAKE);
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();
  const registryTx = registry.deploymentTransaction();

  console.log("✅ AgentRegistry 已部署");
  console.log("   地址  :", registryAddr);
  console.log("   合约  :", explorer + "/address/" + registryAddr);
  console.log("   交易  :", explorer + "/tx/" + registryTx.hash);
  console.log("");

  // 2) 部署 TaskEscrow
  const Escrow = await hre.ethers.getContractFactory("TaskEscrow");
  const escrow = await Escrow.deploy(registryAddr);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  const escrowTx = escrow.deploymentTransaction();

  console.log("✅ TaskEscrow 已部署");
  console.log("   地址  :", escrowAddr);
  console.log("   合约  :", explorer + "/address/" + escrowAddr);
  console.log("   交易  :", explorer + "/tx/" + escrowTx.hash);
  console.log("");

  // 3) 把 escrow 授权为 Registry 的信誉写入方
  const setTx = await registry.setEscrow(escrowAddr);
  await setTx.wait();
  console.log("✅ 已授权 TaskEscrow 写入信誉");
  console.log("   交易  :", explorer + "/tx/" + setTx.hash);
  console.log("");

  console.log("───────────────────────────────────────────────────────");
  console.log("  前端请把以下两行填入 frontend/.env（或 Vercel/构建环境）：");
  console.log("───────────────────────────────────────────────────────");
  console.log(`VITE_REGISTRY_ADDRESS=${registryAddr}`);
  console.log(`VITE_ESCROW_ADDRESS=${escrowAddr}`);
  console.log("");

  // 落盘部署记录，供 demo 脚本与前端读取
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const record = {
    network: net,
    chainId: Number(chainId),
    explorer,
    registry: registryAddr,
    escrow: escrowAddr,
    minStake: MIN_STAKE.toString(),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };
  fs.writeFileSync(path.join(dir, `${net}.json`), JSON.stringify(record, null, 2));
  console.log("📝 部署记录已写入 deployments/" + net + ".json");
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
