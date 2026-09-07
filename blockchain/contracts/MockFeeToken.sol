// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockFeeToken
 * @dev An ERC20 token that simulates a deflationary "Fee-On-Transfer" model.
 * It burns 10% of every transfer amount, so the recipient receives less than the sender sends.
 */
contract MockFeeToken is ERC20 {
    uint256 public constant FEE_PERCENT = 10;

    constructor() ERC20("Mock Fee Token", "MFT") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    /**
     * @dev Overrides the internal transfer function to deduct a 10% fee.
     * The fee is simply burned (not transferred to the recipient).
     */
    function _update(address from, address to, uint256 amount) internal virtual override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = (amount * FEE_PERCENT) / 100;
            uint256 amountAfterFee = amount - fee;
            
            // Burn the fee
            super._update(from, address(0), fee);
            
            // Transfer the rest
            super._update(from, to, amountAfterFee);
        } else {
            // Minting or burning directly
            super._update(from, to, amount);
        }
    }
}
