// manage4.ns
import { argparse } from "argparse.ns";

var global_filler_id = Math.floor(Math.random() * 10000000)

function loadcfg(ns, config) {
    var cfg = JSON.parse(ns.read(config))
    if (!cfg.tmp_path) {
        throw ".tmp_path must be specified (recommended: '/tmp')"
    }
    if (!cfg.targets) {
        throw ".targets must be specified as array of hostname/ip"
    }
    if (!cfg.hackratio) {
        cfg.hackratio = 8
    }
    cfg.sc_hack = cfg.sc_hack || cfg.tmp_path + "/hack.ns"
    cfg.sc_grow = cfg.sc_grow || cfg.tmp_path + "/grow.ns"
    cfg.sc_weak = cfg.sc_weak || cfg.tmp_path + "/weak.ns"
    if (!ns.fileExists(cfg.sc_hack)) {
        ns.write(cfg.sc_hack, "export async function main(ns) { await ns.hack(ns.args[0]); }", "w")
    }
    if (!ns.fileExists(cfg.sc_grow)) {
        ns.write(cfg.sc_grow, "export async function main(ns) { await ns.grow(ns.args[0]); }", "w")
    }
    if (!ns.fileExists(cfg.sc_weak)) {
        ns.write(cfg.sc_weak, "export async function main(ns) { await ns.weaken(ns.args[0]); }", "w")
    }
    return cfg
}
const PURCHASE_NAME = "AUTOSERVER"

function buy_biggest_server(ns, server_list) {
    var money_available = ns.getServerMoneyAvailable("home") - 1000000
    // note we check game to see if we have max server, not our app
    // cost per 1GB is 55k, so money_available / 55k =>num of cores we can get, and we need to round down to pow of 2
    var largest_memory_buyable = (Math.pow(2, Math.floor(Math.log(money_available / 55000) / Math.log(2))))
    if (largest_memory_buyable > ns.getPurchasedServerMaxRam()) {
        largest_memory_buyable = ns.getPurchasedServerMaxRam()
    }
    var new_server = ns.purchaseServer(PURCHASE_NAME, largest_memory_buyable)
    if (new_server !== "") {
        var new_server_object = { server_ram: largest_memory_buyable, state: "idle", waiting_to_sell: false }
        server_list.set(new_server, new_server_object)
    } else {
        ns.tprint("New server purchase failed: ns.purchaseServer(" + PURCHASE_NAME + ", " + largest_memory_buyable + ")")
    }
    return;
}

/// SERVER:
///    server_ram: TOTAL_RAM
///    state: busy, idle, 
///    WAITING_TO_SELL: true, false
// Figures out if we can BUY MORE AND BETTER SERVERS
function manage_servers(ns, server_list) {
    var money_available = ns.getServerMoneyAvailable("home") - 1000000
    if (money_available <= 1000000) {
        // early game, return if less then 1M (+1mil/server)
        return
    }

    // first we check if we are trying to sell a server, and what's the smallest server is.
    var smallest_ram = 1e50
    var smallest_server = ""

    for (var best_server of server_list) {
        if (best_server[1].server_ram < smallest_ram) {
            smallest_ram = best_server[1].server_ram
            smallest_server = best_server[0]
        }
    }

    if (smallest_server !== "") {
        if (server_list.get(smallest_server).waiting_to_sell === true) {
            var able_to_sell = ns.deleteServer(smallest_server)
            if (able_to_sell === false) {
                // we need to wait for that zombie to die first, can't do anything with it zombie
                return
            }
            ns.print("Success deleting + " + smallest_server)
            server_list.delete(smallest_server)
        }
    }

    if (smallest_server === "") {
        // if we have no servers then buy largest server we can
        buy_biggest_server(ns, server_list)
        return
    }
    // next we check what the smallest ram server cost.
    // if our money is <2x the smallest ram server cost we do nothing
    if (ns.getPurchasedServerCost(smallest_ram * 2) > money_available) {
        return
    }

    //next we check if we CAN just buy a bigger server
    if (ns.getPurchasedServers().length < (ns.getPurchasedServerLimit() - 2)) {
        buy_biggest_server(ns, server_list)
        return
    }
    ns.print("Asking system to delete + " + smallest_server)

    if (smallest_ram == ns.getPurchasedServerMaxRam()) {
        return
    }
    // if not we need to DELETE the smallest server 
    server_list.get(smallest_server).waiting_to_sell = true
}

