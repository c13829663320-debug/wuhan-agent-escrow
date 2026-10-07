const { expect } = require("chai");
const { ethers } = require("hardhat");

const MIN_STAKE = ethers.parseEther("10"); // 10 BOT
const BOUNTY = ethers.parseEther("2");

describe("江城信约 AgentEscrow", function () {
  let owner, publisher, agent, stranger;
  let registry, escrow;

  beforeEach(async function () {
    [owner, publisher, agent, stranger] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("AgentRegistry");
    registry = await Registry.deploy(MIN_STAKE);
    await registry.waitForDeployment();

    const Escrow = await ethers.getContractFactory("TaskEscrow");
    escrow = await Escrow.deploy(await registry.getAddress());
    await escrow.waitForDeployment();

    await registry.setEscrow(await escrow.getAddress());
  });

  describe("AgentRegistry — 注册 / 质押", function () {
    it("注册并质押 BOT，记录 active 与 stake", async function () {
      await expect(registry.connect(agent).register("ipfs://agent-1", { value: MIN_STAKE }))
        .to.emit(registry, "Registered")
        .withArgs(agent.address, MIN_STAKE, "ipfs://agent-1");

      const a = await registry.agents(agent.address);
      expect(a.active).to.be.true;
      expect(a.stake).to.equal(MIN_STAKE);
      expect(await registry.isActive(agent.address)).to.be.true;
      expect(await registry.agentCount()).to.equal(1);
    });

    it("质押不足最低门槛时回滚", async function () {
      await expect(
        registry.connect(agent).register("ipfs://x", { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(registry, "InsufficientStake");
    });

    it("重复 active 注册回滚", async function () {
      await registry.connect(agent).register("ipfs://a", { value: MIN_STAKE });
      await expect(
        registry.connect(agent).register("ipfs://b", { value: MIN_STAKE })
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    });
  });

  describe("TaskEscrow — 建任务 / 接单 / 提交 / accept 放款+好评", function () {
    beforeEach(async function () {
      await registry.connect(agent).register("ipfs://agent-1", { value: MIN_STAKE });
    });

    it("全流程：create → assign → submit → accept，放款并记好评", async function () {
      const balBefore = await ethers.provider.getBalance(agent.address);

      await expect(
        escrow.connect(publisher).createTask("ipfs://task-need", { value: BOUNTY })
      ).to.emit(escrow, "TaskCreated");

      await expect(escrow.connect(agent).assign(1)).to.emit(escrow, "TaskAssigned")
        .withArgs(1, agent.address);

      const hash = ethers.keccak256(ethers.toUtf8Bytes("deliverable-v1"));
      await expect(escrow.connect(agent).submitDeliverable(1, hash, "ipfs://deliv-1"))
        .to.emit(escrow, "DeliverableSubmitted");

      await expect(escrow.connect(publisher).accept(1))
        .to.emit(escrow, "TaskAccepted")
        .withArgs(1, agent.address, BOUNTY);

      // 好评 +1
      const after = await registry.agents(agent.address);
      expect(after.goodCount).to.equal(1);
      expect(after.badCount).to.equal(0);

      // Agent 收到赏金（扣除少量 gas 后净增约 BOUNTY）
      const balAfter = await ethers.provider.getBalance(agent.address);
      expect(balAfter - balBefore).to.be.closeTo(BOUNTY, ethers.parseEther("0.02"));

      const t = await escrow.tasks(1);
      expect(t.status).to.equal(3); // Accepted
    });

    it("未注册者不能接单", async function () {
      await escrow.connect(publisher).createTask("ipfs://t", { value: BOUNTY });
      await expect(escrow.connect(stranger).assign(1))
        .to.be.revertedWithCustomError(escrow, "NotAnAgent");
    });

    it("非提交人不能提交交付物", async function () {
      await escrow.connect(publisher).createTask("ipfs://t", { value: BOUNTY });
      await escrow.connect(agent).assign(1);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("x"));
      await expect(escrow.connect(stranger).submitDeliverable(1, hash, "ipfs://d"))
        .to.be.revertedWithCustomError(escrow, "NotAssignedAgent");
    });

    it("发布者在 Open 状态可取消并退款", async function () {
      const before = await ethers.provider.getBalance(publisher.address);
      await escrow.connect(publisher).createTask("ipfs://t", { value: BOUNTY });
      await expect(escrow.connect(publisher).cancelTask(1))
        .to.emit(escrow, "TaskCancelled");
      const after = await ethers.provider.getBalance(publisher.address);
      // 退款后余额接近取消前（扣除建任务/取消的 gas）
      expect(before - after).to.be.lt(ethers.parseEther("0.02"));
    });
  });

  describe("TaskEscrow — reject → 争议 → 退款 / 罚没", function () {
    beforeEach(async function () {
      await registry.connect(agent).register("ipfs://agent-1", { value: MIN_STAKE });
      await escrow.connect(publisher).createTask("ipfs://need", { value: BOUNTY });
      await escrow.connect(agent).assign(1);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("bad"));
      await escrow.connect(agent).submitDeliverable(1, hash, "ipfs://bad");
    });

    it("publish reject 进入 Disputed", async function () {
      await expect(escrow.connect(publisher).reject(1))
        .to.emit(escrow, "TaskRejected");
      const t = await escrow.tasks(1);
      expect(t.status).to.equal(4); // Disputed
    });

    it("仲裁 resolveRefund：退款发布者 + 差评 + slash Agent", async function () {
      await escrow.connect(publisher).reject(1);

      const slashAmt = ethers.parseEther("4");
      const stakeBefore = (await registry.agents(agent.address)).stake;

      await expect(escrow.connect(owner).resolveRefund(1, slashAmt))
        .to.emit(escrow, "ResolvedRefunded");

      // 差评 +1
      const a = await registry.agents(agent.address);
      expect(a.badCount).to.equal(1);
      // 质押被 slash 4 BOT
      expect(a.stake).to.equal(stakeBefore - slashAmt);
      expect(a.slashCount).to.equal(1);

      const t = await escrow.tasks(1);
      expect(t.status).to.equal(6); // ResolvedRefunded
    });

    it("仲裁 resolveRelease：放款 Agent 并记好评", async function () {
      await escrow.connect(publisher).reject(1);
      await expect(escrow.connect(owner).resolveRelease(1))
        .to.emit(escrow, "ResolvedReleased");
      const a = await registry.agents(agent.address);
      expect(a.goodCount).to.equal(1);
    });

    it("非仲裁人不能裁决", async function () {
      await escrow.connect(publisher).reject(1);
      await expect(escrow.connect(stranger).resolveRefund(1, 0))
        .to.be.revertedWithCustomError(escrow, "NotArbitrator");
    });
  });

  describe("治理 / 信誉分 / 注销", function () {
    beforeEach(async function () {
      await registry.connect(agent).register("ipfs://a", { value: MIN_STAKE });
    });

    it("owner 可 slash 罚没质押，款项进入国库", async function () {
      const treasuryBefore = await ethers.provider.getBalance(owner.address);
      await expect(registry.connect(owner).slash(agent.address, ethers.parseEther("5")))
        .to.emit(registry, "Slashed");
      const a = await registry.agents(agent.address);
      expect(a.stake).to.equal(ethers.parseEther("5"));
      const treasuryAfter = await ethers.provider.getBalance(owner.address);
      // owner 自己支付 slash 交易的 gas，因此净增略小于 5 BOT
      expect(treasuryAfter - treasuryBefore).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.02"));
    });

    it("信誉良好时 deregister 提回质押", async function () {
      const balBefore = await ethers.provider.getBalance(agent.address);
      await expect(registry.connect(agent).deregister())
        .to.emit(registry, "Deregistered");
      const a = await registry.agents(agent.address);
      expect(a.active).to.be.false;
      expect(a.stake).to.equal(0);
      const balAfter = await ethers.provider.getBalance(agent.address);
      expect(balAfter - balBefore).to.be.closeTo(MIN_STAKE, ethers.parseEther("0.02"));
    });

    it("score 随好评上升、差评下降", async function () {
      const s0 = await registry.score(agent.address);
      // 模拟 escrow 记一笔好评
      await registry.setEscrow(await escrow.getAddress());
      await escrow.connect(publisher).createTask("ipfs://n", { value: BOUNTY });
      await escrow.connect(agent).assign(1);
      const h = ethers.keccak256(ethers.toUtf8Bytes("ok"));
      await escrow.connect(agent).submitDeliverable(1, h, "ipfs://ok");
      await escrow.connect(publisher).accept(1);
      const s1 = await registry.score(agent.address);
      expect(s1).to.be.greaterThan(s0);
    });
  });
});
