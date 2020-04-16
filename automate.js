// automate.ns
import { argparse } from "argparse.ns";

/*
Config format:

[
    { "type": "autobuy", "item": "tor" },
    { "type": "autobuy", "item": "BruteSSH.exe" },
    { "type": "autobuy", "item": "FTPCrack.exe" },
    { "type": "university", "name": "Rothman University", "course": "Algorithms", "until": { "hacking": 40 } },
    { "type": "gym", "name": "Powerhouse Gym", "course": "agility", "until": { "agility": 40 } },
    { "type": "gym", "name": "Powerhouse Gym", "course": "dexterity", "until": { "dexterity": 40 } },
    { "type": "crime", "name": "rob store", "until": { "forever": true } }
]

*/

function loadcfg(ns, config) {
    var cfg = JSON.parse(ns.read(config))
    return cfg
}

function CondEval(ns) {
    this.ns = ns
    this.stats = null
    this.info = null
}

CondEval.prototype.getStats = function() {
    return this.stats = (this.stats || this.ns.getStats())
}
CondEval.prototype.getCharacterInformation = function() {
    return this.info = (this.info || this.ns.getCharacterInformation())
}
CondEval.prototype.check = function(cond) {
    for (var k in cond) {
        if (["hacking","strength","defense","dexterity","agility","charisma"].includes(k)) {
            if (this.getStats()[k] < cond[k]) {
                return false
            }
        } else if (k == "rep") {
            if (this.getCharacterInformation().workRepGain + this.ns.getFactionRep(cond[k].faction) < cond[k].value) {
                return false
            }
        } else if (k == "money") {
            if (this.ns.getServerMoneyAvailable("home") < k) {
                return false
            }
        } else if (k == "forever") {
            return false
        } else {
            throw "Unknown check type: " + k
        }
    }
    return true
}

function check_cond(ns, cond) {
    var c = new CondEval(ns)
    return c.check(cond)
}

function Sleeper(ns) {
    this.ns = ns
    this._autobuy = []
    this._autojoin = []
}

Sleeper.prototype.sleep_until = async function(cond) {
    do {
        await this.ns.sleep(5000)
        var a = this._autobuy
        this._autobuy = []
        for (var i in a) {
            this.autobuy(a[i])
        }
    } while (!check_cond(this.ns, cond))
}

Sleeper.prototype.crime_sleep_until = async function(crime, cond) {
    do {
        var t = this.ns.commitCrime(crime)
        await this.ns.sleep(1000)
        if (!this.ns.isBusy()) {
            this.ns.tprint("Crime possibly cancelled -- sleeping +10 seconds")
            await this.ns.sleep(10000)
        }
        await this.ns.sleep(t - 1000)
        while (this.ns.isBusy()) {
            await this.ns.sleep(1000)
        }
        var a = this._autobuy
        this._autobuy = []
        for (var i in a) {
            this.autobuy(a[i])
        }
    } while (!check_cond(this.ns, cond))
}

Sleeper.prototype.try_buy = function(item) {
    if (item == "tor") {
        if (this.ns.getCharacterInformation().tor) {
            return true
        }
        return this.ns.purchaseTor();
    } else if (item == "BruteSSH.exe") {
        if (this.ns.fileExists("BruteSSH.exe", "home")) {
            return true
        }
        return this.ns.purchaseProgram("BruteSSH.exe");
    } else if (item == "FTPCrack.exe") {
        if (this.ns.fileExists("FTPCrack.exe", "home")) {
            return true
        }
        return this.ns.purchaseProgram("FTPCrack.exe");
    } else {
        throw "Unknown item type: " + item
    }
}

Sleeper.prototype.autobuy = function(item) {
    if (!this.try_buy(item)) {
        this._autobuy.push(item)
    }
}

export async function main(ns) {
    var schema = {
        "$positional": ["config"],
        "config": { "required": true },
    }

    var pargs = argparse(ns, schema)

    var sleeper = new Sleeper(ns)

    if (!ns.fileExists(pargs.config)) {
        ns.tprint("Cannot read config file: " + pargs.config)
        return
    }
    var cfg = loadcfg(ns, pargs.config)
    for (var i in cfg) {
        var step = cfg[i]
        if (!("until" in step)) {
            step.until = {}
        }
        for (var s in ["hacking", "agility", "dexterity", "strength", "defense", "charisma"]) {
            if (("until_" + s) in step) {
                step.until[s] = step["until_" + s]
            }
        }
        if ("until_rep" in step) {
            step.until.rep = {"faction": step.faction, "value": step.until_rep}
        }
        if (check_cond(ns, step.until)) {
            continue
        }
        if (step.type == "university") {
            if (!ns.universityCourse(step.name, step.course)) {
                throw "Failed to start university course"
            }
            await sleeper.sleep_until(step.until)
            ns.stopAction()
        } else if (step.type == "gym") {
            if (!ns.gymWorkout(step.name, step.course)) {
                throw "Failed to start gym course"
            }
            await sleeper.sleep_until(step.until)
            ns.stopAction()
        } else if (step.type == "factionwork") {
            if (!ns.workForFaction(step.faction, step.worktype)) {
                throw "Failed to start working for faction"
            }
            await sleeper.sleep_until(step.until)
            ns.stopAction()
        } else if (step.type == "autobuy") {
            sleeper.autobuy(step.item)
        } else if (step.type == "crime") {
            await sleeper.crime_sleep_until(step.name, step.until)
        } else {
            throw "Unknown step type: " + type
        }
    }
    ns.tail()
}
