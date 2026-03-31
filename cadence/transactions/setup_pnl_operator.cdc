// Import address: account where LineFutures is deployed.
import LineFutures from 0x0000000000000001

transaction() {
    prepare(signer: auth(Storage) &Account) {
        if signer.storage.borrow<&LineFutures.PnlOperator>(from: /storage/sketchflowPnlOperator) != nil {
            return
        }
        let op <- LineFutures.createPnlOperator()
        signer.storage.save(<-op, to: /storage/sketchflowPnlOperator)
    }
}
