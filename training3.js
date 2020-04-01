export async function main(ns) {
    if (!ns.hasRootAccess(ns.args[0])) {
        await ns.sleep(10000)
        return
    }
    for (var i = 0; i < ns.args[1]; ++i) {
        await ns.weaken(ns.args[0])
    }
}