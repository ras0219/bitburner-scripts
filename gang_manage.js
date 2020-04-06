// manage4.ns
import { argparse } from "argparse.ns";


function loadcfg(ns, config) {
    if(config==undefined)
    config = "gang.txt"
    var cfg = JSON.parse(ns.read(config));
    return cfg;
}

var PERSON_NAME = "member"

function manage_gang(ns) {
    var owned_members = new Map()
    ns.disableLog("ALL")

    var members = ns.gang.getMemberNames()

    for (var per in members) {
        if (per.substring(0, PERSON_NAME.length) == PERSON_NAME) {
            owned_members.set(per, ns.gang.getMemberInformation(per))
        }
    }
    var managed_people = owned_members.length

    while (ns.gang.canRecruitMember() === true) {
        var suc_rec = ns.gang.recruitMember(PERSON_NAME + managed_people++)
        if (suc_rec === false)
        {    
            throw "no person here" + PERSON_NAME + managed_people;
        }
        owned_members.set(PERSON_NAME + managed_people, ns.gang.getMemberInformation(PERSON_NAME + managed_people))
    }

    var my_gang = ns.gang.getGangInformation()
    var eqip = ns.gang.getEquipmentNames()
    var useful_equip = new Map()
        
    ns.tprint("here")
    for (var thing in eqip)
    {
        var t = ns.gang.getEquipmentType(thing);
        if((t=="Weapon") || (t=="Armor") || (t=="Vehicle"))
        {
            useful_equip.set(thing,ns.gang.getEquipmentCost(thing));
        }
    }
    
    while(ns.getServerMoneyAvailable("home")>1000000000) //>1 bil
    {
        for (var person in owned_members)
        {
            for(var item in useful_equip)
            {
                if(false ==ns.gang.purchaseEquipment(person,item))
                throw "failed to buy!" + person + " " + item;
            }
            if(ns.gang.ascendMember(person)==false)
            throw "failedto ascend" + person;
        }        
        
        
    }



    ns.enableLog("ALL")
}

export async function main(ns) {
    var schema = {
        "$positional": ["config"],
        "config": { "required": false },
    }
    
    var pargs = argparse(ns, schema)
    var time_to_load_config = 0


    do {
        var cur_time = ns.getTimeSinceLastAug()
        if (cur_time > time_to_load_config) {
            try {
                var cfg = loadcfg(ns, pargs.config)
            } catch (e) {
                ns.tprint("Failed: " + e)
                await ns.sleep(5000)
                continue;
            }
            time_to_load_config = cur_time + 10000
        }
        manage_gang(ns)
        await ns.sleep(9000)
    }
    while (true)

}
