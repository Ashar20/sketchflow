// Import address: account where PriceOracle is deployed (same as LineFutures when co-deployed).
import PriceOracle from 0x168a31e4dc7d31f1

transaction() {
    prepare(signer: auth(Storage) &Account) {
        if signer.storage.borrow<&PriceOracle.Admin>(from: /storage/sketchflowPriceOracleAdmin) != nil {
            return
        }
        let admin <- PriceOracle.createAdmin()
        signer.storage.save(<-admin, to: /storage/sketchflowPriceOracleAdmin)
    }
}
