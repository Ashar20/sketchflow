import FungibleToken from 0xee82856bf20e2aa6
import FlowToken from 0x0ae53cb6e3f42a79

/// Emulator build — same as `cadence/contracts/LineFutures.cdc` with core-contract addresses for local emulator.
access(all) contract LineFutures {

    access(all) let MIN_AMOUNT: UFix64
    access(all) let MAX_LEVERAGE: UInt16
    access(all) let POSITION_DURATION: UFix64

    access(all) event PositionOpened(
        positionId: UInt64,
        user: Address,
        amount: UFix64,
        leverage: UInt16,
        timestamp: UFix64,
        predictionCommitmentId: String
    )

    access(all) event PositionClosed(
        positionId: UInt64,
        user: Address,
        pnl: Fix64,
        finalAmount: UFix64,
        actualPriceCommitmentId: String,
        timestamp: UFix64
    )

    access(all) event FeesWithdrawn(owner: Address, amount: UFix64, timestamp: UFix64)
    access(all) event FeePercentageUpdated(oldFee: UInt64, newFee: UInt64)
    access(all) event ContractPaused()
    access(all) event ContractUnpaused()

    access(all) struct Position {
        access(all) let user: Address
        access(all) let amount: UFix64
        access(all) let leverage: UInt16
        access(all) let openTimestamp: UFix64
        access(all) let predictionCommitmentId: String
        access(all) let isOpen: Bool
        access(all) let pnl: Fix64
        access(all) let actualPriceCommitmentId: String
        access(all) let closeTimestamp: UFix64

        init(
            user: Address,
            amount: UFix64,
            leverage: UInt16,
            openTimestamp: UFix64,
            predictionCommitmentId: String,
            isOpen: Bool,
            pnl: Fix64,
            actualPriceCommitmentId: String,
            closeTimestamp: UFix64
        ) {
            self.user = user
            self.amount = amount
            self.leverage = leverage
            self.openTimestamp = openTimestamp
            self.predictionCommitmentId = predictionCommitmentId
            self.isOpen = isOpen
            self.pnl = pnl
            self.actualPriceCommitmentId = actualPriceCommitmentId
            self.closeTimestamp = closeTimestamp
        }
    }

    access(all) struct UserStats {
        access(all) let totalPositions: UInt64
        access(all) let openPositions: UInt64
        access(all) let closedPositions: UInt64
        access(all) let totalPnl: Fix64

        init(totalPositions: UInt64, openPositions: UInt64, closedPositions: UInt64, totalPnl: Fix64) {
            self.totalPositions = totalPositions
            self.openPositions = openPositions
            self.closedPositions = closedPositions
            self.totalPnl = totalPnl
        }
    }

    access(contract) var positions: {UInt64: Position}
    access(contract) var userPositionIds: {Address: [UInt64]}
    access(contract) var positionCounter: UInt64
    access(contract) var treasury: @{FungibleToken.Vault}
    access(contract) var owner: Address
    access(contract) var feePercentage: UInt64
    access(contract) var collectedFees: UFix64
    access(contract) var paused: Bool

    access(all) resource OwnerAdmin {
        access(all) fun setPaused(p: Bool) {
            LineFutures.paused = p
            if p {
                emit ContractPaused()
            } else {
                emit ContractUnpaused()
            }
        }

        access(all) fun setFeePercentage(bps: UInt64) {
            if bps > 1000 {
                panic("fee bps must be <= 1000")
            }
            let old = LineFutures.feePercentage
            LineFutures.feePercentage = bps
            emit FeePercentageUpdated(oldFee: old, newFee: bps)
        }

        access(all) fun withdrawFees(amount: UFix64) {
            if amount > LineFutures.collectedFees {
                panic("amount exceeds collected fees")
            }
            LineFutures.collectedFees = LineFutures.collectedFees - amount
            let ownerAddr = LineFutures.owner
            let payment <- LineFutures.treasury.withdraw(amount: amount)
            let recv = getAccount(ownerAddr).capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                ?? panic("owner has no flow receiver")
            recv.deposit(from: <-payment)
            emit FeesWithdrawn(owner: ownerAddr, amount: amount, timestamp: getCurrentBlock().timestamp)
        }

        access(all) fun emergencyWithdraw() {
            let bal = LineFutures.treasury.balance
            let payment <- LineFutures.treasury.withdraw(amount: bal)
            let recv = getAccount(LineFutures.owner).capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                ?? panic("owner has no flow receiver")
            recv.deposit(from: <-payment)
        }
    }

    access(all) resource PnlOperator {
        access(all) fun closePosition(positionId: UInt64, pnl: Fix64, actualPriceCommitmentId: String) {
            LineFutures._closePosition(
                positionId: positionId,
                pnl: pnl,
                actualPriceCommitmentId: actualPriceCommitmentId
            )
        }
    }

    access(all) fun createOwnerAdmin(): @OwnerAdmin {
        return <- create OwnerAdmin()
    }

    access(all) fun createPnlOperator(): @PnlOperator {
        return <- create PnlOperator()
    }

    access(all) fun openPosition(
        user: Address,
        payment: @{FungibleToken.Vault},
        leverage: UInt16,
        predictionCommitmentId: String
    ): UInt64 {
        if LineFutures.paused {
            panic("contract is paused")
        }
        if payment.balance < LineFutures.MIN_AMOUNT {
            panic("below MIN_AMOUNT")
        }
        if leverage < 1 || leverage > LineFutures.MAX_LEVERAGE {
            panic("invalid leverage")
        }
        if predictionCommitmentId.length == 0 {
            panic("empty commitment")
        }

        let amount = payment.balance
        LineFutures.treasury.deposit(from: <-payment)

        let id = LineFutures.positionCounter
        LineFutures.positionCounter = id + 1

        let ts = getCurrentBlock().timestamp
        LineFutures.positions[id] = Position(
            user: user,
            amount: amount,
            leverage: leverage,
            openTimestamp: ts,
            predictionCommitmentId: predictionCommitmentId,
            isOpen: true,
            pnl: Fix64(0.0),
            actualPriceCommitmentId: "",
            closeTimestamp: 0.0
        )

        LineFutures.appendUserPosition(user: user, positionId: id)

        emit PositionOpened(
            positionId: id,
            user: user,
            amount: amount,
            leverage: leverage,
            timestamp: ts,
            predictionCommitmentId: predictionCommitmentId
        )

        return id
    }

    access(all) fun batchOpenPositions(
        user: Address,
        payment: @{FungibleToken.Vault},
        leverage: UInt16,
        predictionCommitmentIds: [String]
    ): [UInt64] {
        let nInt = predictionCommitmentIds.length
        if LineFutures.paused {
            panic("contract is paused")
        }
        if nInt < 1 || nInt > 5 {
            panic("batch size must be 1-5")
        }
        if leverage < 1 || leverage > LineFutures.MAX_LEVERAGE {
            panic("invalid leverage")
        }

        let n = UInt64(nInt)
        let nUF = UFix64(n)
        let totalBal = payment.balance
        let per = totalBal / nUF
        if totalBal < LineFutures.MIN_AMOUNT * nUF {
            panic("total below MIN_AMOUNT * n")
        }
        if per < LineFutures.MIN_AMOUNT {
            panic("per-leg below MIN_AMOUNT")
        }

        let remainder = totalBal - per * nUF
        if remainder > 0.0 {
            let ref <- payment.withdraw(amount: remainder)
            let recv = getAccount(user).capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                ?? panic("user has no flow receiver")
            recv.deposit(from: <-ref)
        }

        LineFutures.treasury.deposit(from: <-payment)

        var ids: [UInt64] = []
        var i: UInt64 = 0
        let baseTs = getCurrentBlock().timestamp

        while i < n {
            let cid = predictionCommitmentIds[Int(i)]
            if cid.length == 0 {
                panic("empty commitment ID")
            }
            let id = LineFutures.positionCounter
            LineFutures.positionCounter = id + 1
            let openTs = baseTs + LineFutures.POSITION_DURATION * UFix64(i)
            LineFutures.positions[id] = Position(
                user: user,
                amount: per,
                leverage: leverage,
                openTimestamp: openTs,
                predictionCommitmentId: cid,
                isOpen: true,
                pnl: Fix64(0.0),
                actualPriceCommitmentId: "",
                closeTimestamp: 0.0
            )
            LineFutures.appendUserPosition(user: user, positionId: id)
            emit PositionOpened(
                positionId: id,
                user: user,
                amount: per,
                leverage: leverage,
                timestamp: openTs,
                predictionCommitmentId: cid
            )
            ids.append(id)
            i = i + 1
        }

        return ids
    }

    access(contract) fun appendUserPosition(user: Address, positionId: UInt64) {
        if let existing = self.userPositionIds[user] {
            var arr = existing
            arr.append(positionId)
            self.userPositionIds[user] = arr
        } else {
            self.userPositionIds[user] = [positionId]
        }
    }

    access(contract) fun _closePosition(positionId: UInt64, pnl: Fix64, actualPriceCommitmentId: String) {
        let pos = self.positions[positionId] ?? panic("position does not exist")
        if pos.isOpen == false {
            panic("position not open")
        }
        if getCurrentBlock().timestamp < pos.openTimestamp + self.POSITION_DURATION {
            panic("too early to close")
        }
        if actualPriceCommitmentId.length == 0 {
            panic("empty actual commitment")
        }

        var fee: UFix64 = 0.0
        if pnl > Fix64(0.0) {
            let pnlU = UFix64(pnl)
            fee = pnlU * UFix64(self.feePercentage) / UFix64(10000)
            self.collectedFees = self.collectedFees + fee
        }

        let principal = Fix64(pos.amount)
        let finalFix = principal + pnl - Fix64(fee)

        var payout: UFix64 = 0.0
        if finalFix > Fix64(0.0) {
            payout = UFix64(finalFix)
            let payment <- self.treasury.withdraw(amount: payout)
            let recv = getAccount(pos.user).capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
                ?? panic("user has no flow receiver")
            recv.deposit(from: <-payment)
        }

        let closed = Position(
            user: pos.user,
            amount: pos.amount,
            leverage: pos.leverage,
            openTimestamp: pos.openTimestamp,
            predictionCommitmentId: pos.predictionCommitmentId,
            isOpen: false,
            pnl: pnl,
            actualPriceCommitmentId: actualPriceCommitmentId,
            closeTimestamp: getCurrentBlock().timestamp
        )
        self.positions[positionId] = closed

        emit PositionClosed(
            positionId: positionId,
            user: pos.user,
            pnl: pnl,
            finalAmount: payout,
            actualPriceCommitmentId: actualPriceCommitmentId,
            timestamp: getCurrentBlock().timestamp
        )
    }

    access(all) fun getPosition(positionId: UInt64): Position {
        return self.positions[positionId] ?? panic("position does not exist")
    }

    access(all) fun getUserPositions(user: Address): [UInt64] {
        return self.userPositionIds[user] ?? []
    }

    access(all) fun canClosePosition(positionId: UInt64): Bool {
        if let p = self.positions[positionId] {
            return p.isOpen && getCurrentBlock().timestamp >= p.openTimestamp + self.POSITION_DURATION
        }
        return false
    }

    access(all) fun getContractBalance(): UFix64 {
        return self.treasury.balance
    }

    access(all) fun getPositionCounter(): UInt64 {
        return self.positionCounter
    }

    access(all) fun getPaused(): Bool {
        return self.paused
    }

    access(all) fun getOwner(): Address {
        return self.owner
    }

    access(all) fun getFeePercentage(): UInt64 {
        return self.feePercentage
    }

    access(all) fun getCollectedFees(): UFix64 {
        return self.collectedFees
    }

    access(all) fun getUserStats(user: Address): UserStats {
        let ids = self.userPositionIds[user] ?? []
        let total = UInt64(ids.length)
        var openP: UInt64 = 0
        var closedP: UInt64 = 0
        var totalPnl = Fix64(0.0)
        for id in ids {
            let p = self.positions[id]!
            if p.isOpen {
                openP = openP + 1
            } else {
                closedP = closedP + 1
                totalPnl = totalPnl + p.pnl
            }
        }
        return UserStats(
            totalPositions: total,
            openPositions: openP,
            closedPositions: closedP,
            totalPnl: totalPnl
        )
    }

    init() {
        self.MIN_AMOUNT = 0.001
        self.MAX_LEVERAGE = 2500
        self.POSITION_DURATION = 60.0
        self.positions = {}
        self.userPositionIds = {}
        self.positionCounter = 0
        self.treasury <- FlowToken.createEmptyVault(vaultType: Type<@FlowToken.Vault>()) as! @FlowToken.Vault
        self.owner = self.account.address
        self.feePercentage = 200
        self.collectedFees = 0.0
        self.paused = false
    }
}