function detect_existing_servers(ns) {
    var owned_servers = new Map() //string as name, object as value

    var servers_bought = ns.getPurchasedServers()
    for (var one_server of servers_bought) {
        if (one_server.substring(0, PURCHASE_NAME.length) == PURCHASE_NAME) {
            var a = ns.getServerRam(one_server)[0]
            var new_server_object = { "server_ram": a, "state": "idle", "waiting_to_sell": false }
            owned_servers.set(one_server, new_server_object)
            ns.killall(one_server)
        }
    }

    return owned_servers
}

var memoized_hacklvl = {}
function get_hack_level(ns, s) {
    if (!(s in memoized_hacklvl)) {
        memoized_hacklvl[s] = ns.getServerRequiredHackingLevel(s)
    }
    return memoized_hacklvl[s]
}

var memoized_minsec = {}
function get_minsec(ns, s) {
    if (!(s in memoized_minsec)) {
        memoized_minsec[s] = ns.getServerMinSecurityLevel(s)
    }
    return memoized_minsec[s]
}

var memoized_maxmon = {}
function get_maxmon(ns, s) {
    if (!(s in memoized_maxmon)) {
        memoized_maxmon[s] = ns.getServerMaxMoney(s)
    }
    return memoized_maxmon[s]
}

function try_get_root_access(ns, target, my_hacklvl) {
    if (!ns.hasRootAccess(target)) {
        if (my_hacklvl < get_hack_level(ns, target)) {
            return false
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
        return ns.hasRootAccess(target)
    }
    return true
}

function RootAccessor(ns) {
    this.ns = ns
    this.mylevel = this.ns.getHackingLevel()
    this.accessed = {}
}

RootAccessor.prototype.try_access = function(target) {
    if (!(target in this.accessed)) {
        this.accessed[target] = try_get_root_access(this.ns, target, this.mylevel)
    }
    return this.accessed[target]
}

function ServerManager(ns) {
    this.ns = ns
    this.servers = {}
}

const CANCEL_ARGUMENT = "CANCEL"

ServerManager.prototype.check_servers = function(cfg, rootaccessor) {
    this.servers = {}
    if (cfg.home_reserve !== undefined) {
        var gsr = this.ns.getServerRam("home")
        this.servers.home = {
            "ramlimit": Math.max(gsr[0] - gsr[1] - cfg.home_reserve, 0),
            "maxram": Math.max(gsr[0] - cfg.home_reserve, 0)
        }
    }
    if (cfg.manage_server_prefix) {
        this.buysell_servers(cfg)
    }
    if (cfg.servers) {
        for (var k in cfg.servers) {
            try {
                var v = cfg.servers[k]
                if (rootaccessor.try_access(v)) {
                    var gsr = this.ns.getServerRam(v)
                    this.servers[v] = {
                        "ramlimit": gsr[0] - gsr[1],
                        "maxram": gsr[0]
                    }
                }
            } catch (e) { /* This handles the case when the server does not exist */ }
        }
    }
    if (cfg.use_targets) {
        for (var k in cfg.targets) {
            var target = cfg.targets[k]
            if (rootaccessor.try_access(target)) {
                var gsr = this.ns.getServerRam(target)
                this.servers[target] = {
                    "ramlimit": gsr[0] - gsr[1],
                    "maxram": gsr[0]
                }
            }
        }
    }
    for (var k in this.servers) {
        var s = this.servers[k]
        s.evicts = []
        s.freeram = s.ramlimit
        var procs = this.ns.ps(k)
        for (var i in procs) {
            var proc = procs[i]
            if (proc.args.includes(CANCEL_ARGUMENT)) {
                proc.ram = this.ns.getScriptRam(proc.filename, k) * proc.threads
                s.ramlimit += proc.ram
                s.evicts.push(proc)
            }
        }
        var self = this
        s.evicts.sort(function(a,b) {
            var d = a.ram - b.ram
            try {
                if (d == 0) {
                    return b.args[b.args.length-2] - a.args[a.args.length-2]
                }
            } catch (e) {
                self.ns.print("Error while sorting: " + e)
            }
            return d
        })
        s.ramlimit = Math.min(s.ramlimit, s.maxram)
    }
}

ServerManager.prototype.buysell_servers = function(cfg) {
    var servers_bought = this.ns.getPurchasedServers()
    var servers_with_ram = []
    for (var i = 0; i < servers_bought.length;++i) {
        var v = servers_bought[k]
        if (v.substring(0, cfg.manage_server_prefix.length) == cfg.manage_server_prefix) {
            servers_with_ram.push({ "name": k, "ram": this.ns.getServerRam(servers_bought[k])})
        }
    }

    if (cfg.manage_server_count || cfg.manage_server_reserve) {
        if (!cfg.manage_server_count || !cfg.manage_server_reserve || !cfg.manage_server_prefix) {
            this.ns.tprint(".manage_server_count and .manage_server_reserve are required together")
            return
        }
        // minimum server size to buy is 256 GB
        var money_available = Math.max(1, this.ns.getServerMoneyAvailable("home") - cfg.manage_server_reserve)
        var largest_memory_buyable = Math.pow(2, Math.floor(Math.log(money_available / 55000) / Math.log(2)))
        var purchase_maxram = this.ns.getPurchasedServerMaxRam()
        if (largest_memory_buyable > purchase_maxram) {
            largest_memory_buyable = purchase_maxram
        }

        if (largest_memory_buyable && cfg.manage_server_count > 0) {
            var should_purchase = true
            if (servers_with_ram.length >= cfg.manage_server_count) {
                // too many servers -- potentially need to purge some
                servers_with_ram.sort(function (a,b) { return a.ram[0] - b.ram[0] })
                var ram_to_beat = servers_with_ram[0].ram[0]
                if (ram_to_beat < largest_memory_buyable) {
                    // the "new" server will be better than all previous ones
                    this.ns.killall(servers_with_ram[i].name)
                    if (!this.ns.deleteServer(servers_with_ram[i].name)) {
                        // failed to delete, so delay purchase
                        should_purchase = false
                    }
                    // remove the servers from the list so no more jobs will be scheduled
                    servers_with_ram.splice(0, 1)
                } else {
                    should_purchase = false
                }
            }
            if (should_purchase) {
                var new_server = this.ns.purchaseServer(cfg.manage_server_prefix, largest_memory_buyable)
                if (new_server !== "") {
                    servers_with_ram.push({"name": new_server, "ram": this.ns.getServerRam(new_server)})
                } else {
                    this.ns.tprint("Error: New server purchase failed: ns.purchaseServer(" + cfg.manage_server_prefix + ", " + largest_memory_buyable + ")")
                }
            }
        }
    }

    for (var k in servers_with_ram) {
        var v = servers_with_ram[k]
        this.servers[v.name] = {
            "ramlimit": v.ram[0] - v.ram[1],
            "maxram": v.ram[0]
        }
    }
}

ServerManager.prototype.filler = function(cfg) {
    try {
        if (cfg.filler) {
            var script = cfg.filler[0]
            var fillerram = this.ns.getScriptRam(script)
            for (var k in this.servers) {
                var v = this.servers[k]
                var th = Math.floor(v.freeram / fillerram)
                if (th > 0) {
                    if (!this.ns.fileExists(script, k)) {
                        this.ns.scp(script, k)
                    }
                    var args = [].concat(cfg.filler);
                    args.splice(1, 0, k, th)
                    args.push(global_filler_id++)
                    args.push(CANCEL_ARGUMENT)
                    if (0 === this.ns.exec.apply(this.ns, args)) {
                        this.ns.tprint(sprintf("Failed to exec filler(%s,%s,%s,...)", script, k, th))
                    }
                }
            }
        }
    } catch (e) {}
}

ServerManager.prototype.get_ram_avail = function() {
    var r = 0
    for (var k in this.servers) {
        r = Math.max(r, this.servers[k].ramlimit)
    }
    return r
}

ServerManager.prototype.select_server = async function(ram) {
    var r = 1e30
    var s = undefined
    for (var k in this.servers) {
        var v = this.servers[k]
        if (v.ramlimit >= ram && r > v.ramlimit) {
            r = v.ramlimit
            s = k
        }
    }
    if (s) {
        var server = this.servers[s]
        if (server.freeram < ram) {
            while (server.freeram < ram && server.evicts.length > 0) {
                // Must evict processes to free up ram
                var evicted = server.evicts.shift()
                evicted.args.unshift(evicted.filename, s)
                this.ns.kill.apply(this.ns, evicted.args)
                server.freeram += evicted.ram
            }
            await this.ns.sleep(100)
        }
        server.ramlimit -= ram
        server.freeram -= ram
    }
    return s
}

function HackTasks(ns) {
    this.ns = ns
    this.jobs = {}
}

HackTasks.prototype.refresh_tasks = function(cfg, rootaccessor) {
    var cur_time = this.ns.getTimeSinceLastAug()
    for (var k in cfg.targets) {
        var target = cfg.targets[k]
        if (!(target in this.jobs) && rootaccessor.try_access(target)) {
            this.jobs[target] = { "state": "idle" }
        }
    }
    for (var target in this.jobs) {
        var job = this.jobs[target]
        if (job.state == "running") {
            if (job.completedAt < cur_time) {
                job.state = "idle"
            }
        }
    }
}

HackTasks.prototype.schedule = async function(cfg, servermgr) {
    for (var k in cfg.targets) {
        var target = cfg.targets[k]
        if (!(target in this.jobs)) {
            continue
        }
        var job = this.jobs[target]
        if (job.state == "running") {
            continue
        }

        var minsec = get_minsec(this.ns, target)
        var maxmon = get_maxmon(this.ns, target)
        var cursec = this.ns.getServerSecurityLevel(target)
        var curmon = this.ns.getServerMoneyAvailable(target)
        var mode
        // determine mode based on current target stats
        if (cursec > minsec) {
            mode = "weaken"
        } else if (curmon < maxmon) {
            mode = "grow"
        } else {
            mode = "hack"
        }

        var ram_avail = servermgr.get_ram_avail()

        var sc_weak_ram = this.ns.getScriptRam(cfg.sc_weak)
        var sc_grow_ram = this.ns.getScriptRam(cfg.sc_grow)
        var sc_hack_ram = this.ns.getScriptRam(cfg.sc_hack)
        var pth_weak = (cursec - minsec) / 0.05
        if (ram_avail > sc_weak_ram * pth_weak * 10) {
            // If we have way more ram than required, skip directly to 'grow' mode
            mode = "grow"
        }

        if (mode == "hack") {
            var effgr = cfg.hackratio
        } else {
            var full_ratio = maxmon/Math.max(curmon, 1)
            if (cfg.hack_during_grow) {
                full_ratio *= cfg.hackratio
            }
            var effgr = cfg.growratio ? Math.min(cfg.growratio, full_ratio) : full_ratio
        }
        var old_th_grow = this.ns.growthAnalyze(target, effgr)
        var th_grow = Math.ceil(old_th_grow)
        var headroom = mode == "hack" ? 0.6 : 0.9
        if (cfg.hack_during_grow && mode == "grow") {
            headroom = 0.7
        }
        th_grow = Math.max(0, Math.min(th_grow, Math.floor(ram_avail * headroom / sc_grow_ram)))
        effgr = Math.pow(effgr, th_grow / old_th_grow)
        if (mode == "weaken") {
            th_grow = 0
        }

        if (cfg.hack_during_grow && mode == "grow") {
            var hackgr = Math.min(Math.sqrt(effgr), cfg.hackratio)
            var hack_money = curmon * (hackgr - 1) / hackgr
        } else {
            var hack_money = curmon * (effgr - 1) / effgr
        }

        var th_hack = Math.max(0, Math.floor(this.ns.hackAnalyzeThreads(target, hack_money)))
        if (cfg.hack_during_grow && mode == "grow") {
            th_hack = Math.min(th_hack, Math.floor(ram_avail * 0.2 / sc_hack_ram))
        } else if (mode != "hack") {
            th_hack = 0
        }
        var th_weak = Math.ceil((th_hack * 0.002 + th_grow * 0.004 + cursec - minsec) / 0.05)
        th_weak = Math.max(0, Math.min(th_weak, Math.floor(ram_avail / sc_weak_ram)))

        var ram_hack = th_hack * sc_hack_ram
        var ram_grow = th_grow * sc_grow_ram
        var ram_weak = th_weak * sc_weak_ram
        var req_ram = ram_hack + ram_grow + ram_weak

        this.ns.print(">>> Required RAM: " + req_ram + " (" + [ram_hack, ram_grow, ram_weak] + ")")

        if (ram_avail < req_ram || th_weak == 0) {
            this.ns.print("INSUFFICIENT RAM FOR " + target + ", avail=" + ram_avail)
            continue
        }
        var server = await servermgr.select_server(req_ram)
        job.state = "running"
        job.server = server

        if (server != "home" && !this.ns.fileExists(cfg.sc_hack, server)) {
            this.ns.scp([cfg.sc_hack, cfg.sc_grow, cfg.sc_weak], server)
        }

        var global_id = global_filler_id++
        if (0 === this.ns.exec(cfg.sc_weak, server, th_weak, target, global_id)) {
            this.ns.tprint(sprintf("Failed to exec weak(%s,%s,%s,%s)", cfg.sc_weak, server, th_weak, target))
            return
        }
        if (th_grow > 0 && 0 === this.ns.exec(cfg.sc_grow, server, th_grow, target, global_id)) {
            this.ns.tprint("Failed to exec grow")
            return
        }
        if (th_hack > 0 && 0 === this.ns.exec(cfg.sc_hack, server, th_hack, target, global_id)) {
            this.ns.tprint("Failed to exec hack")
            return
        }
        var regex = new RegExp("in ([\\d\\.,]+) seconds")
        var time = -1.0
        for (var i = 0; i < 20; ++i) {
            var logs = this.ns.getScriptLogs(cfg.sc_weak, server, target, global_id)
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
            await this.ns.sleep(200)
        }
        if (time < 0) {
            this.ns.tprint("Failed to parse time from weaken logs for " + target)
            return
        }
        job.completedAt = this.ns.getTimeSinceLastAug() + time
        if (th_hack > 0) {
            this.ns.print(sprintf(">>> Money rate for %20s: $/s = %1.2e    $/GBs = %1.2e",
                target,
                hack_money * 1000 / time,
                hack_money * 1000 / time / req_ram))
        }
    }
}

HackTasks.prototype.next_event = function() {
    var next = 1e99
    for (var target in this.jobs) {
        var job = this.jobs[target]
        if (job.state == "running") {
            next = Math.min(next, job.completedAt)
        }
    }
    return next
}

export async function main(ns) {
    var schema = {
        "$positional": ["config"],
        "config": { "required": true },
    }

    var pargs = argparse(ns, schema)

    var time_to_load_config = 0
    var owned_servers = detect_existing_servers(ns)

    var server_mgr = new ServerManager(ns)
    var hack_tasks = new HackTasks(ns)

    var jobs = {}
    do {
        var cur_time = ns.getTimeSinceLastAug()
        if (cur_time > time_to_load_config) {
            if (!ns.fileExists(pargs.config)) {
                ns.tprint("Cannot read config file: " + pargs.config)
                await ns.sleep(5000)
                continue
            }

            try {
                var cfg = loadcfg(ns, pargs.config)
            } catch (e) {
                ns.tprint("Failed: " + e)
                await ns.sleep(5000)
                continue
            }
            time_to_load_config = cur_time + 10000
        }

        var rootaccessor = new RootAccessor(ns)
        server_mgr.check_servers(cfg, rootaccessor)
        hack_tasks.refresh_tasks(cfg, rootaccessor)
        await hack_tasks.schedule(cfg, server_mgr)
        server_mgr.filler(cfg)

        if (cfg.manage_servers) {
            manage_servers(ns, owned_servers)

            for (var i of owned_servers) {
                if (cfg.training == undefined) {
                    throw ".manage_servers requires .training";
                }
                if (i[1].waiting_to_sell) {
                    ns.killall(i[0])
                } else {
                    if (!ns.fileExists(cfg.training, i[0])) {
                        ns.scp(cfg.training, i[0])
                    }
                    if (i[1].state !== "run") {
                        var threads_run = Math.floor(i[1].server_ram / ns.getScriptRam(cfg.training));
                        if (0 === ns.exec(cfg.training, i[0], threads_run)) {
                            ns.tprint(sprintf("Failed to exec training(%s,%s,%s,...)", cfg.training, i[0], threads_run))
                        }
                        i[1].state = "run"
                    }
                }
            }
        }
        var sleep_until = Math.min(time_to_load_config, hack_tasks.next_event())

        var n = sleep_until - ns.getTimeSinceLastAug()
        await ns.sleep(Math.max(500, Math.min(n + 500, 3000)))
    }
    while (true)
}
