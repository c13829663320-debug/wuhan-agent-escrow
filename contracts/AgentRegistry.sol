// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentRegistry
 * @notice 江城信约 · AI Agent 链上注册与信誉账本。
 *
 * 每个 Agent 用原生 BOT 代币质押注册；系统累计好评 / 差评，并据此计算一个
 * 0..100 的综合信誉分。欺诈或差评超阈值时，治理方可 slash（罚没）质押，
 * 从而抬高女巫（sybil）注册成本。信誉良好时 Agent 可注销并提回质押。
 *
 * 设计要点：
 *  - 只有被授权的 TaskEscrow 可以写入好/差评（{setEscrow}）。
 *  - slash 由 owner（治理/仲裁人）执行，罚没的 BOT 进入国库。
 *  - 所有外部转账都用 checks-effects-interactions + ReentrancyGuard。
 */
contract AgentRegistry is Ownable2Step, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 类型
    //////////////////////////////////////////////////////////////*/

    struct Agent {
        address wallet;      // Agent 钱包地址（也是 key）
        string metadataURI;  // 指向简介/能力声明的 URI（IPFS 或 HTTPS）
        uint96 goodCount;    // 好评数
        uint96 badCount;     // 差评数
        uint96 slashCount;   // 被 slash 次数
        uint256 stake;       // 当前质押的 BOT（wei）
        uint64 registeredAt; // 注册时间戳
        bool active;         // 是否处于在册状态
    }

    /*//////////////////////////////////////////////////////////////
                                 状态
    //////////////////////////////////////////////////////////////*/

    /// Agent 注册时必须质押的最小 BOT 数量（抗女巫门槛）。
    uint256 public immutable MIN_STAKE;

    /// 差评数达到该阈值后，owner 必须 slash 且 Agent 不可正常提现。
    uint96 public constant BAD_THRESHOLD = 3;

    /// 被授权写入信誉的合约（TaskEscrow）。
    address public escrow;

    /// 全部在册 Agent 列表（用于前端浏览）。
    address[] public agentList;
    mapping(address => uint256) private _indexOf; // 1-based，0 表示未登记

    mapping(address => Agent) public agents;

    /*//////////////////////////////////////////////////////////////
                                 事件
    //////////////////////////////////////////////////////////////*/

    event Registered(address indexed agent, uint256 stake, string metadataURI);
    event Deregistered(address indexed agent, uint256 refunded);
    event Reputation(address indexed agent, bool good, uint96 goodCount, uint96 badCount);
    event Slashed(address indexed agent, uint256 amount, uint96 newSlashCount);
    event EscrowSet(address indexed escrow);
    event StakeWithdrawn(address indexed agent, uint256 amount);

    /*//////////////////////////////////////////////////////////////
                                 错误
    //////////////////////////////////////////////////////////////*/

    error AlreadyRegistered();
    error NotRegistered();
    error NotActive();
    error InsufficientStake();
    error NotEscrow();
    error BadReputation();
    error NoStake();
    error SlashExceedsStake();
    error NotOwner();
    error NotAuthorized();

    /*//////////////////////////////////////////////////////////////
                               修饰符
    //////////////////////////////////////////////////////////////*/

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotEscrow();
        _;
    }

    /// slash 可由 owner（链上治理）或被授权的 escrow（仲裁退款路径）触发。
    modifier onlySlashAuthorized() {
        if (msg.sender != owner() && msg.sender != escrow) revert NotAuthorized();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                               构造
    //////////////////////////////////////////////////////////////*/

    constructor(uint256 minStake_) Ownable(msg.sender) {
        MIN_STAKE = minStake_;
    }

    /*//////////////////////////////////////////////////////////////
                               注册 / 注销
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice 用 BOT 质押注册一个 Agent。
     * @param metadataURI Agent 简介 / 能力声明 URI。
     */
    function register(string calldata metadataURI) external payable {
        if (_indexOf[msg.sender] != 0 && agents[msg.sender].active) revert AlreadyRegistered();
        if (msg.value < MIN_STAKE) revert InsufficientStake();

        bool wasInactive = agents[msg.sender].active;

        agents[msg.sender] = Agent({
            wallet: msg.sender,
            metadataURI: metadataURI,
            goodCount: 0,
            badCount: 0,
            slashCount: 0,
            stake: msg.value,
            registeredAt: uint64(block.timestamp),
            active: true
        });

        // 首次注册才进入目录；被注销后重新注册复用原条目。
        if (!wasInactive) {
            agentList.push(msg.sender);
            _indexOf[msg.sender] = agentList.length;
        }

        emit Registered(msg.sender, msg.value, metadataURI);
    }

    /**
     * @notice 信誉良好时注销 Agent 并提回全部质押。
     * @dev 差评超阈值的 Agent 不得正常提现（其质押只能被治理 slash）。
     */
    function deregister() external nonReentrant {
        Agent storage a = agents[msg.sender];
        if (!a.active) revert NotActive();
        if (a.badCount >= BAD_THRESHOLD) revert BadReputation();

        uint256 amount = a.stake;
        if (amount == 0) revert NoStake();

        // effects
        a.active = false;
        a.stake = 0;

        // interactions
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert();

        emit Deregistered(msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                          信誉写入（仅 TaskEscrow）
    //////////////////////////////////////////////////////////////*/

    /**
     * @dev 由 TaskEscrow 在任务验收/裁决后调用：记一笔好评或差评。
     */
    function recordReputation(address agent, bool good) external onlyEscrow {
        Agent storage a = agents[agent];
        if (!a.active) revert NotActive();
        if (good) {
            a.goodCount += 1;
        } else {
            a.badCount += 1;
        }
        emit Reputation(agent, good, a.goodCount, a.badCount);
    }

    /*//////////////////////////////////////////////////////////////
                            治理：罚没（抗女巫）
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice 证实欺诈或差评达阈值时，罚没 Agent 的部分/全部质押。
     * @param agent 被处罚的 Agent。
     * @param amount 罚没金额（wei），进入 owner 国库。
     */
    function slash(address agent, uint256 amount) external onlySlashAuthorized nonReentrant {
        Agent storage a = agents[agent];
        if (!a.active) revert NotActive();
        if (amount > a.stake) revert SlashExceedsStake();

        // effects
        a.stake -= amount;
        a.slashCount += 1;

        // interactions：罚没款汇入 owner 国库
        (bool ok,) = owner().call{value: amount}("");
        if (!ok) revert();

        emit Slashed(agent, amount, a.slashCount);
    }

    /*//////////////////////////////////////////////////////////////
                              授权 Escrow
    //////////////////////////////////////////////////////////////*/

    function setEscrow(address escrow_) external onlyOwner {
        escrow = escrow_;
        emit EscrowSet(escrow_);
    }

    /*//////////////////////////////////////////////////////////////
                                查询
    //////////////////////////////////////////////////////////////*/

    /// Agent 是否在册且活跃。
    function isActive(address agent) external view returns (bool) {
        return agents[agent].active;
    }

    /// 全部在册 Agent 数量。
    function agentCount() external view returns (uint256) {
        return agentList.length;
    }

    /**
     * @notice 综合信誉分：0..100。
     * @dev 由质押量、好/差评净胜、注册时长综合而成。
     *  - 质押基础分：质押量相对 MIN_STAKE 的对数缩放，封顶 40 分。
     *  - 评价分：好评 +3，差评 -5，封顶 ±30。
     *  - 资历分：注册每满 90 天 +5，封顶 30。
     * 结果裁剪到 [0,100]。
     */
    function score(address agent) external view returns (uint256) {
        Agent storage a = agents[agent];
        if (!a.active) return 0;

        // 质押分（对数缩放避免鲸鱼碾压）：log10(stake/MIN_STAKE + 1) 映射到 0..40
        uint256 stakeScore = 0;
        if (MIN_STAKE > 0 && a.stake > 0) {
            uint256 ratio = (a.stake * 1e18) / MIN_STAKE;
            // 用近似 log10：从高位估算，足够 MVP 使用
            uint256 logVal = _log10(ratio); // ratio 单位是 1e18，log10 ≈ 18 + 倍数对数
            // stake/MIN 的倍数 = ratio / 1e18；其 log10 ≈ logVal - 18
            uint256 mult = logVal > 18 ? logVal - 18 : 0;
            stakeScore = _min40(mult);
        }

        // 评价分
        int256 rep = int256(uint256(a.goodCount)) * 3 - int256(uint256(a.badCount)) * 5;
        int256 repScore;
        if (rep > 30) repScore = 30;
        else if (rep < -30) repScore = -30;
        else repScore = rep;

        // 资历分：每 90 天 +5，封顶 30
        uint256 ageDays = (block.timestamp - a.registeredAt) / 1 days;
        uint256 tenureScore = _min30((ageDays / 90) * 5);

        int256 total = int256(stakeScore) + repScore + int256(tenureScore);
        if (total < 0) return 0;
        if (total > 100) return 100;
        return uint256(total);
    }

    /*//////////////////////////////////////////////////////////////
                              内部工具
    //////////////////////////////////////////////////////////////*/

    function _min40(uint256 v) private pure returns (uint256) {        return v > 40 ? 40 : v;
    }

    function _min30(uint256 v) private pure returns (uint256) {
        return v > 30 ? 30 : v;
    }

    /// 整数近似 log10（向下取整），x >= 1。
    function _log10(uint256 x) private pure returns (uint256) {
        uint256 r = 0;
        while (x >= 10) {
            x /= 10;
            r++;
        }
        return r;
    }
}
