/// EigenDA / DA commitment references keyed by minute-boundary timestamps (unix seconds).
/// Writes go through an Admin resource stored on the operator account (same pattern as a gated submitter EOA on EVM).
access(all) contract PriceOracle {

    access(all) event CommitmentStored(windowStart: UInt64, commitment: String, timestamp: UFix64)

    access(contract) var commitments: {UInt64: String}
    access(contract) var latestWindow: UInt64
    /// Sorted insertion on store for range queries (testnet-scale; production would index off-chain).
    access(contract) var windowStarts: [UInt64]

    access(all) resource Admin {
        access(all) fun storeCommitment(windowStart: UInt64, commitment: String) {
            PriceOracle.commitments[windowStart] = commitment
            PriceOracle.insertSorted(windowStart: windowStart)
            if windowStart > PriceOracle.latestWindow {
                PriceOracle.latestWindow = windowStart
            }
            emit CommitmentStored(
                windowStart: windowStart,
                commitment: commitment,
                timestamp: getCurrentBlock().timestamp
            )
        }
    }

    access(contract) fun insertSorted(windowStart: UInt64) {
        if self.windowStarts.length == 0 {
            self.windowStarts.append(windowStart)
            return
        }
        var i = 0
        while i < self.windowStarts.length {
            if self.windowStarts[i] == windowStart {
                return
            }
            if self.windowStarts[i] > windowStart {
                self.windowStarts.insert(at: i, windowStart)
                return
            }
            i = i + 1
        }
        self.windowStarts.append(windowStart)
    }

    access(all) fun createAdmin(): @Admin {
        return <- create Admin()
    }

    access(all) view fun getCommitment(windowStart: UInt64): String {
        return self.commitments[windowStart] ?? ""
    }

    access(all) view fun getLatestWindow(): UInt64 {
        return self.latestWindow
    }

    access(all) view fun getWindowCount(): UInt64 {
        return UInt64(self.windowStarts.length)
    }

    access(all) fun getWindowsInRange(start: UInt64, end: UInt64): [UInt64] {
        var out: [UInt64] = []
        for w in self.windowStarts {
            if w >= start && w <= end {
                out.append(w)
            }
        }
        return out
    }

    init() {
        self.commitments = {}
        self.latestWindow = 0
        self.windowStarts = []
    }
}
