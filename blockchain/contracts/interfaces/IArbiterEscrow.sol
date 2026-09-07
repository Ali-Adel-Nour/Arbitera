// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IArbiterEscrow
 * @dev Interface for the Arbiter AI Escrow Protocol.
 */
interface IArbiterEscrow {
    enum EscrowState {
        Created,       // Deal initialized, awaiting funding
        Funded,        // Buyer has locked USDC
        Submitted,     // Seller has delivered payload, awaiting AI judge
        ResolvedSuccess, // AI Judge approved, seller paid
        ResolvedRefund,  // AI Judge rejected, buyer refunded
        ExpiredRefund    // Deadline passed without submission, or oracle timeout passed
    }

    struct EscrowDeal {
        bytes32 dealId;
        address buyer;
        address seller;
        address token; // Address of the USDC/ERC20 token
        uint256 amount;
        string criteriaHash; // IPFS or sha256 hash of the buyer's criteria
        uint256 deadline;
        EscrowState state;
        string deliverableHash;
        string verdictReasoningHash;
    }

    // --- Custom Errors ---
    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidDealId();
    error DealAlreadyExists();
    error InvalidState();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error OracleGracePeriodNotPassed();

    // --- Events ---
    event OracleUpdated(
        address indexed oldOracle,
        address indexed newOracle
    );

    event EscrowCreated(
        bytes32 indexed dealId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        string criteriaHash,
        uint256 deadline
    );

    event DeliverableSubmitted(
        bytes32 indexed dealId,
        string deliverableHash
    );

    event EscrowResolved(
        bytes32 indexed dealId,
        address indexed buyer,
        address indexed seller,
        bool approved,
        uint256 amount,
        string verdictReasoningHash
    );

    event EscrowRefunded(
        bytes32 indexed dealId,
        address indexed buyer,
        uint256 amount,
        string reason
    );

    // --- Functions ---
    function updateOracle(address newOracle) external;

    function createAndFundEscrow(
        bytes32 dealId,
        address seller,
        address token,
        uint256 amount,
        string calldata criteriaHash,
        uint256 durationSeconds
    ) external;

    function submitDeliverable(
        bytes32 dealId,
        string calldata deliverableHash
    ) external;

    function resolveEscrow(
        bytes32 dealId,
        bool approved,
        string calldata verdictReasoningHash
    ) external;

    function claimExpiredRefund(bytes32 dealId) external;
}