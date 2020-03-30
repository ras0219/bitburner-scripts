// manage4.ns
import { argparse, argparse_help } from "argparse.ns";

function loadcfg(ns, config) {
    var cfg = JSON.parse(ns.read(config))
    if (!cfg.tmp_path) {
        throw ".tmp_path must be specified (recommended: '/tmp')"
    }
    if (!cfg.growratio) {
        throw ".growratio must be specified (recommended: 2)"
    }
    if (!cfg.targets) {
        throw ".targets must be specified as array of hostname/ip"
    }
    return cfg
}

export async function main(ns) {
    var schema = {
        "$positional": ["config"],
        "config": { "required": true },
    }

    var pargs = argparse(ns, schema)

    var memoized_hacklvl = {}

    function get_hack_level(s) {
        if (!(s in memoized_hacklvl)) {
            memoized_hacklvl[s] = ns.getServerRequiredHackingLevel(s)
        }
        return memoized_hacklvl[s]
    }
    var memoized_minsec = {}

    function get_minsec(s) {
        if (!(s in memoized_minsec)) {
            memoized_minsec[s] = ns.getServerMinSecurityLevel(s)
        }
        return memoized_minsec[s]
    }

    var time_to_load_config = 0
    var jobs = {}
    do {
        var cur_time = ns.getTimeSinceLastAug()
        var my_hacklvl = ns.getHackingLevel()

        if (cur_time > time_to_load_config) {
            if (!ns.fileExists(pargs.config)) {
                ns.tprint("Cannot read config file: " + pargs.config)
                await ns.sleep(5000)
                continue
            }

            try {
                var cfg = loadcfg(ns, pargs.config)
                var servers = cfg.servers
                var tmp_path = cfg.tmp_path
                var growratio = cfg.growratio
                var use_targets = cfg.use_targets || false
                var home_reserve = cfg.home_reservation
            } catch (e) {
                ns.tprint("Failed: " + e)
                await ns.sleep(5000)
                continue
            }
            time_to_load_config = cur_time + 10000

            var sc_hack = tmp_path + "/hack.ns"
            var sc_grow = tmp_path + "/grow.ns"
            var sc_weak = tmp_path + "/weak.ns"
            if (!ns.fileExists(sc_hack)) {
                ns.write(sc_hack, "export async function main(ns) { await ns.hack(ns.args[0]); }", "w")
            }
            if (!ns.fileExists(sc_grow)) {
                ns.write(sc_grow, "export async function main(ns) { await ns.grow(ns.args[0]); }", "w")
            }
            if (!ns.fileExists(sc_weak)) {
                ns.write(sc_weak, "export async function main(ns) { await ns.weaken(ns.args[0]); }", "w")
            }
        }

        var ramlimits = {}
        if (home_reserve !== undefined) {
            var gsr = ns.getServerRam("home")
            ramlimits.home = Math.max(gsr[0] - gsr[1] - home_reserve, 0)
        }
        if (cfg.servers) {
            for (var k in cfg.servers) {
                var v = cfg.servers[k]
                var gsr = ns.getServerRam(v)
                ramlimits[v] = gsr[0] - gsr[1]
            }
        }
        for (var k in cfg.targets) {
            var target = cfg.targets[k]
            if (!(target in jobs)) {
                jobs[target] = { "state": "idle" }
            }
            if (use_targets && ns.hasRootAccess(target)) {
                var gsr = ns.getServerRam(target)
                ramlimits[target] = gsr[0] - gsr[1]
            }
        }
        for (var target in jobs) {
            var job = jobs[target]
            if (job.state == "running") {
                if (job.completedAt < cur_time) {
                    job.state = "idle"
                }
            }
        }

        function get_ram_avail() {
            var r = 0
            for (var k in ramlimits) {
                r = Math.max(r, ramlimits[k])
            }
            return r
        }

        function select_server(ram) {
            var r = 1e30
            var s = undefined
            for (var k in ramlimits) {
                if (ramlimits[k] >= ram && r > ramlimits[k]) {
                    r = ramlimits[k]
                    s = k
                }
            }
            return s
        }

        for (var k in cfg.targets) {
            var target = cfg.targets[k]
            var job = jobs[target]
            if (job.state == "running") {
                continue
            }
            if (!ns.hasRootAccess(target)) {
                if (my_hacklvl < get_hack_level(target)) {
                    continue
                }
                if (ns.fileExists("BruteSSH.exe")) {
                    ns.brutessh(target)
                }
                if (ns.fileExists("FTPCrack.exe")) {
                    ns.ftpcrack(target)
                }
                if (ns.fileExists("relaySMTP.exe")) {
                    ns.relaysmtp(target)
                }
                if (ns.fileExists("HTTPWorm.exe")) {
                    ns.httpworm(target)
                }
                if (ns.fileExists("SQLInject.exe")) {
                    ns.sqlinject(target)
                }
                try {
                    ns.nuke(target)
                } catch (e) {}
                if (!ns.hasRootAccess(target)) {
                    continue
                }
            }

            var ram_avail = get_ram_avail()

            var minsec = get_minsec(target)
            var cursec = ns.getServerSecurityLevel(target)
            var maxmon = ns.getServerMaxMoney(target)
            var curmon = ns.getServerMoneyAvailable(target)
            var mode
            // determine mode based on current target stats
            if (cursec > minsec) {
                mode = "weaken"
            } else if (curmon < maxmon) {
                mode = "grow"
            } else {
                mode = "hack"
            }
            var th_grow = Math.ceil(ns.growthAnalyze(target, growratio))
            var effgr = growratio
            var old_th_grow = th_grow
            var headroom = mode == "hack" ? 0.6 : 0.9
            if (cfg.hack_during_grow && mode == "grow") {
                headroom = 0.75
            }
            th_grow = Math.min(th_grow, Math.floor(ram_avail * headroom / ns.getScriptRam(sc_grow)))
            effgr = Math.pow(growratio, th_grow / old_th_grow)
            if (mode == "weaken") {
                th_grow = 0
            }
            var hack_money = curmon * (effgr - 1) / effgr
            var th_hack = Math.floor(ns.hackAnalyzeThreads(target, hack_money))
            if (cfg.hack_during_grow && mode == "grow") {
                th_hack = Math.floor(th_hack / 2)
            } else if (mode != "hack") {
                th_hack = 0
            }
            var th_weak = Math.ceil((th_hack * 0.002 + th_grow * 0.004) / 0.05)
            if (mode == "weaken") {
                th_weak = Math.ceil((cursec - minsec) / 0.05)
                th_weak = Math.min(th_weak, Math.floor(ram_avail / ns.getScriptRam(sc_weak)))
            }
            var ram_hack = th_hack * ns.getScriptRam(sc_hack)
            var ram_grow = th_grow * ns.getScriptRam(sc_grow)
            var ram_weak = th_weak * ns.getScriptRam(sc_weak)
            var req_ram = ram_hack + ram_grow + ram_weak

            ns.print(">>> Required RAM: " + req_ram + " (" + [ram_hack, ram_grow, ram_weak] + ")")

            if (ram_avail < req_ram || th_weak == 0) {
                ns.print("INSUFFICIENT RAM FOR " + target + ", avail=" + ram_avail)
                continue
            }
            var server = select_server(req_ram)
            ramlimits[server] -= req_ram
            job.state = "running"
            job.server = server

            if (server != "home") {
                ns.scp([sc_hack, sc_grow, sc_weak], server)
            }

            if (0 === ns.exec(sc_weak, server, th_weak, target)) {
                ns.tprint("Failed to exec weak")
                return
            }
            if (th_grow > 0 && 0 === ns.exec(sc_grow, server, th_grow, target)) {
                ns.tprint("Failed to exec grow")
                return
            }
            if (th_hack > 0 && 0 === ns.exec(sc_hack, server, th_hack, target)) {
                ns.tprint("Failed to exec hack")
                return
            }
            var regex = new RegExp("in ([\\d\\.,]+) seconds")
            var time = -1.0
            for (var i = 0; i < 20; ++i) {
                var logs = ns.getScriptLogs(sc_weak, server, target)
                for (var k in logs) {
                    var log = logs[k]
                    var match = regex.exec(log)
                    if (match) {
                        var s = match[1].replace(/,/g, '')
                        time = Math.ceil(s * 1000)
                        break;
                    }
                }
                if (time > 0) break;
                await ns.sleep(200)
            }
            if (time < 0) {
                ns.tprint("Failed to parse time from weaken logs for " + target)
                return
            }
            job.completedAt = ns.getTimeSinceLastAug() + time + 500
            if (th_hack > 0) {
                ns.print(sprintf(">>> Money rate for %20s: $/s = %1.2e    $/GBs = %1.2e",
                    target,
                    hack_money * 1000 / time,
                    hack_money * 1000 / time / req_ram))
            }
        }
        var sleep_until = time_to_load_config
        for (var target in jobs) {
            var job = jobs[target]
            if (job.state == "running") {
                sleep_until = Math.min(sleep_until, job.completedAt + 500)
            }
        }
        var n = sleep_until - ns.getTimeSinceLastAug()
        if (n > 500) {
            await ns.sleep(n + 500)
        } else {
            await ns.sleep(1000)
        }
    }
    while (true)
}
