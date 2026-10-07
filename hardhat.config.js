require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * ──────────────────────────────────────────────────────────────────────────
 *  江城信约 AgentEscrow · 网络配置
 *
 *  测试网 Bohr（最高优先级，先在这里跑通并拿 Gas 申请链接）：
 *    chainId  = 968
 *    rpc      = https://rpc.bohr.life
 *    explorer = https://scan.bohr.life/
 *    faucet   = https://faucet.botchain.ai/zh/basic
 *    native   = BOT
 *
 *  主网 BOT Chain（拿到 1 BOT 资助后再部署）：
 *    chainId  = 677 (0x2A5)
 *    rpc      = https://rpc.botchain.ai
 *    explorer = https://scan.botchain.ai/
 *    native   = BOT
 *
 *  PRIVATE_KEY / RPC_URL 一律从 .env 读取；.env 已在 .gitignore，绝不提交。
 * ──────────────────────────────────────────────────────────────────────────
 */
const PRIVATE_KEY = process.env.PRIVATE_KEY || undefined;
const BOHT_RPC = process.env.BOHR_RPC_URL || "https://rpc.bohr.life";
const BOTCHAIN_RPC = process.env.RPC_URL || "https://rpc.botchain.ai";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },

    // 测试网 Bohr
    bohr: {
      url: BOHT_RPC,
      chainId: 968,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },

    // 主网 BOT Chain
    botchain: {
      url: BOTCHAIN_RPC,
      chainId: 677,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      // Blockscout 不强制需要真实 API key，占位即可
      botchain: process.env.BOTCHAIN_ETHERSCAN_API_KEY || "botchain-no-key-required",
    },
    customChains: [
      {
        network: "botchain",
        chainId: 677,
        urls: {
          // Blockscout（Etherscan 兼容 v1 风格，注意末尾的 ?）
          apiURL: "https://scan.botchain.ai/api?",
          browserURL: "https://scan.botchain.ai",
        },
      },
    ],
  },
};
