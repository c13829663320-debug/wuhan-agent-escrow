const hre = require("hardhat");
async function main() {
  const [s] = await hre.ethers.getSigners();
  const net = await hre.ethers.provider.getNetwork();
  const bal = await hre.ethers.provider.getBalance(s.address);
  const fee = await hre.ethers.provider.getFeeData();
  console.log("network   :", net.name, "chainId", net.chainId.toString());
  console.log("deployer  :", s.address);
  console.log("balance   :", hre.ethers.formatEther(bal), "BOT");
  console.log("gasPrice  :", fee.gasPrice ? hre.ethers.formatUnits(fee.gasPrice, "gwei") : "n/a", "gwei");
}
main().catch((e) => { console.error("ERROR:", e && e.message ? e.message : e); process.exit(1); });
