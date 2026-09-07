// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IArbiterEscrow.sol";

/**
 * @title ArbiterEscrow
 * @dev Autonomous Escrow Court Protocol.
 * Facilitates conditional payments between two agents, governed by an AI Oracle.
 * Implements ReentrancyGuard for all external calls dealing with token transfers.
 * Fully supports Fee-On-Transfer (FOT) and deflationary tokens by measuring exact balance deltas.
 */
contract ArbiterEscrow is IArbiterEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The authorized Oracle account that posts the AI Judge's verdict
    address public aiJudgeOracle;
    
    /// @notice Time the Oracle has to resolve after submission before buyer can reclaim (24 hours)
    uint256 public constant ORACLE_TIMEOUT = 24 hours;

    /// @notice Mapping from unique dealId to EscrowDeal struct containing the deal state
    mapping(bytes32 => EscrowDeal) public escrows;

    /// @dev Restricts execution to the authorized AI Judge Oracle
    modifier onlyOracle() {
        if (msg.sender != aiJudgeOracle) revert Unauthorized();
        _;
    }

    /// @dev Restricts execution to the original buyer of a specific deal
    modifier onlyBuyer(bytes32 dealId) {
        if (msg.sender != escrows[dealId].buyer) revert Unauthorized();
        _;
    }

    /// @dev Restricts execution to the designated seller of a specific deal
    modifier onlySeller(bytes32 dealId) {
        if (msg.sender != escrows[dealId].seller) revert Unauthorized();
        _;
    }

    /**
     * @notice Initializes the Escrow Protocol with the authorized AI Judge.
     * @param _aiJudgeOracle The address of the backend node serving as the AI Oracle.
     */
    constructor(address _aiJudgeOracle) {
        if (_aiJudgeOracle == address(0)) revert InvalidAddress();
        aiJudgeOracle = _aiJudgeOracle;
        emit OracleUpdated(address(0), _aiJudgeOracle);
    }

    /**
     * @notice Updates the oracle address in case of key rotation or node upgrades.
     * @dev Can only be called by the current Oracle.
     * @param newOracle The address of the new AI Judge Oracle.
     */
    function updateOracle(address newOracle) external override onlyOracle {
        if (newOracle == address(0)) revert InvalidAddress();
        address oldOracle = aiJudgeOracle;
        aiJudgeOracle = newOracle;
        emit OracleUpdated(oldOracle, newOracle);
    }

    /**
     * @notice Creates a new escrow deal and transfers tokens from the buyer.
     * @dev Checks balances before and after transfer to support Fee-On-Transfer tokens.
     * @param dealId A unique identifier for this escrow deal.
     * @param seller The address of the agent providing the service.
     * @param token The ERC20 token address used for payment.
     * @param requestedAmount The intended amount of tokens to lock.
     * @param criteriaHash An IPFS or SHA256 hash containing the buyer's detailed requirements.
     * @param durationSeconds The time limit in seconds the seller has to deliver before expiring.
     */
    function createAndFundEscrow(
        bytes32 dealId,
        address seller,
        address token,
        uint256 requestedAmount,
        string calldata criteriaHash,
        uint256 durationSeconds
    ) external override nonReentrant {
        if (dealId == bytes32(0)) revert InvalidDealId();
        if (escrows[dealId].buyer != address(0)) revert DealAlreadyExists();
        if (seller == address(0) || token == address(0)) revert InvalidAddress();
        if (requestedAmount == 0) revert InvalidAmount();
        if (durationSeconds == 0) revert InvalidDuration();

        // Support Fee-On-Transfer (FOT) tokens by checking exact balance delta
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), requestedAmount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        
        uint256 actualAmountReceived = balanceAfter - balanceBefore;
        if (actualAmountReceived == 0) revert InvalidAmount();

        EscrowDeal storage deal = escrows[dealId];
        deal.dealId = dealId;
        deal.buyer = msg.sender;
        deal.seller = seller;
        deal.token = token;
        deal.amount = actualAmountReceived;
        deal.criteriaHash = criteriaHash;
        deal.deadline = block.timestamp + durationSeconds;
        deal.state = EscrowState.Funded;

        emit EscrowCreated(dealId, msg.sender, seller, token, actualAmountReceived, criteriaHash, deal.deadline);
    }

    /**
     * @notice Allows the seller to submit their completed work before the deadline.
     * @dev Transitions state from `Funded` to `Submitted`, queuing it for Oracle review.
     * @param dealId The unique identifier of the active deal.
     * @param deliverableHash An IPFS or SHA256 hash of the seller's completed work.
     */
    function submitDeliverable(
        bytes32 dealId,
        string calldata deliverableHash
    ) external override onlySeller(dealId) {
        EscrowDeal storage deal = escrows[dealId];
        if (deal.state != EscrowState.Funded) revert InvalidState();
        if (block.timestamp > deal.deadline) revert DeadlinePassed();

        deal.state = EscrowState.Submitted;
        deal.deliverableHash = deliverableHash;

        emit DeliverableSubmitted(dealId, deliverableHash);
    }

    /**
     * @notice Allows the AI Judge Oracle to resolve the escrow based on the deliverable quality.
     * @dev If approved is true, funds go to the seller. If false, funds return to the buyer.
     * @param dealId The unique identifier of the deal in `Submitted` state.
     * @param approved Boolean indicating if the deliverable met the buyer's criteria.
     * @param verdictReasoningHash A hash of the detailed reasoning generated by the LLM.
     */
    function resolveEscrow(
        bytes32 dealId,
        bool approved,
        string calldata verdictReasoningHash
    ) external override onlyOracle nonReentrant {
        EscrowDeal storage deal = escrows[dealId];
        if (deal.state != EscrowState.Submitted) revert InvalidState();

        deal.verdictReasoningHash = verdictReasoningHash;

        if (approved) {
            deal.state = EscrowState.ResolvedSuccess;
            IERC20(deal.token).safeTransfer(deal.seller, deal.amount);
        } else {
            deal.state = EscrowState.ResolvedRefund;
            IERC20(deal.token).safeTransfer(deal.buyer, deal.amount);
        }

        emit EscrowResolved(dealId, deal.buyer, deal.seller, approved, deal.amount, verdictReasoningHash);
    }

    /**
     * @notice Reclaims locked funds for the buyer if the deal expires or the Oracle goes offline.
     * @dev Can be called if the seller misses the deadline, OR if the seller submits but the 
     * Oracle fails to resolve the escrow within the `ORACLE_TIMEOUT` grace period.
     * @param dealId The unique identifier of the active or submitted deal.
     */
    function claimExpiredRefund(bytes32 dealId) external override onlyBuyer(dealId) nonReentrant {
        EscrowDeal storage deal = escrows[dealId];
        
        if (deal.state == EscrowState.Funded) {
            // Seller ghosted: Never submitted before the deadline
            if (block.timestamp <= deal.deadline) revert DeadlineNotPassed();
        } else if (deal.state == EscrowState.Submitted) {
            // Oracle ghosted: Did not resolve within the 24 hour grace period
            if (block.timestamp <= deal.deadline + ORACLE_TIMEOUT) revert OracleGracePeriodNotPassed();
        } else {
            revert InvalidState();
        }

        deal.state = EscrowState.ExpiredRefund;
        IERC20(deal.token).safeTransfer(deal.buyer, deal.amount);

        emit EscrowRefunded(dealId, deal.buyer, deal.amount, "EXPIRED");
    }
}
