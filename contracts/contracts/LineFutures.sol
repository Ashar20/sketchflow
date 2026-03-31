// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title LineFutures
 * @notice Gamified futures trading platform where users predict token price movements over 60 seconds
 * @dev PNL is calculated based on directional accuracy using a Point-by-Point Directional Method
 */
contract LineFutures {
    // Position structure
    struct Position {
        address user;                      // User's wallet address
        uint256 amount;                    // Deposited amount (in wei)
        uint16 leverage;                   // 1x to 2500x
        uint256 openTimestamp;             // Block timestamp when opened
        string predictionCommitmentId;     // EigenDA commitment for predictions (full commitment)
        bool isOpen;                       // Position status
        int256 pnl;                        // Calculated PNL (in wei)
        string actualPriceCommitmentId;    // EigenDA commitment for actual prices (full commitment)
        uint256 closeTimestamp;            // Block timestamp when closed
    }

    // State variables
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public userPositions;
    uint256 public positionCounter;
    address public owner;
    address public pnlServer;

    // Constants
    uint256 public constant MIN_AMOUNT = 10**15;          // 0.001 ETH minimum
    uint16 public constant MAX_LEVERAGE = 2500;
    uint256 public constant POSITION_DURATION = 60;       // seconds

    // Fee system
    uint256 public collectedFees;
    uint256 public feePercentage = 200;                   // 2% = 200 basis points (out of 10000)

    bool public paused;

    // Events
    event PositionOpened(
        uint256 indexed positionId,
        address indexed user,
        uint256 amount,
        uint16 leverage,
        uint256 timestamp,
        string predictionCommitmentId
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed user,
        int256 pnl,
        uint256 finalAmount,
        string actualPriceCommitmentId,
        uint256 timestamp
    );

    event FeesWithdrawn(address indexed owner, uint256 amount, uint256 timestamp);
    event PnLServerUpdated(address indexed oldServer, address indexed newServer);
    event FeePercentageUpdated(uint256 oldFee, uint256 newFee);
    event ContractPaused();
    event ContractUnpaused();

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "LineFutures: caller is not the owner");
        _;
    }

    modifier onlyPnLServer() {
        require(msg.sender == pnlServer, "LineFutures: caller is not the PnL server");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "LineFutures: contract is paused");
        _;
    }

    /**
     * @notice Constructor sets the initial owner and PnL server
     * @param _pnlServer Address authorized to close positions
     */
    constructor(address _pnlServer) {
        require(_pnlServer != address(0), "LineFutures: PnL server is zero address");
        
        owner = msg.sender;
        pnlServer = _pnlServer;
        
        emit PnLServerUpdated(address(0), _pnlServer);
    }

    /**
     * @notice Open a new position
     * @param _leverage Leverage multiplier (1-2500)
     * @param _predictionCommitmentId EigenDA commitment ID for user predictions (full commitment string)
     * @return positionId The ID of the newly created position
     */
    function openPosition(
        uint16 _leverage,
        string memory _predictionCommitmentId
    ) external payable whenNotPaused returns (uint256 positionId) {
        // Validate inputs
        require(msg.value >= MIN_AMOUNT, "LineFutures: amount below minimum");
        require(_leverage >= 1 && _leverage <= MAX_LEVERAGE, "LineFutures: invalid leverage");
        require(bytes(_predictionCommitmentId).length > 0, "LineFutures: empty commitment ID");

        // Create new position
        Position memory newPosition = Position({
            user: msg.sender,
            amount: msg.value,
            leverage: _leverage,
            openTimestamp: block.timestamp,
            predictionCommitmentId: _predictionCommitmentId,
            isOpen: true,
            pnl: 0,
            actualPriceCommitmentId: "",
            closeTimestamp: 0
        });

        // Store position
        positionId = positionCounter;
        positions[positionId] = newPosition;
        userPositions[msg.sender].push(positionId);
        positionCounter++;

        emit PositionOpened(
            positionId,
            msg.sender,
            msg.value,
            _leverage,
            block.timestamp,
            _predictionCommitmentId
        );

        return positionId;
    }

    /**
     * @notice Batch open 1-5 positions with equal ETH split and staggered timestamps
     * @param _leverage Leverage multiplier (1-2500) applied to all positions
     * @param _predictionCommitmentIds Array of 1-5 EigenDA commitment IDs for predictions
     * @return positionIds Array of position IDs for the newly created positions
     * @dev Each position receives an equal share of msg.value (msg.value / count)
     * @dev Positions are staggered by 60 seconds: position i opens at block.timestamp + i * 60
     */
    function batchOpenPositions(
        uint16 _leverage,
        string[] memory _predictionCommitmentIds
    ) external payable whenNotPaused returns (uint256[] memory positionIds) {
        uint256 count = _predictionCommitmentIds.length;
        
        // Validate position count (1-5)
        require(count >= 1 && count <= 5, "LineFutures: invalid position count");
        
        // Validate leverage
        require(_leverage >= 1 && _leverage <= MAX_LEVERAGE, "LineFutures: invalid leverage");
        
        // Validate total ETH amount
        require(msg.value >= MIN_AMOUNT * count, "LineFutures: total amount below minimum");
        
        // Calculate amount per position (equal split)
        uint256 amountPerPosition = msg.value / count;
        require(amountPerPosition >= MIN_AMOUNT, "LineFutures: amount per position below minimum");
        
        // Refund remainder if any (to avoid dust stuck in contract)
        uint256 remainder = msg.value % count;
        if (remainder > 0) {
            (bool success, ) = payable(msg.sender).call{value: remainder}("");
            require(success, "LineFutures: remainder refund failed");
        }
        
        // Initialize return array
        positionIds = new uint256[](count);
        
        // Create positions with staggered timestamps
        for (uint256 i = 0; i < count; i++) {
            // Validate commitment ID is not empty
            require(
                bytes(_predictionCommitmentIds[i]).length > 0,
                "LineFutures: empty commitment ID"
            );
            
            // Calculate staggered timestamp: block.timestamp + i * 60 seconds
            uint256 openTimestamp = block.timestamp + (i * POSITION_DURATION);
            
            // Create new position
            Position memory newPosition = Position({
                user: msg.sender,
                amount: amountPerPosition,
                leverage: _leverage,
                openTimestamp: openTimestamp,
                predictionCommitmentId: _predictionCommitmentIds[i],
                isOpen: true,
                pnl: 0,
                actualPriceCommitmentId: "",
                closeTimestamp: 0
            });
            
            // Store position
            uint256 positionId = positionCounter;
            positions[positionId] = newPosition;
            userPositions[msg.sender].push(positionId);
            positionIds[i] = positionId;
            positionCounter++;
            
            // Emit event for each position
            emit PositionOpened(
                positionId,
                msg.sender,
                amountPerPosition,
                _leverage,
                openTimestamp,
                _predictionCommitmentIds[i]
            );
        }
        
        return positionIds;
    }

    /**
     * @notice Close a position (called by PnL server)
     * @param _positionId Position ID to close
     * @param _pnl Calculated PNL in wei (can be negative)
     * @param _actualPriceCommitmentId EigenDA commitment ID for actual prices (full commitment string)
     */
    function closePosition(
        uint256 _positionId,
        int256 _pnl,
        string memory _actualPriceCommitmentId
    ) external onlyPnLServer {
        // Validate position exists
        require(_positionId < positionCounter, "LineFutures: position does not exist");
        
        Position storage position = positions[_positionId];
        
        // Validate position state
        require(position.isOpen, "LineFutures: position already closed");
        require(
            block.timestamp >= position.openTimestamp + POSITION_DURATION,
            "LineFutures: position not yet closable"
        );
        require(bytes(_actualPriceCommitmentId).length > 0, "LineFutures: empty commitment ID");

        // Update position data
        position.pnl = _pnl;
        position.actualPriceCommitmentId = _actualPriceCommitmentId;
        position.isOpen = false;
        position.closeTimestamp = block.timestamp;

        // Calculate fee (only on profits)
        uint256 fee = 0;
        if (_pnl > 0) {
            fee = (uint256(_pnl) * feePercentage) / 10000;
            collectedFees += fee;
        }

        // Calculate final payout
        int256 finalAmount = int256(position.amount) + _pnl - int256(fee);

        // Transfer funds to user if positive
        uint256 transferAmount = 0;
        if (finalAmount > 0) {
            transferAmount = uint256(finalAmount);
            (bool success, ) = payable(position.user).call{value: transferAmount}("");
            require(success, "LineFutures: transfer failed");
        }
        // If finalAmount <= 0, user lost entire deposit (stays in contract)

        emit PositionClosed(
            _positionId,
            position.user,
            _pnl,
            transferAmount,
            _actualPriceCommitmentId,
            block.timestamp
        );
    }

    /**
     * @notice Set the PnL server address
     * @param _server New PnL server address
     */
    function setPnLServer(address _server) external onlyOwner {
        require(_server != address(0), "LineFutures: new server is zero address");
        address oldServer = pnlServer;
        pnlServer = _server;
        emit PnLServerUpdated(oldServer, _server);
    }

    /**
     * @notice Set the fee percentage
     * @param _feePercentage New fee percentage in basis points (max 1000 = 10%)
     */
    function setFeePercentage(uint256 _feePercentage) external onlyOwner {
        require(_feePercentage <= 1000, "LineFutures: fee too high");
        uint256 oldFee = feePercentage;
        feePercentage = _feePercentage;
        emit FeePercentageUpdated(oldFee, _feePercentage);
    }

    /**
     * @notice Withdraw collected fees
     * @param _amount Amount to withdraw
     */
    function withdrawFees(uint256 _amount) external onlyOwner {
        require(_amount <= collectedFees, "LineFutures: insufficient fees");
        collectedFees -= _amount;
        
        (bool success, ) = payable(owner).call{value: _amount}("");
        require(success, "LineFutures: withdrawal failed");
        
        emit FeesWithdrawn(owner, _amount, block.timestamp);
    }

    /**
     * @notice Pause the contract (prevents new positions)
     */
    function pause() external onlyOwner {
        paused = true;
        emit ContractPaused();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        paused = false;
        emit ContractUnpaused();
    }

    /**
     * @notice Emergency withdraw all funds (last resort)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "LineFutures: emergency withdrawal failed");
    }

    /**
     * @notice Get position details
     * @param _positionId Position ID
     * @return Position struct
     */
    function getPosition(uint256 _positionId) external view returns (Position memory) {
        require(_positionId < positionCounter, "LineFutures: position does not exist");
        return positions[_positionId];
    }

    /**
     * @notice Get all position IDs for a user
     * @param _user User address
     * @return Array of position IDs
     */
    function getUserPositions(address _user) external view returns (uint256[] memory) {
        return userPositions[_user];
    }

    /**
     * @notice Check if a position can be closed
     * @param _positionId Position ID
     * @return True if position can be closed
     */
    function canClosePosition(uint256 _positionId) external view returns (bool) {
        if (_positionId >= positionCounter) return false;
        
        Position storage position = positions[_positionId];
        
        return position.isOpen && 
               block.timestamp >= position.openTimestamp + POSITION_DURATION;
    }

    /**
     * @notice Get contract balance
     * @return Contract ETH balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get user statistics
     * @param _user User address
     * @return totalPositions Total number of positions
     * @return openPositions Number of open positions
     * @return closedPositions Number of closed positions
     * @return totalPnl Total PNL across all positions
     */
    function getUserStats(address _user) external view returns (
        uint256 totalPositions,
        uint256 openPositions,
        uint256 closedPositions,
        int256 totalPnl
    ) {
        uint256[] memory userPosIds = userPositions[_user];
        totalPositions = userPosIds.length;
        
        for (uint256 i = 0; i < userPosIds.length; i++) {
            Position storage pos = positions[userPosIds[i]];
            if (pos.isOpen) {
                openPositions++;
            } else {
                closedPositions++;
                totalPnl += pos.pnl;
            }
        }
        
        return (totalPositions, openPositions, closedPositions, totalPnl);
    }
}

