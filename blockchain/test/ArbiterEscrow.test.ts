import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

async function deployEscrowFixture() {
  const [buyer, seller, oracle, maliciousActor, newOracle] = await ethers.getSigners();
  const usdc = await ethers.deployContract("MockUSDC");
  const feeToken = await ethers.deployContract("MockFeeToken");
  const escrow = await ethers.deployContract("ArbiterEscrow", [oracle.address]);

  // Mint 100 USDC to buyer for tests
  await usdc.mint(buyer.address, ethers.parseUnits("100", 6));
  await usdc.connect(buyer).approve(await escrow.getAddress(), ethers.MaxUint256);

  // Mint 100 FeeToken to buyer
  await feeToken.mint(buyer.address, ethers.parseUnits("100", 18));
  await feeToken.connect(buyer).approve(await escrow.getAddress(), ethers.MaxUint256);

  return { usdc, feeToken, escrow, buyer, seller, oracle, maliciousActor, newOracle };
}

describe("ArbiterEscrow - 100% Coverage & FOT Tokens", function () {

  describe("Deployment", function () {
    it("Should reject deployment with zero address oracle", async function () {
      const ArbiterEscrow = await ethers.getContractFactory("ArbiterEscrow");
      await expect(ArbiterEscrow.deploy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(ArbiterEscrow, "InvalidAddress");
    });

    it("Should set the right AI Judge Oracle", async function () {
      const { escrow, oracle } = await networkHelpers.loadFixture(deployEscrowFixture);
      expect(await escrow.aiJudgeOracle()).to.equal(oracle.address);
    });

    it("MockUSDC should have 6 decimals", async function () {
      const { usdc } = await networkHelpers.loadFixture(deployEscrowFixture);
      expect(await usdc.decimals()).to.equal(6n);
    });
  });

  describe("Input Validation", function () {
    it("Should reject zero dealId", async function () {
      const { usdc, escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      const amount = ethers.parseUnits("5", 6);
      
      await expect(escrow.connect(buyer).createAndFundEscrow(
        ethers.ZeroHash, seller.address, await usdc.getAddress(), amount, "hash", 3600
      )).to.be.revertedWithCustomError(escrow, "InvalidDealId");
    });

    it("Should reject zero seller", async function () {
      const { usdc, escrow, buyer } = await networkHelpers.loadFixture(deployEscrowFixture);
      const amount = ethers.parseUnits("5", 6);
      
      await expect(escrow.connect(buyer).createAndFundEscrow(
        ethers.id("deal"), ethers.ZeroAddress, await usdc.getAddress(), amount, "hash", 3600
      )).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });

    it("Should reject zero token", async function () {
      const { escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      
      await expect(escrow.connect(buyer).createAndFundEscrow(
        ethers.id("deal"), seller.address, ethers.ZeroAddress, 500, "hash", 3600
      )).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });

    it("Should reject zero amount", async function () {
      const { usdc, escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      
      await expect(escrow.connect(buyer).createAndFundEscrow(
        ethers.id("deal"), seller.address, await usdc.getAddress(), 0, "hash", 3600
      )).to.be.revertedWithCustomError(escrow, "InvalidAmount");
    });

    it("Should reject zero duration", async function () {
      const { usdc, escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      const amount = ethers.parseUnits("5", 6);
      
      await expect(escrow.connect(buyer).createAndFundEscrow(
        ethers.id("deal"), seller.address, await usdc.getAddress(), amount, "hash", 0
      )).to.be.revertedWithCustomError(escrow, "InvalidDuration");
    });

    it("Should reject duplicate dealId", async function () {
      const { usdc, escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      const amount = ethers.parseUnits("5", 6);
      const dealId = ethers.id("deal-dup");

      await escrow.connect(buyer).createAndFundEscrow(dealId, seller.address, await usdc.getAddress(), amount, "hash", 3600);
      
      await expect(escrow.connect(buyer).createAndFundEscrow(
        dealId, seller.address, await usdc.getAddress(), amount, "hash", 3600
      )).to.be.revertedWithCustomError(escrow, "DealAlreadyExists");
    });
  });

  describe("Fee-On-Transfer Token Support", function () {
    it("Should accurately record actual amount received after a 10% fee", async function () {
      const { feeToken, escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      const dealId = ethers.id("fot-test");
      
      const requestedAmount = ethers.parseUnits("100", 18);
      
      await escrow.connect(buyer).createAndFundEscrow(
        dealId, seller.address, await feeToken.getAddress(), requestedAmount, "criteria", 3600
      );

      const deal = await escrow.escrows(dealId);
      expect(deal.amount).to.equal(ethers.parseUnits("90", 18));
      expect(await feeToken.balanceOf(await escrow.getAddress())).to.equal(ethers.parseUnits("90", 18));
    });
  });

  describe("Authorization & Modifiers", function () {
    it("Should prevent non-seller from submitting", async function () {
      const { usdc, escrow, buyer, seller, maliciousActor } = await networkHelpers.loadFixture(deployEscrowFixture);
      const dealId = ethers.id("deal-auth-1");
      const amount = ethers.parseUnits("5", 6);
      
      await escrow.connect(buyer).createAndFundEscrow(dealId, seller.address, await usdc.getAddress(), amount, "hash", 3600);

      await expect(escrow.connect(maliciousActor).submitDeliverable(dealId, "hash"))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");
    });

    it("Should prevent non-buyer from claiming refund", async function () {
      const { usdc, escrow, buyer, seller, maliciousActor } = await networkHelpers.loadFixture(deployEscrowFixture);
      const dealId = ethers.id("deal-auth-2");
      const amount = ethers.parseUnits("5", 6);
      
      await escrow.connect(buyer).createAndFundEscrow(dealId, seller.address, await usdc.getAddress(), amount, "hash", 3600);
      await networkHelpers.time.increase(7200);

      await expect(escrow.connect(maliciousActor).claimExpiredRefund(dealId))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");
    });
    
    it("Should prevent unauthorized oracle rotation", async function () {
      const { escrow, maliciousActor, newOracle } = await networkHelpers.loadFixture(deployEscrowFixture);
      await expect(escrow.connect(maliciousActor).updateOracle(newOracle.address))
        .to.be.revertedWithCustomError(escrow, "Unauthorized");
    });
  });

  describe("Oracle Timeout Path & Exact Boundaries", function () {
    it("Exactly at deadline: Seller refund fails", async function () {
      const { usdc, escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      const dealId = ethers.id("bounds-1");
      
      await escrow.connect(buyer).createAndFundEscrow(dealId, seller.address, await usdc.getAddress(), 100, "hash", 3600);
      
      const deal = await escrow.escrows(dealId);
      
      // Ensure the transaction is mined exactly on the deadline timestamp
      await networkHelpers.time.setNextBlockTimestamp(deal.deadline);
      await expect(escrow.connect(buyer).claimExpiredRefund(dealId))
        .to.be.revertedWithCustomError(escrow, "DeadlineNotPassed");
      
      // Fast forward 1 second (deadline + 1n)
      await networkHelpers.time.setNextBlockTimestamp(deal.deadline + 1n);
      await expect(escrow.connect(buyer).claimExpiredRefund(dealId))
        .to.emit(escrow, "EscrowRefunded");
    });

    it("Exactly at Oracle Timeout: Buyer refund fails", async function () {
      const { usdc, escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      const dealId = ethers.id("bounds-2");
      
      await escrow.connect(buyer).createAndFundEscrow(dealId, seller.address, await usdc.getAddress(), 100, "hash", 3600);
      await escrow.connect(seller).submitDeliverable(dealId, "hash");

      const deal = await escrow.escrows(dealId);
      const ORACLE_TIMEOUT = await escrow.ORACLE_TIMEOUT();
      
      // Mine the transaction exactly at deadline + timeout
      await networkHelpers.time.setNextBlockTimestamp(deal.deadline + ORACLE_TIMEOUT);
      await expect(escrow.connect(buyer).claimExpiredRefund(dealId))
        .to.be.revertedWithCustomError(escrow, "OracleGracePeriodNotPassed");

      // Fast forward 1 second
      await networkHelpers.time.setNextBlockTimestamp(deal.deadline + ORACLE_TIMEOUT + 1n);
      await expect(escrow.connect(buyer).claimExpiredRefund(dealId))
        .to.emit(escrow, "EscrowRefunded");
    });
  });

  describe("State Machine Transitions (Full Coverage)", function () {
    it("Should prevent submission after deadline", async function () {
      const { usdc, escrow, buyer, seller } = await networkHelpers.loadFixture(deployEscrowFixture);
      const dealId = ethers.id("state-1");

      await escrow.connect(buyer).createAndFundEscrow(dealId, seller.address, await usdc.getAddress(), 100, "hash", 3600);
      await networkHelpers.time.increase(3601);

      await expect(escrow.connect(seller).submitDeliverable(dealId, "hash"))
        .to.be.revertedWithCustomError(escrow, "DeadlinePassed");
    });

    it("Should prevent refunding a deal that is already resolved (InvalidState)", async function () {
      const { usdc, escrow, buyer, seller, oracle } = await networkHelpers.loadFixture(deployEscrowFixture);
      const dealId = ethers.id("state-2");

      await escrow.connect(buyer).createAndFundEscrow(dealId, seller.address, await usdc.getAddress(), 100, "hash", 3600);
      await escrow.connect(seller).submitDeliverable(dealId, "hash");
      await escrow.connect(oracle).resolveEscrow(dealId, true, "hash");

      await networkHelpers.time.increase(365 * 24 * 3600);

      await expect(escrow.connect(buyer).claimExpiredRefund(dealId))
        .to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("Should reject invalid oracle zero address rotation", async function () {
      const { escrow, oracle } = await networkHelpers.loadFixture(deployEscrowFixture);
      await expect(escrow.connect(oracle).updateOracle(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });
  });
});
