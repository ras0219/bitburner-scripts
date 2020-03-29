// argparse.script
export function argparse(ns, schema) {
    var ret = { "$trailing": [] }
    for (var k = 0; k < ns.args.length; ++k) {
        var v = ns.args[k] + ""
        if (v.substring(0, 2) == "--") {
            var stem = v.substring(2)
            if (stem in schema) {
                if (schema[stem].type == "switch") {
                    ret[stem] = true
                } else if (schema[stem].type === undefined) {
                    if (stem in ret) {
                        ns.tprint("Option " + v + " already specified")
                        ns.tprint(argparse_help(schema))
                        ns.exit()
                    }
                    ++k
                    if (k == ns.args.length || ("" + ns.args[k]).substring(0, 2) == "--") {
                        ns.tprint("Option " + v + " requires an argument")
                        ns.tprint(argparse_help(schema))
                        ns.exit()
                    }
                    ret[stem] = ns.args[k]
                } else {
                    ns.tprint("INVALID SCHEMA TYPE: " + schema[stem].type)
                    ns.exit()
                }
            } else {
                ns.tprint("Unknown option: " + v)
                ns.tprint(argparse_help(schema))
                ns.exit()
            }
        } else {
            // positional arguments / trailing arguments
            ret["$trailing"].push(ns.args[k])
        }
    }
    if ("$positional" in schema) {
        for (var k in schema["$positional"]) {
            if (ret["$trailing"].length == 0) {
                break
            }
            var v = schema["$positional"][k]
            if (v in ret) {
                continue
            }
            ret[v] = ret["$trailing"].shift()
        }
    }
    if (!schema["$trailing"] && ret["$trailing"].length > 0) {
        ns.tprint("Trailing arguments are not supported")
        ns.tprint(argparse_help(schema))
        ns.exit()
    }
    for (var k in schema) {
        if (k[0] == "$") {
            continue
        }
        var v = schema[k]
        if (v.required && !(k in ret)) {
            ns.tprint("Missing required argument: --" + k)
            ns.tprint(argparse_help(schema))
            ns.exit()
        }
    }
    return ret
}

export function argparse_help(schema) {
    var message = "Usage:";
    if ("$positional" in schema) {
        for (var k in schema["$positional"]) {
            var v = schema["$positional"][k];
            if (schema[v].required) { message += " " + schema["$positional"][k]; } else {
                message += " [" + schema["$positional"][k] + "]";
            }
        }
    }
    if ("$trailing" in schema) { message += " ..."; }
    message += "\nOptions:";
    for (var k in schema) {
        if (k[0] == "$") { continue }
        var v = schema[k]
        message += "\n  --" + k
        if (v.type != "switch") {
            message += " [arg]"
        }
        if (v.required) {
            message += "      (required)"
        }
    }
    return message
}
