// Before sending: replace 0x0000000000000001 with your deployed LineFutures address (testnet/mainnet).
// Testnet core: FungibleToken 0x9a0766d93b6608b7, FlowToken 0x7e60df042a9c0868
import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import LineFutures from 0x0000000000000001

transaction(
    leverage: UInt16,
    predictionCommitmentId: String,
    amount: UFix64
) {
    prepare(signer: AuthAccount) {
        let vaultRef = signer.borrow<&FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("No FlowToken vault")
        if vaultRef.balance < amount {
            panic("Insufficient FLOW balance")
        }
        let payment <- vaultRef.withdraw(amount: amount)
        LineFutures.openPosition(
            user: signer.address,
            payment: <-payment,
            leverage: leverage,
            predictionCommitmentId: predictionCommitmentId
        )
    }
}
