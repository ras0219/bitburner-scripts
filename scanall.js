// scanall.script

const SPECIALS = ["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z", "The-Cave", "w0r1d_d43m0n"]

export async function main(ns) {
    var scanned = { "home": "" }
    var to_scan = ["home"]
    var print_str = "%-18s%-5s%-5s%-8s%-18s"

    var myhacklvl = ns.getHackingLevel()
    ns.tprint(sprintf(print_str, "Host", "Root", "RAM", "Lvl", "$k/t"))

    while (to_scan.length > 0) {
        var host = to_scan.pop()
        var names = ns.scan(host, true)
        var ips = ns.scan(host, false)
        for (var i = 0; i < names.length; ++i) {
            var name = names[i]
            if (!(name in scanned)) {
                //growth in $$$/time = 
                // ((1 + 0.03 / d ) ^ (growth$percall / 100)) / getGrowTime * MaxMoney
                var minsec = ns.getServerMinSecurityLevel(name)
                var cursec = ns.getServerSecurityLevel(name)
                var hacklvl = ns.getServerRequiredHackingLevel(name)
                var first_part = Math.min(1 + 0.03 / hacklvl, 1.0035)
                var making_money = Math.pow(first_part, ns.getServerGrowth(name) / 100)
                making_money = making_money / (ns.getGrowTime(name) * minsec / cursec) * ns.getServerMaxMoney(name)
                making_money = Math.floor(making_money / 1000)
                scanned[name] = host
                to_scan.push(name)
                var hasroot = ns.hasRootAccess(name)
                if (!hasroot && myhacklvl >= hacklvl) {
                    if (ns.fileExists("BruteSSH.exe")) {
                        ns.brutessh(name)
                    }
                    if (ns.fileExists("FTPCrack.exe")) {
                        ns.ftpcrack(name)
                    }
                    if (ns.fileExists("relaySMTP.exe")) {
                        ns.relaysmtp(name)
                    }
                    if (ns.fileExists("HTTPWorm.exe")) {
                        ns.httpworm(name)
                    }
                    if (ns.fileExists("SQLInject.exe")) {
                        ns.sqlinject(name)
                    }
                    try {
                        ns.nuke(name)
                    } catch (e) {}
                    hasroot = ns.hasRootAccess(name)
                }
                var root = hasroot ? "Y" : "N"
                ns.tprint(sprintf(print_str, name, root, ns.getServerRam(name)[0], hacklvl, making_money))
            }
        }
    }

    function path(n) {
        if (n == "home") {
            return "home"
        }
        if (n in scanned) {
            return path(scanned[n]) + ";connect " + n
        }
        return n
    }
    for (var s in SPECIALS) {
        ns.tprint(path(SPECIALS[s]))
    }
}
