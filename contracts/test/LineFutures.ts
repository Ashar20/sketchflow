import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { LineFutures, MNTPriceOracle } from "../types/ethers-contracts";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("LineFutures", function () {
  let lineFutures: LineFutures;
  let mntPriceOracle: MNTPriceOracle;
  let owner: HardhatEthersSigner;
  let pnlServer: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const MIN_AMOUNT = hre.ethers.parseEther("0.001");
  const TEST_COMMITMENT = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test_prediction"));
  const ACTUAL_COMMITMENT = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("actual_prices"));

  beforeEach(async function () {
    [owner, pnlServer, user1, user2] = await hre.ethers.getSigners();

    // Deploy MNTPriceOracle first
    const MNTPriceOracleFactory = await hre.ethers.getContractFactory("MNTPriceOracle");
    mntPriceOracle = await MNTPriceOracleFactory.deploy(owner.address);
    await mntPriceOracle.waitForDeployment();

    // Deploy LineFutures
    const LineFuturesFactory = await hre.ethers.getContractFactory("LineFutures");
    lineFutures = await LineFuturesFactory.deploy(pnlServer.address, await mntPriceOracle.getAddress());
    await lineFutures.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await lineFutures.owner()).to.equal(owner.address);
    });

    it("Should set the correct PnL server", async function () {
      expect(await lineFutures.pnlServer()).to.equal(pnlServer.address);
    });

    it("Should set the correct oracle address", async function () {
      expect(await lineFutures.mntPriceOracle()).to.equal(await mntPriceOracle.getAddress());
    });

    it("Should initialize with correct constants", async function () {
      expect(await lineFutures.MIN_AMOUNT()).to.equal(MIN_AMOUNT);
      expect(await lineFutures.MAX_LEVERAGE()).to.equal(50);
      expect(await lineFutures.POSITION_DURATION()).to.equal(60);
      expect(await lineFutures.feePercentage()).to.equal(200); // 2%
    });

    it("Should not be paused initially", async function () {
      expect(await lineFutures.paused()).to.equal(false);
    });
  });

  describe("Opening Positions", function () {
    it("Should open a position with valid inputs", async function () {
      const tx = await lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, {
        value: MIN_AMOUNT
      });

      await expect(tx)
        .to.emit(lineFutures, "PositionOpened")
        .withArgs(0, user1.address, MIN_AMOUNT, 10, await time.latest(), TEST_COMMITMENT);

      const position = await lineFutures.getPosition(0);
      expect(position.user).to.equal(user1.address);
      expect(position.amount).to.equal(MIN_AMOUNT);
      expect(position.leverage).to.equal(10);
      expect(position.isOpen).to.equal(true);
      expect(position.predictionCommitmentId).to.equal(TEST_COMMITMENT);
    });

    it("Should reject position below minimum amount", async function () {
      const lowAmount = hre.ethers.parseEther("0.0001");
      await expect(
        lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: lowAmount })
      ).to.be.revertedWith("LineFutures: amount below minimum");
    });

    it("Should reject position with zero leverage", async function () {
      await expect(
        lineFutures.connect(user1).openPosition(0, TEST_COMMITMENT, { value: MIN_AMOUNT })
      ).to.be.revertedWith("LineFutures: invalid leverage");
    });

    it("Should reject position with leverage above maximum", async function () {
      await expect(
        lineFutures.connect(user1).openPosition(51, TEST_COMMITMENT, { value: MIN_AMOUNT })
      ).to.be.revertedWith("LineFutures: invalid leverage");
    });

    it("Should reject position with empty commitment ID", async function () {
      await expect(
        lineFutures.connect(user1).openPosition(10, hre.ethers.ZeroHash, { value: MIN_AMOUNT })
      ).to.be.revertedWith("LineFutures: empty commitment ID");
    });

    it("Should track user positions", async function () {
      await lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: MIN_AMOUNT });
      await lineFutures.connect(user1).openPosition(5, TEST_COMMITMENT, { value: MIN_AMOUNT });

      const userPositions = await lineFutures.getUserPositions(user1.address);
      expect(userPositions.length).to.equal(2);
      expect(userPositions[0]).to.equal(0);
      expect(userPositions[1]).to.equal(1);
    });

    it("Should increment position counter", async function () {
      expect(await lineFutures.positionCounter()).to.equal(0);

      await lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: MIN_AMOUNT });
      expect(await lineFutures.positionCounter()).to.equal(1);

      await lineFutures.connect(user2).openPosition(5, TEST_COMMITMENT, { value: MIN_AMOUNT });
      expect(await lineFutures.positionCounter()).to.equal(2);
    });

    it("Should reject when contract is paused", async function () {
      await lineFutures.connect(owner).pause();

      await expect(
        lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: MIN_AMOUNT })
      ).to.be.revertedWith("LineFutures: contract is paused");
    });
  });

  describe("Batch Opening Positions", function () {
    it("Should batch open 1 position", async function () {
      const commitmentIds = [TEST_COMMITMENT];
      const totalAmount = MIN_AMOUNT;
      const baseTimestamp = await time.latest();

      const tx = await lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
        value: totalAmount
      });

      await expect(tx)
        .to.emit(lineFutures, "PositionOpened")
        .withArgs(0, user1.address, totalAmount, 10, baseTimestamp, TEST_COMMITMENT);

      const position = await lineFutures.getPosition(0);
      expect(position.user).to.equal(user1.address);
      expect(position.amount).to.equal(totalAmount);
      expect(position.leverage).to.equal(10);
      expect(position.isOpen).to.equal(true);
      expect(position.predictionCommitmentId).to.equal(TEST_COMMITMENT);
      expect(position.openTimestamp).to.equal(baseTimestamp);
    });

    it("Should batch open 3 positions with equal split", async function () {
      const commitmentIds = [TEST_COMMITMENT, TEST_COMMITMENT, TEST_COMMITMENT];
      const totalAmount = MIN_AMOUNT * 3n;
      const amountPerPosition = totalAmount / 3n;

      const tx = await lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
        value: totalAmount
      });

      const receipt = await tx.wait();
      const positionOpenedEvents = receipt!.logs
        .map(log => {
          try {
            return lineFutures.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .filter(parsed => parsed?.name === "PositionOpened");

      expect(positionOpenedEvents.length).to.equal(3);

      // Check positions 0, 1, 2
      for (let i = 0; i < 3; i++) {
        const position = await lineFutures.getPosition(i);
        expect(position.user).to.equal(user1.address);
        expect(position.amount).to.equal(amountPerPosition);
        expect(position.leverage).to.equal(10);
        expect(position.isOpen).to.equal(true);
        expect(position.predictionCommitmentId).to.equal(TEST_COMMITMENT);
      }

      const userPositions = await lineFutures.getUserPositions(user1.address);
      expect(userPositions.length).to.equal(3);
    });

    it("Should batch open 5 positions with staggered timestamps", async function () {
      const commitmentIds = [
        TEST_COMMITMENT,
        TEST_COMMITMENT,
        TEST_COMMITMENT,
        TEST_COMMITMENT,
        TEST_COMMITMENT
      ];
      const totalAmount = MIN_AMOUNT * 5n;
      const amountPerPosition = totalAmount / 5n;
      const baseTimestamp = await time.latest();

      const tx = await lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
        value: totalAmount
      });

      await tx.wait();

      // Check that each position has a staggered timestamp
      for (let i = 0; i < 5; i++) {
        const position = await lineFutures.getPosition(i);
        const expectedTimestamp = baseTimestamp + BigInt(i * 60);
        expect(position.openTimestamp).to.equal(expectedTimestamp);
        expect(position.amount).to.equal(amountPerPosition);
        expect(position.leverage).to.equal(10);
        expect(position.isOpen).to.equal(true);
      }
    });

    it("Should handle remainder refund when amount doesn't divide evenly", async function () {
      const commitmentIds = [TEST_COMMITMENT, TEST_COMMITMENT];
      const totalAmount = MIN_AMOUNT * 2n + 1000n; // Add 1000 wei remainder
      const amountPerPosition = totalAmount / 2n;
      const remainder = totalAmount % 2n;

      const balanceBefore = await hre.ethers.provider.getBalance(user1.address);

      const tx = await lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
        value: totalAmount
      });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await hre.ethers.provider.getBalance(user1.address);

      // User should have paid totalAmount - remainder (remainder was refunded)
      expect(balanceBefore - balanceAfter - gasUsed).to.equal(totalAmount - remainder);

      // Check positions received equal split
      const position0 = await lineFutures.getPosition(0);
      const position1 = await lineFutures.getPosition(1);
      expect(position0.amount).to.equal(amountPerPosition);
      expect(position1.amount).to.equal(amountPerPosition);
    });

    it("Should reject batch with 0 positions", async function () {
      await expect(
        lineFutures.connect(user1).batchOpenPositions(10, [], { value: MIN_AMOUNT })
      ).to.be.revertedWith("LineFutures: invalid position count");
    });

    it("Should reject batch with more than 5 positions", async function () {
      const commitmentIds = Array(6).fill(TEST_COMMITMENT);
      await expect(
        lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
          value: MIN_AMOUNT * 6n
        })
      ).to.be.revertedWith("LineFutures: invalid position count");
    });

    it("Should reject batch with insufficient total amount", async function () {
      const commitmentIds = [TEST_COMMITMENT, TEST_COMMITMENT];
      const lowAmount = MIN_AMOUNT * 2n - 1n;

      await expect(
        lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
          value: lowAmount
        })
      ).to.be.revertedWith("LineFutures: total amount below minimum");
    });

    it("Should reject batch with amount per position below minimum", async function () {
      const commitmentIds = [TEST_COMMITMENT, TEST_COMMITMENT];
      // Total is enough, but per-position would be below minimum
      const lowAmount = MIN_AMOUNT * 2n - 1n;

      await expect(
        lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
          value: lowAmount
        })
      ).to.be.revertedWith("LineFutures: total amount below minimum");
    });

    it("Should reject batch with empty commitment ID", async function () {
      const commitmentIds = [TEST_COMMITMENT, ""];

      await expect(
        lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
          value: MIN_AMOUNT * 2n
        })
      ).to.be.revertedWith("LineFutures: empty commitment ID");
    });

    it("Should reject batch with invalid leverage", async function () {
      const commitmentIds = [TEST_COMMITMENT];

      await expect(
        lineFutures.connect(user1).batchOpenPositions(0, commitmentIds, {
          value: MIN_AMOUNT
        })
      ).to.be.revertedWith("LineFutures: invalid leverage");

      await expect(
        lineFutures.connect(user1).batchOpenPositions(2501, commitmentIds, {
          value: MIN_AMOUNT
        })
      ).to.be.revertedWith("LineFutures: invalid leverage");
    });

    it("Should reject batch when contract is paused", async function () {
      await lineFutures.connect(owner).pause();

      await expect(
        lineFutures.connect(user1).batchOpenPositions(10, [TEST_COMMITMENT], {
          value: MIN_AMOUNT
        })
      ).to.be.revertedWith("LineFutures: contract is paused");
    });

    it("Should allow closing positions at staggered times", async function () {
      const commitmentIds = [
        TEST_COMMITMENT,
        TEST_COMMITMENT,
        TEST_COMMITMENT
      ];
      const totalAmount = MIN_AMOUNT * 3n;

      await lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
        value: totalAmount
      });

      const baseTimestamp = await time.latest();

      // Position 0 should be closable after 60 seconds
      await time.increase(60);
      expect(await lineFutures.canClosePosition(0)).to.equal(true);
      expect(await lineFutures.canClosePosition(1)).to.equal(false);
      expect(await lineFutures.canClosePosition(2)).to.equal(false);

      // Position 1 should be closable after 120 seconds total
      await time.increase(60);
      expect(await lineFutures.canClosePosition(0)).to.equal(true);
      expect(await lineFutures.canClosePosition(1)).to.equal(true);
      expect(await lineFutures.canClosePosition(2)).to.equal(false);

      // Position 2 should be closable after 180 seconds total
      await time.increase(60);
      expect(await lineFutures.canClosePosition(0)).to.equal(true);
      expect(await lineFutures.canClosePosition(1)).to.equal(true);
      expect(await lineFutures.canClosePosition(2)).to.equal(true);

      // Close position 0
      await lineFutures.connect(pnlServer).closePosition(0, 0, ACTUAL_COMMITMENT);
      expect(await lineFutures.canClosePosition(0)).to.equal(false);

      // Close position 1
      await lineFutures.connect(pnlServer).closePosition(1, 0, ACTUAL_COMMITMENT);
      expect(await lineFutures.canClosePosition(1)).to.equal(false);

      // Close position 2
      await lineFutures.connect(pnlServer).closePosition(2, 0, ACTUAL_COMMITMENT);
      expect(await lineFutures.canClosePosition(2)).to.equal(false);
    });

    it("Should track all batch positions in user positions array", async function () {
      const commitmentIds = [
        TEST_COMMITMENT,
        TEST_COMMITMENT,
        TEST_COMMITMENT
      ];
      const totalAmount = MIN_AMOUNT * 3n;

      await lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
        value: totalAmount
      });

      const userPositions = await lineFutures.getUserPositions(user1.address);
      expect(userPositions.length).to.equal(3);
      expect(userPositions[0]).to.equal(0);
      expect(userPositions[1]).to.equal(1);
      expect(userPositions[2]).to.equal(2);
    });

    it("Should increment position counter correctly for batch", async function () {
      expect(await lineFutures.positionCounter()).to.equal(0);

      const commitmentIds = [TEST_COMMITMENT, TEST_COMMITMENT];
      await lineFutures.connect(user1).batchOpenPositions(10, commitmentIds, {
        value: MIN_AMOUNT * 2n
      });

      expect(await lineFutures.positionCounter()).to.equal(2);

      await lineFutures.connect(user2).openPosition(10, TEST_COMMITMENT, {
        value: MIN_AMOUNT
      });

      expect(await lineFutures.positionCounter()).to.equal(3);
    });
  });

  describe("Closing Positions", function () {
    beforeEach(async function () {
      // Open a position
      await lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: MIN_AMOUNT });
    });

    it("Should close position after 60 seconds with profit", async function () {
      // Fast forward 60 seconds
      await time.increase(60);

      const pnl = hre.ethers.parseEther("5"); // 5 ETH profit
      const fee = (pnl * 200n) / 10000n; // 2% fee
      const expectedFinal = MIN_AMOUNT + pnl - fee;

      const balanceBefore = await hre.ethers.provider.getBalance(user1.address);

      const tx = await lineFutures.connect(pnlServer).closePosition(0, pnl, ACTUAL_COMMITMENT);

      await expect(tx)
        .to.emit(lineFutures, "PositionClosed")
        .withArgs(0, user1.address, pnl, expectedFinal, ACTUAL_COMMITMENT, await time.latest());

      const position = await lineFutures.getPosition(0);
      expect(position.isOpen).to.equal(false);
      expect(position.pnl).to.equal(pnl);
      expect(position.actualPriceCommitmentId).to.equal(ACTUAL_COMMITMENT);
      expect(position.closeTimestamp).to.be.greaterThan(0);

      const balanceAfter = await hre.ethers.provider.getBalance(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(expectedFinal);

      // Check fees were collected
      expect(await lineFutures.collectedFees()).to.equal(fee);
    });

    it("Should close position with loss (no fee)", async function () {
      await time.increase(60);

      const pnl = hre.ethers.parseEther("-3"); // 3 ETH loss
      const expectedFinal = MIN_AMOUNT + pnl;

      const balanceBefore = await hre.ethers.provider.getBalance(user1.address);

      await lineFutures.connect(pnlServer).closePosition(0, pnl, ACTUAL_COMMITMENT);

      const position = await lineFutures.getPosition(0);
      expect(position.pnl).to.equal(pnl);

      const balanceAfter = await hre.ethers.provider.getBalance(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(expectedFinal);

      // No fees should be collected on losses
      expect(await lineFutures.collectedFees()).to.equal(0);
    });

    it("Should handle total loss (finalAmount <= 0)", async function () {
      await time.increase(60);

      const pnl = hre.ethers.parseEther("-10"); // Total loss
      const balanceBefore = await hre.ethers.provider.getBalance(user1.address);

      await lineFutures.connect(pnlServer).closePosition(0, pnl, ACTUAL_COMMITMENT);

      const balanceAfter = await hre.ethers.provider.getBalance(user1.address);
      expect(balanceAfter).to.equal(balanceBefore); // No transfer

      const position = await lineFutures.getPosition(0);
      expect(position.isOpen).to.equal(false);
    });

    it("Should reject closing before 60 seconds", async function () {
      await time.increase(59); // Only 59 seconds

      await expect(
        lineFutures.connect(pnlServer).closePosition(0, 0, ACTUAL_COMMITMENT)
      ).to.be.revertedWith("LineFutures: position not yet closable");
    });

    it("Should reject closing already closed position", async function () {
      await time.increase(60);
      await lineFutures.connect(pnlServer).closePosition(0, 0, ACTUAL_COMMITMENT);

      await expect(
        lineFutures.connect(pnlServer).closePosition(0, 0, ACTUAL_COMMITMENT)
      ).to.be.revertedWith("LineFutures: position already closed");
    });

    it("Should reject closing non-existent position", async function () {
      await expect(
        lineFutures.connect(pnlServer).closePosition(999, 0, ACTUAL_COMMITMENT)
      ).to.be.revertedWith("LineFutures: position does not exist");
    });

    it("Should reject closing from non-PnL server", async function () {
      await time.increase(60);

      await expect(
        lineFutures.connect(user1).closePosition(0, 0, ACTUAL_COMMITMENT)
      ).to.be.revertedWith("LineFutures: caller is not the PnL server");
    });

    it("Should reject empty actual commitment ID", async function () {
      await time.increase(60);

      await expect(
        lineFutures.connect(pnlServer).closePosition(0, 0, hre.ethers.ZeroHash)
      ).to.be.revertedWith("LineFutures: empty commitment ID");
    });
  });

  describe("Admin Functions", function () {
    describe("setPnLServer", function () {
      it("Should update PnL server", async function () {
        const newServer = user1.address;

        await expect(lineFutures.connect(owner).setPnLServer(newServer))
          .to.emit(lineFutures, "PnLServerUpdated")
          .withArgs(pnlServer.address, newServer);

        expect(await lineFutures.pnlServer()).to.equal(newServer);
      });

      it("Should reject zero address", async function () {
        await expect(
          lineFutures.connect(owner).setPnLServer(hre.ethers.ZeroAddress)
        ).to.be.revertedWith("LineFutures: new server is zero address");
      });

      it("Should reject from non-owner", async function () {
        await expect(
          lineFutures.connect(user1).setPnLServer(user2.address)
        ).to.be.revertedWith("LineFutures: caller is not the owner");
      });
    });

    describe("setFeePercentage", function () {
      it("Should update fee percentage", async function () {
        const newFee = 300; // 3%

        await expect(lineFutures.connect(owner).setFeePercentage(newFee))
          .to.emit(lineFutures, "FeePercentageUpdated")
          .withArgs(200, newFee);

        expect(await lineFutures.feePercentage()).to.equal(newFee);
      });

      it("Should reject fee above 10%", async function () {
        await expect(
          lineFutures.connect(owner).setFeePercentage(1001)
        ).to.be.revertedWith("LineFutures: fee too high");
      });

      it("Should reject from non-owner", async function () {
        await expect(
          lineFutures.connect(user1).setFeePercentage(300)
        ).to.be.revertedWith("LineFutures: caller is not the owner");
      });
    });

    describe("withdrawFees", function () {
      beforeEach(async function () {
        // Create a position with profit to generate fees
        await lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: MIN_AMOUNT });
        await time.increase(60);

        const pnl = hre.ethers.parseEther("5");
        await lineFutures.connect(pnlServer).closePosition(0, pnl, ACTUAL_COMMITMENT);
      });

      it("Should withdraw fees", async function () {
        const fees = await lineFutures.collectedFees();
        const balanceBefore = await hre.ethers.provider.getBalance(owner.address);

        const tx = await lineFutures.connect(owner).withdrawFees(fees);
        const receipt = await tx.wait();
        const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

        await expect(tx)
          .to.emit(lineFutures, "FeesWithdrawn")
          .withArgs(owner.address, fees, await time.latest());

        const balanceAfter = await hre.ethers.provider.getBalance(owner.address);
        expect(balanceAfter - balanceBefore + gasUsed).to.equal(fees);
        expect(await lineFutures.collectedFees()).to.equal(0);
      });

      it("Should reject withdrawing more than collected", async function () {
        const fees = await lineFutures.collectedFees();

        await expect(
          lineFutures.connect(owner).withdrawFees(fees + 1n)
        ).to.be.revertedWith("LineFutures: insufficient fees");
      });

      it("Should reject from non-owner", async function () {
        const fees = await lineFutures.collectedFees();

        await expect(
          lineFutures.connect(user1).withdrawFees(fees)
        ).to.be.revertedWith("LineFutures: caller is not the owner");
      });
    });

    describe("pause/unpause", function () {
      it("Should pause contract", async function () {
        await expect(lineFutures.connect(owner).pause())
          .to.emit(lineFutures, "ContractPaused");

        expect(await lineFutures.paused()).to.equal(true);
      });

      it("Should unpause contract", async function () {
        await lineFutures.connect(owner).pause();

        await expect(lineFutures.connect(owner).unpause())
          .to.emit(lineFutures, "ContractUnpaused");

        expect(await lineFutures.paused()).to.equal(false);
      });

      it("Should reject pause from non-owner", async function () {
        await expect(
          lineFutures.connect(user1).pause()
        ).to.be.revertedWith("LineFutures: caller is not the owner");
      });

      it("Should allow closing positions when paused", async function () {
        await lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: MIN_AMOUNT });
        await lineFutures.connect(owner).pause();
        await time.increase(60);

        // Should still be able to close
        await expect(
          lineFutures.connect(pnlServer).closePosition(0, 0, ACTUAL_COMMITMENT)
        ).to.not.be.reverted;
      });
    });

    describe("emergencyWithdraw", function () {
      it("Should withdraw all contract balance", async function () {
        // Add some balance
        await lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: MIN_AMOUNT });

        const contractBalance = await hre.ethers.provider.getBalance(await lineFutures.getAddress());
        const balanceBefore = await hre.ethers.provider.getBalance(owner.address);

        const tx = await lineFutures.connect(owner).emergencyWithdraw();
        const receipt = await tx.wait();
        const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

        const balanceAfter = await hre.ethers.provider.getBalance(owner.address);
        expect(balanceAfter - balanceBefore + gasUsed).to.equal(contractBalance);
      });

      it("Should reject from non-owner", async function () {
        await expect(
          lineFutures.connect(user1).emergencyWithdraw()
        ).to.be.revertedWith("LineFutures: caller is not the owner");
      });
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await lineFutures.connect(user1).openPosition(10, TEST_COMMITMENT, { value: MIN_AMOUNT });
      await lineFutures.connect(user1).openPosition(5, TEST_COMMITMENT, { value: MIN_AMOUNT });
    });

    describe("canClosePosition", function () {
      it("Should return false before 60 seconds", async function () {
        expect(await lineFutures.canClosePosition(0)).to.equal(false);
      });

      it("Should return true after 60 seconds", async function () {
        await time.increase(60);
        expect(await lineFutures.canClosePosition(0)).to.equal(true);
      });

      it("Should return false for closed position", async function () {
        await time.increase(60);
        await lineFutures.connect(pnlServer).closePosition(0, 0, ACTUAL_COMMITMENT);
        expect(await lineFutures.canClosePosition(0)).to.equal(false);
      });

      it("Should return false for non-existent position", async function () {
        expect(await lineFutures.canClosePosition(999)).to.equal(false);
      });
    });

    describe("getUserStats", function () {
      it("Should return correct stats for user with open positions", async function () {
        const [total, open, closed, totalPnl] = await lineFutures.getUserStats(user1.address);

        expect(total).to.equal(2);
        expect(open).to.equal(2);
        expect(closed).to.equal(0);
        expect(totalPnl).to.equal(0);
      });

      it("Should return correct stats after closing positions", async function () {
        await time.increase(60);

        const pnl1 = hre.ethers.parseEther("5");
        const pnl2 = hre.ethers.parseEther("-2");

        await lineFutures.connect(pnlServer).closePosition(0, pnl1, ACTUAL_COMMITMENT);
        await lineFutures.connect(pnlServer).closePosition(1, pnl2, ACTUAL_COMMITMENT);

        const [total, open, closed, totalPnl] = await lineFutures.getUserStats(user1.address);

        expect(total).to.equal(2);
        expect(open).to.equal(0);
        expect(closed).to.equal(2);
        expect(totalPnl).to.equal(pnl1 + pnl2);
      });

      it("Should return zeros for user with no positions", async function () {
        const [total, open, closed, totalPnl] = await lineFutures.getUserStats(user2.address);

        expect(total).to.equal(0);
        expect(open).to.equal(0);
        expect(closed).to.equal(0);
        expect(totalPnl).to.equal(0);
      });
    });

    describe("getContractBalance", function () {
      it("Should return correct balance", async function () {
        const balance = await lineFutures.getContractBalance();
        expect(balance).to.equal(MIN_AMOUNT * 2n);
      });
    });
  });
});

