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
const PURCHASE_NAME = "DO_NOT_TOUCH_SERVER"
function buy_biggest_server(ns,server_list)
{
    var money_available = ns.getServerMoneyAvailable("home") - 1000000;
    //note we check game to see if we have max server, not our app, we good neighborgs
    //cost per 1GB is 55k, so money_available / 55k =>num of cores we can get, and we need to round down to pow of 2
    var largest_memory_buyable=(Math.pow(2,Math.floor(Math.log(money_available/55000)/Math.log(2)))); //this is largest memory we can do
    if(largest_memory_buyable > ns.getPurchasedServerMaxRam())
        largest_memory_buyable = ns.getPurchasedServerMaxRam();
    var new_server =ns.purchaseServer(PURCHASE_NAME, largest_memory_buyable);
    if(new_server !== "")
    {
        ns.tprint("Bought new server with RAM " + largest_memory_buyable)
            var new_server_object = {server_ram:largest_memory_buyable, state:"idle", waiting_to_sell:false};
            server_list.set(new_server,new_server_object);
    }
    else
    {
        ns.tprint("UNABLE TO BUY NEW SERVER!! RAM req "+largest_memory_buyable)
    }
    //woooo we buyed it
    //or not..... no errors!
    return;
}

/// SERVER:
///    server_ram: TOTAL_RAM
///    state: busy, idle, 
///    WAITING_TO_SELL: true, false
//Figures out if we can BUY MORE AND BETTER SERVERS
function manage_servers(ns,server_list)
{
    var money_available = ns.getServerMoneyAvailable("home") - 1000000;
    if(money_available <= 1000000) return; //early game, return if less then 1M (+1mil/server)
    
    //first we check if we are trying to sell a server, and what's the smallest server is.
    var smallest_ram=13100000000000.0;
    var smallest_server = "";
    var waiting_to_sell = false;
      
    
    for (var best_server of server_list)
    {
        if(best_server[1].server_ram < smallest_ram)
        {
            smallest_ram = best_server[1].server_ram
            smallest_server = best_server[0]
        }
    }
    
    
    if(smallest_server !== ""){
    if(server_list.get(smallest_server).waiting_to_sell === true)
    {
        ns.tprint("Trying to delete + " + smallest_server)
        var able_to_sell = ns.deleteServer(smallest_server)
        if(able_to_sell===false) return; //we need to wait for that zombie to die first, can't do anything with it zombie
        //else
        //woo we sold it!
        ns.print("Success deleting + " +smallest_server);
        server_list.delete(smallest_server)
    }}
    
    //if we have no servers then buy largest server we can
    if(smallest_server === "")
    {
        buy_biggest_server(ns,server_list)
        return; //we done boyz
    }
    //next we check what the smallest ram server cost.
    //if our money is <2x the smallest ram server cost we do nothing
    if(ns.getPurchasedServerCost(smallest_ram*2) > money_available)
        return; // not enough money
    //next we check if we CAN just buy a bigger server
    if( ns.getPurchasedServers().length < (ns.getPurchasedServerLimit()-2))
    {

        buy_biggest_server(ns,server_list)
        return
    }
    ns.print("Asking system to delete + " + smallest_server);
    //if not we need to DELETE the smallest server 
    server_list.get(smallest_server).waiting_to_sell = true;
}

export async function main(ns) {
    var schema = {
        "$positional": ["config"],
        "config": { "required": true },
    }

    var pargs = argparse(ns, schema)
    var global_filler_id = 0
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
    var owned_servers = new Map() //string as name, object as value
    
        var servers_bought = ns.getPurchasedServers()
        for(var one_server of servers_bought)
        {
            if(one_server.length < PURCHASE_NAME.length)
                continue; 
            if( one_server.substring(0, PURCHASE_NAME.length) == PURCHASE_NAME)
            {
                //ns.tprint(one_server.substring(0,PURCHASE_NAME.length))
                //steal the server 
                var a = ns.getServerRam(one_server)[0];
                var new_server_object = {"server_ram":a, "state":"idle", "waiting_to_sell":false};
                owned_servers.set(one_server,new_server_object);
                ns.killall(one_server)
                //ns.tprint("stealing a server to use " + one_server)
            }
        }
        ns.tprint("Stolen servers! "+owned_servers.size);
    
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
                var bool_manage_servers = cfg.manage_servers || false
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

            if (server != "home" && !ns.fileExists(sc_hack, server)) {
                ns.scp([sc_hack, sc_grow, sc_weak], server)
            }

            var global_id = global_filler_id++
            if (0 === ns.exec(sc_weak, server, th_weak, target, global_id)) {
                ns.tprint(sprintf("Failed to exec weak(%s,%s,%s,%s)", sc_weak, server, th_weak, target))
                return
            }
            if (th_grow > 0 && 0 === ns.exec(sc_grow, server, th_grow, target, global_id)) {
                ns.tprint("Failed to exec grow")
                return
            }
            if (th_hack > 0 && 0 === ns.exec(sc_hack, server, th_hack, target, global_id)) {
                ns.tprint("Failed to exec hack")
                return
            }
            var regex = new RegExp("in ([\\d\\.,]+) seconds")
            var time = -1.0
            for (var i = 0; i < 20; ++i) {
                var logs = ns.getScriptLogs(sc_weak, server, target, global_id)
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
        try {
            if (cfg.filler) {
                var script = cfg.filler[0]
                var fillerram = ns.getScriptRam(script)
                for (var k in ramlimits) {
                    var v = ramlimits[k]
                    var th = Math.floor(v / fillerram)
                    if (th > 0) {
                        if (!ns.fileExists(script, k)) {
                            ns.scp(script, k)
                        }
                        var args = [].concat(cfg.filler);
                        args.splice(1, 0, k, th)
                        args.push(global_filler_id++)
                        if (0 === ns.exec.apply(ns, args)) {
                            ns.tprint(sprintf("Failed to exec filler(%s,%s,%s,...)", script, k, th))
                        }
                    }
                }
            }
        } catch (e) {}
        
        if(bool_manage_servers)
        {
            manage_servers(ns,owned_servers)    
            //TBD NOW WE CAN GIVE IT TO RAMLIMITS
        }
        var sleep_until = time_to_load_config
        for (var target in jobs) {
            var job = jobs[target]
            if (job.state == "running") {
                sleep_until = Math.min(sleep_until, job.completedAt + 500)
            }
        }
        
        var n = sleep_until - ns.getTimeSinceLastAug()
        await ns.sleep(Math.max(500, Math.min(n + 500, 3000)))
    }
    while (true)
}
