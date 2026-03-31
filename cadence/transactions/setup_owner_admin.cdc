// Import address: account where LineFutures is deployed.
import LineFutures from 0x0000000000000001

transaction() {
    prepare(signer: auth(Storage) &Account) {
        if signer.storage.borrow<&LineFutures.OwnerAdmin>(from: /storage/sketchflowOwnerAdmin) != nil {
            return
        }
        let admin <- LineFutures.createOwnerAdmin()
        signer.storage.save(<-admin, to: /storage/sketchflowOwnerAdmin)
    }
}
