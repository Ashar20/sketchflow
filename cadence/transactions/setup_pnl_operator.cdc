// Import address: account where LineFutures is deployed.
import LineFutures from 0x168a31e4dc7d31f1

transaction() {
    prepare(signer: auth(Storage) &Account) {
        if signer.storage.borrow<&LineFutures.PnlOperator>(from: /storage/sketchflowPnlOperator) != nil {
            return
        }
        let op <- LineFutures.createPnlOperator()
        signer.storage.save(<-op, to: /storage/sketchflowPnlOperator)
    }
}
