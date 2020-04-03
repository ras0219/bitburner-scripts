export async function main(ns) {
    try {
        while (true) {
            await ns.weaken(ns.args[0])
        }
    } catch (e) {}
}
