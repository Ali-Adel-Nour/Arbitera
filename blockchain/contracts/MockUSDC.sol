// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @dev An ERC20 token simulating USDC for local/testnet environments.
 * Uses 6 decimals to perfectly match real USDC on mainnets.
 * Includes a public mint function so demo agents can get fake USDC easily.
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    /**
     * @dev Overrides default 18 decimals to 6, exactly matching Circle's real USDC.
     */
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    /**
     * @dev Public minting for hackathon demo and testing purposes.
     * In a production environment, this would be restricted or removed.
     * @param to Address receiving the minted mUSDC
     * @param amount Amount to mint (remember 6 decimals, so 5 USDC = 5_000_000)
     */
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
