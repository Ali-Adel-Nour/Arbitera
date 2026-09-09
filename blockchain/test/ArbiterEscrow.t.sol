// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { ArbiterEscrow } from "../contracts/ArbiterEscrow.sol";
import { IArbiterEscrow } from "../contracts/interfaces/IArbiterEscrow.sol";
import { MockUSDC } from "../contracts/MockUSDC.sol";

// --- Handler Contract to manage stateful random actions ---
contract EscrowHandler is Test {
    ArbiterEscrow public escrow;
    MockUSDC public usdc;
    
    address public oracle = address(0x111);
    
    bytes32[] public activeDeals;
    uint256 public expectedEscrowBalance;

    constructor(ArbiterEscrow _escrow, MockUSDC _usdc) {
        escrow = _escrow;
        usdc = _usdc;
    }

    // Helper to get a deal, or randomly select one
    function _getRandomDealId(uint256 seed) internal view returns (bytes32) {
        if (activeDeals.length == 0) return bytes32(0);
        return activeDeals[seed % activeDeals.length];
    }

    function createEscrow(uint256 amount, uint256 duration, address buyer, address seller) public {
        amount = bound(amount, 1, 1_000_000 * 10**6);
        duration = bound(duration, 1, 365 days);
        if (buyer == address(0) || seller == address(0)) return;
        
        bytes32 dealId = keccak256(abi.encodePacked(buyer, seller, amount, block.timestamp));
        
        // Prevent duplicate Deal ID which reverts and wastes fuzz run
        (bytes32 existingId,,,,,,,,,) = escrow.escrows(dealId);
        if (existingId != bytes32(0)) return;

        // Fund the buyer
        usdc.mint(buyer, amount);
        
        vm.startPrank(buyer);
        usdc.approve(address(escrow), amount);
        escrow.createAndFundEscrow(dealId, seller, address(usdc), amount, "criteria", duration);
        vm.stopPrank();

        activeDeals.push(dealId);
        expectedEscrowBalance += amount;
    }

    function submit(uint256 seedIndex) public {
        bytes32 dealId = _getRandomDealId(seedIndex);
        if (dealId == bytes32(0)) return;
        
        (,,,,,,, IArbiterEscrow.EscrowState state,,) = escrow.escrows(dealId);
        if (state != IArbiterEscrow.EscrowState.Funded) return;
        
        (, , address seller, , , , uint256 deadline, , , ) = escrow.escrows(dealId);
        if (block.timestamp > deadline) return; // Prevent expected revert
        
        vm.prank(seller);
        escrow.submitDeliverable(dealId, "hash");
    }

    function resolve(uint256 seedIndex, bool approved) public {
        bytes32 dealId = _getRandomDealId(seedIndex);
        if (dealId == bytes32(0)) return;

        (,,,, uint256 amount,,, IArbiterEscrow.EscrowState state,,) = escrow.escrows(dealId);
        if (state != IArbiterEscrow.EscrowState.Submitted) return;

        vm.prank(oracle);
        escrow.resolveEscrow(dealId, approved, "hash");

        expectedEscrowBalance -= amount;
    }

    function refund(uint256 seedIndex) public {
        bytes32 dealId = _getRandomDealId(seedIndex);
        if (dealId == bytes32(0)) return;

        (, address buyer, ,, uint256 amount, , uint256 deadline, IArbiterEscrow.EscrowState state, , ) = escrow.escrows(dealId);
        
        if (state == IArbiterEscrow.EscrowState.Funded) {
            if (block.timestamp <= deadline) return;
        } else if (state == IArbiterEscrow.EscrowState.Submitted) {
            if (block.timestamp <= deadline + 24 hours) return;
        } else {
            return;
        }

        vm.prank(buyer);
        escrow.claimExpiredRefund(dealId);
        
        expectedEscrowBalance -= amount;
    }

    function timeWarp(uint256 skipSeconds) public {
        skipSeconds = bound(skipSeconds, 1, 30 days);
        vm.warp(block.timestamp + skipSeconds);
    }
}

// --- Main Invariant Test Contract ---
contract ArbiterEscrowInvariantTest is StdInvariant, Test {
    ArbiterEscrow public escrow;
    MockUSDC public usdc;
    EscrowHandler public handler;
    address public oracle = address(0x111);

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new ArbiterEscrow(oracle);
        handler = new EscrowHandler(escrow, usdc);

        // Tell Foundry to only fuzz the functions inside the Handler
        targetContract(address(handler));
    }

    /// @dev Core Invariant 1: The smart contract must always hold EXACTLY the sum of all active deals.
    function invariant_ContractBalanceMustMatchActiveDeals() public view {
        uint256 actualBalance = usdc.balanceOf(address(escrow));
        assertEq(actualBalance, handler.expectedEscrowBalance());
    }
}
