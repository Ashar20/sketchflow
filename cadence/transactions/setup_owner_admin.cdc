// Import address: account where LineFutures is deployed.
import LineFutures from 0x168a31e4dc7d31f1

transaction() {
    prepare(signer: auth(Storage) &Account) {
        if signer.storage.borrow<&LineFutures.OwnerAdmin>(from: /storage/sketchflowOwnerAdmin) != nil {
            return
        }
        let admin <- LineFutures.createOwnerAdmin()
        signer.storage.save(<-admin, to: /storage/sketchflowOwnerAdmin)
    }
}
