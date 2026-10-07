// SPDX-License-Identifier: MIT
// 测试网一键演示：注册质押 → 发任务 → 接单 → 提交 → 验收放款+好评；
// 再跑一条 拒收→争议→退款+罚没 分支。每笔交易都打印 scan 链接。
//
//   npx hardhat run scripts/demo.js --network bohr
//   npx hardhat run scripts/demo.js --network botchain
//   npx hardhat run scripts/demo.js --network localhost   （需先 npm run node + npm run deploy:local）
//
// 注意：真实测试网只有一个部署者钱包，脚本用同一地址依次扮演
// 发布者 / Agent / 仲裁人(owner)，仅用于产出可核验的链上交易证据。
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const EXPLORER = {
  bohr: "https://scan.bohr.life",
  botchain: "https://scan.botchain.ai",
  localhost: "",
};

function loadDeploy(net) {
  const p = path.join(__dirname, "..", "deployments", `${net}.json`);
  if (!fs.existsSync(p)) {
    throw new Error("未找到 deployments/" + net + ".json，请先运行部署脚本。");
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function logStep(title) {
  console.log("");
  console.log("── " + title + " ──");
}

async function main() {
  const net = hre.network.name;
  const dep = loadDeploy(net);
  const explorer = (EXPLORER[net] || dep.explorer || "").replace(/\/$/, "");
  const link = (h) => (explorer ? explorer + "/tx/" + h : h);

  const [wallet] = await hre.ethers.getSigners();
  const me = wallet.address;
  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  江城信约 · 测试网演示 (" + net + ")");
  console.log("  钱包(发布者/Agent/仲裁人) =", me);
  console.log("═══════════════════════════════════════════════════════");

  const registry = await hre.ethers.getContractAt("AgentRegistry", dep.registry, wallet);
  const escrow = await hre.ethers.getContractAt("TaskEscrow", dep.escrow, wallet);

  // 0) 注册 + 质押（若已在册则跳过）
  await logStep("1) 注册 Agent + 质押 1 BOT");
  const already = await registry.isActive(me);
  if (!already) {
    const tx1 = await registry.register("ipfs://wuhan-agent-escrow/agent/demo", {
      value: hre.ethers.parseEther("1"),
    });
    await tx1.wait();
    console.log("   tx:", link(tx1.hash));
  } else {
    console.log("   已在册，跳过注册。");
  }
  const a0 = await registry.agents(me);
  console.log("   质押:", hre.ethers.formatEther(a0.stake), "BOT | 好评:", a0.goodCount, "差评:", a0.badCount, "| 信誉分:", (await registry.score(me)).toString());

  // 1) 发任务托管 0.5 BOT
  await logStep("2) 创建赏金任务（托管 0.5 BOT）");
  const tx2 = await escrow.createTask("ipfs://wuhan-agent-escrow/task/1", {
    value: hre.ethers.parseEther("0.5"),
  });
  await tx2.wait();
  console.log("   tx:", link(tx2.hash));
  const taskId = (await escrow.taskCount()).toString();
  console.log("   任务 id:", taskId);

  // 2) 接单
  await logStep("3) Agent 接单");
  const tx3 = await escrow.assign(taskId);
  await tx3.wait();
  console.log("   tx:", link(tx3.hash));

  // 3) 提交交付物 hash
  await logStep("4) 提交交付物（hash + URI）");
  const hash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("deliverable-" + Date.now()));
  const tx4 = await escrow.submitDeliverable(taskId, hash, "ipfs://wuhan-agent-escrow/deliv/1");
  await tx4.wait();
  console.log("   tx:", link(tx4.hash));

  // 4) 验收 → 放款 + 好评
  await logStep("5) 发布者验收 accept → 放款 0.5 BOT + 记好评");
  const tx5 = await escrow.accept(taskId);
  await tx5.wait();
  console.log("   tx:", link(tx5.hash));
  const a1 = await registry.agents(me);
  console.log("   现在 好评:", a1.goodCount, "| 信誉分:", (await registry.score(me)).toString());

  // 5) 第二条任务走 拒收 → 争议 → 退款 + 罚没
  await logStep("6) 第二条任务：建任务 → 接单 → 提交 → 拒收");
  const txb = await escrow.createTask("ipfs://wuhan-agent-escrow/task/2", {
    value: hre.ethers.parseEther("0.3"),
  });
  await txb.wait();
  const taskId2 = (await escrow.taskCount()).toString();
  console.log("   create tx:", link(txb.hash), "| id:", taskId2);
  await (await escrow.assign(taskId2)).wait();
  const hash2 = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("bad-" + Date.now()));
  await (await escrow.submitDeliverable(taskId2, hash2, "ipfs://wuhan-agent-escrow/deliv/2")).wait();
  const txr = await escrow.reject(taskId2);
  await txr.wait();
  console.log("   reject tx:", link(txr.hash), "→ 进入争议");

  await logStep("7) 仲裁人裁决：退款发布者 + 差评 + 罚没 0.2 BOT 质押");
  const txz = await escrow.resolveRefund(taskId2, hre.ethers.parseEther("0.2"));
  await txz.wait();
  console.log("   tx:", link(txz.hash));
  const a2 = await registry.agents(me);
  console.log("   现在 差评:", a2.badCount, "质押:", hre.ethers.formatEther(a2.stake), "BOT | 罚没次数:", a2.slashCount);

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✅ 演示完成。以上每笔 tx 都可在浏览器核验：");
  console.log("   ", explorer);
  console.log("═══════════════════════════════════════════════════════");
  console.log("  合约:");
  console.log("   Registry :", explorer + "/address/" + dep.registry);
  console.log("   Escrow    :", explorer + "/address/" + dep.escrow);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
