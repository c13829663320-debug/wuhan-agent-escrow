// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/**
 * @title TaskEscrow
 * @notice 江城信约 · 赏金任务托管。
 *
 * 发布者存入 BOT 赏金 → 注册 Agent 接单 → 提交交付物(hash/URI) →
 * 发布者 accept 放款并记好评 / reject 进入争议 → 仲裁人裁决（退款或罚没 Agent）。
 *
 * 状态机：
 *   Open ──assign──▶ Assigned ──submit──▶ Submitted
 *    ▲                  │                     │
 *    │              (无人接单)              accept──▶ Accepted (放款+好评)
 * cancel               │                     │
 *    └───────(Open 时)┘                     reject──▶ Disputed
 *                                                │
 *                                resolveRelease──▶ 放款 Agent + 好评
 *                                resolveRefund ──▶ 退款发布者 (+可选 slash Agent + 差评)
 *
 * 所有状态变更都发 event。所有外部转账遵守 checks-effects-interactions + 重入保护。
 */
contract TaskEscrow is Ownable2Step, ReentrancyGuard {
    /*//////////////////////////////////////////////////////////////
                                 类型
    //////////////////////////////////////////////////////////////*/

    enum Status {
        Open,         // 0 待接单
        Assigned,     // 1 已指派 Agent，待提交
        Submitted,    // 2 Agent 已交付，待验收
        Accepted,     // 3 已验收放款（终态）
        Disputed,     // 4 发布者拒收，进入争议
        ResolvedReleased, // 5 仲裁裁决：放款给 Agent（终态）
        ResolvedRefunded, // 6 仲裁裁决：退款给发布者（终态）
        Cancelled     // 7 发布者取消（仅 Open 状态，退款）（终态）
    }

    struct Task {
        uint256 id;
        address publisher;
        uint256 bounty;          // 托管赏金（wei）
        string metadataURI;       // 需求描述 URI
        address agent;            // 接单 Agent
        bytes32 deliverableHash;  // 交付物内容哈希
        string deliverableURI;    // 交付物 URI
        Status status;
        uint64 createdAt;
    }

    /*//////////////////////////////////////////////////////////////
                                 状态
    //////////////////////////////////////////////////////////////*/

    AgentRegistry public immutable registry;

    /// 仲裁人：处理 reject 后的争议（MVP 由 owner 担任，可单独设置）。
    address public arbitrator;

    uint256 public nextTaskId = 1;

    mapping(uint256 => Task) public tasks;
    uint256[] private _openTaskIds; // 开放任务索引（MVP：不做严格删除，查询时过滤）

    /*//////////////////////////////////////////////////////////////
                                 事件
    //////////////////////////////////////////////////////////////*/

    event TaskCreated(uint256 indexed id, address indexed publisher, uint256 bounty, string metadataURI);
    event TaskAssigned(uint256 indexed id, address indexed agent);
    event DeliverableSubmitted(uint256 indexed id, bytes32 deliverableHash, string deliverableURI);
    event TaskAccepted(uint256 indexed id, address indexed agent, uint256 paid);
    event TaskRejected(uint256 indexed id, address indexed publisher);
    event ResolvedReleased(uint256 indexed id, address indexed agent, uint256 paid);
    event ResolvedRefunded(uint256 indexed id, address indexed publisher, uint256 refunded, bool slashedAgent);
    event TaskCancelled(uint256 indexed id, address indexed publisher, uint256 refunded);
    event ArbitratorSet(address indexed arbitrator);

    /*//////////////////////////////////////////////////////////////
                                 错误
    //////////////////////////////////////////////////////////////*/

    error NotPublisher();
    error NotAssignedAgent();
    error InvalidStatus(Status current);
    error NoBounty();
    error NotAnAgent();
    error NotArbitrator();
    error NothingToResolve();

    /*//////////////////////////////////////////////////////////////
                               修饰符
    //////////////////////////////////////////////////////////////*/

    modifier onlyPublisher(uint256 id) {
        if (msg.sender != tasks[id].publisher) revert NotPublisher();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                               构造
    //////////////////////////////////////////////////////////////*/

    constructor(address registry_) Ownable(msg.sender) {
        registry = AgentRegistry(registry_);
        arbitrator = msg.sender;
    }

    /*//////////////////////////////////////////////////////////////
                               发任务
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice 创建一个赏金任务并托管 BOT。
     * @param metadataURI 任务需求描述 URI。
     */
    function createTask(string calldata metadataURI) external payable returns (uint256 id) {
        if (msg.value == 0) revert NoBounty();

        id = nextTaskId++;
        tasks[id] = Task({
            id: id,
            publisher: msg.sender,
            bounty: msg.value,
            metadataURI: metadataURI,
            agent: address(0),
            deliverableHash: bytes32(0),
            deliverableURI: "",
            status: Status.Open,
            createdAt: uint64(block.timestamp)
        });
        _openTaskIds.push(id);

        emit TaskCreated(id, msg.sender, msg.value, metadataURI);
    }

    /// 发布者在尚未被接单时取消任务并退款。
    function cancelTask(uint256 id) external nonReentrant onlyPublisher(id) {
        Task storage t = tasks[id];
        if (t.status != Status.Open) revert InvalidStatus(t.status);

        uint256 amount = t.bounty;
        t.status = Status.Cancelled;
        t.bounty = 0;

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert();

        emit TaskCancelled(id, msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                               接单
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice 已注册 Agent 接单。
     */
    function assign(uint256 id) external {
        Task storage t = tasks[id];
        if (t.status != Status.Open) revert InvalidStatus(t.status);

        if (!registry.isActive(msg.sender)) revert NotAnAgent();
        t.agent = msg.sender;
        t.status = Status.Assigned;

        emit TaskAssigned(id, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                              提交交付物
    //////////////////////////////////////////////////////////////*/

    function submitDeliverable(uint256 id, bytes32 deliverableHash, string calldata deliverableURI) external {
        Task storage t = tasks[id];
        if (t.status != Status.Assigned) revert InvalidStatus(t.status);
        if (msg.sender != t.agent) revert NotAssignedAgent();

        t.deliverableHash = deliverableHash;
        t.deliverableURI = deliverableURI;
        t.status = Status.Submitted;

        emit DeliverableSubmitted(id, deliverableHash, deliverableURI);
    }

    /*//////////////////////////////////////////////////////////////
                               验收 / 拒收
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice 发布者验收：放款给 Agent，并在 Registry 记一笔好评。
     */
    function accept(uint256 id) external nonReentrant onlyPublisher(id) {
        Task storage t = tasks[id];
        if (t.status != Status.Submitted) revert InvalidStatus(t.status);

        uint256 amount = t.bounty;
        address agent = t.agent;

        // effects（先记账，后转账）
        t.status = Status.Accepted;
        t.bounty = 0;
        registry.recordReputation(agent, true);

        // interaction
        (bool ok,) = agent.call{value: amount}("");
        if (!ok) revert();

        emit TaskAccepted(id, agent, amount);
    }

    /**
     * @notice 发布者拒收：进入争议，等待仲裁人裁决。
     */
    function reject(uint256 id) external onlyPublisher(id) {
        Task storage t = tasks[id];
        if (t.status != Status.Submitted) revert InvalidStatus(t.status);

        t.status = Status.Disputed;
        emit TaskRejected(id, msg.sender);
    }

    /*//////////////////////////////////////////////////////////////
                            仲裁人裁决（MVP 治理路径）
    //////////////////////////////////////////////////////////////*/

    function setArbitrator(address arbitrator_) external onlyOwner {
        arbitrator = arbitrator_;
        emit ArbitratorSet(arbitrator_);
    }

    /**
     * @notice 仲裁裁决：交付合格 → 放款给 Agent 并记好评。
     */
    function resolveRelease(uint256 id) external nonReentrant {
        if (msg.sender != arbitrator) revert NotArbitrator();
        Task storage t = tasks[id];
        if (t.status != Status.Disputed) revert NothingToResolve();

        uint256 amount = t.bounty;
        address agent = t.agent;

        t.status = Status.ResolvedReleased;
        t.bounty = 0;
        registry.recordReputation(agent, true);

        (bool ok,) = agent.call{value: amount}("");
        if (!ok) revert();

        emit ResolvedReleased(id, agent, amount);
    }

    /**
     * @notice 仲裁裁决：交付不合格 → 退款给发布者；可同时 slash Agent 并记差评。
     * @param id 任务 id。
     * @param slashAmount 罚没 Agent 质押金额（0 = 不罚没，仅差评）。
     */
    function resolveRefund(uint256 id, uint256 slashAmount) external nonReentrant {
        if (msg.sender != arbitrator) revert NotArbitrator();
        Task storage t = tasks[id];
        if (t.status != Status.Disputed) revert NothingToResolve();

        uint256 amount = t.bounty;
        address publisher = t.publisher;
        address agent = t.agent;

        t.status = Status.ResolvedRefunded;
        t.bounty = 0;
        registry.recordReputation(agent, false);

        bool slashed = false;
        if (slashAmount > 0) {
            registry.slash(agent, slashAmount);
            slashed = true;
        }

        (bool ok,) = publisher.call{value: amount}("");
        if (!ok) revert();

        emit ResolvedRefunded(id, publisher, amount, slashed);
    }

    /*//////////////////////////////////////////////////////////////
                                查询
    //////////////////////////////////////////////////////////////*/

    /// 开放（Open）任务 id 列表。
    function openTaskIds() external view returns (uint256[] memory list) {
        uint256 n = _openTaskIds.length;
        uint256 count;
        for (uint256 i = 0; i < n; i++) {
            if (tasks[_openTaskIds[i]].status == Status.Open) count++;
        }
        list = new uint256[](count);
        uint256 j;
        for (uint256 i = 0; i < n; i++) {
            uint256 id = _openTaskIds[i];
            if (tasks[id].status == Status.Open) list[j++] = id;
        }
    }

    function taskCount() external view returns (uint256) {
        return nextTaskId - 1;
    }

    receive() external payable {}
}
