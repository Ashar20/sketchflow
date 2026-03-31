// Replace LineFutures import address after deploy (see scripts/sync-flow-cadence-address.mjs).
// Emulator FT: 0xee82856bf20e2aa6 / 0x0ae53cb6e3f42a79
import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import LineFutures from 0x0000000000000001

transaction(
    leverage: UInt16,
    predictionCommitmentIds: [String],
    amount: UFix64
) {
    prepare(signer: auth(Storage) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("No FlowToken vault")
        if vaultRef.balance < amount {
            panic("Insufficient FLOW balance")
        }
        let payment <- vaultRef.withdraw(amount: amount)
        LineFutures.batchOpenPositions(
            user: signer.address,
            payment: <-payment,
            leverage: leverage,
            predictionCommitmentIds: predictionCommitmentIds
        )
    }
}
