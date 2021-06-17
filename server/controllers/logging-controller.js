const dbController = require("./db-controller")
const jwt = require('jsonwebtoken');
const moment = require("moment")
const params = require("../config/params")
const parsing = require("../actions-parsing")

let db = null
let partitions = null

// Webhook to insert new logs
async function logs_webhook(req, res) {
    if (req.query.debug)
        console.log("Recieved WEBHOOK w/ payload: \n" + JSON.stringify(req.body.payload))

    if (!req.headers.authorization)
        return res.status(401).send("Please provide authorization")
    
    // Verify JSON Web Token
    jwt.verify(req.headers.authorization, params.WebhookSecret, function(err, decoded) {
        if (err)
            return res.status(401).send("Invalid authorization")
     
        insert_to_db(req.headers.assistant, req.body.payload).then((inserted) => {
            res.status(200).json(inserted)
        }).catch((error) => {
            console.log(error)
            res.status(400).json("Error while inserting dialog log")
        });
    });  
}

// Get stats from a partition
async function getAssistantStats(req, res) {
    if (!db && !dbController.db) 
        return res.status(400).json("Database not initialized. Please try again")
    else if (dbController.db)
        db = dbController.db
    
    if (!req.query.assistant)
        return res.status(322).send("Provide assistant you would like to get documents for in url i.e ?assistant=ASSISTANT_NAME")

    let a = req.query.assistant
    let [uniqueUsersByDate, uniqueSessionsByDate, requestCountByDate, intentCountsByDate,
         recognizedByDate, notRecognizedMessages, promptStatusByDate, unusedPrompts] =
         await Promise.all([getUniqueUsersByDate(a), getUniqueSessionsByDate(a), getRequestCountByDate(a), getIntentCountsByDate(a),
             getRecognizedByDate(a), getNotRecognizedMessages(a), getPromptStatusByDate(a), getUnusedPromptCount(a)]);

    let stats = {
        "uniqueUsers": uniqueUsersByDate,
        "uniqueSessions": uniqueSessionsByDate,
        "requestCounts": requestCountByDate,
        "intentCounts": intentCountsByDate,
        "recognized": recognizedByDate,
        "notRecognizedMessages": notRecognizedMessages,
        "promptStatus": promptStatusByDate,
        "unusedPrompts": unusedPrompts
    }

    res.status(200).json(stats)
}

async function getUnusedPromptCount(assistant) {
    let result = await db.partitionedView(assistant, "stats", "unused-prompt-count", { })
    let data = {}

    for (let i = 0; i < result.rows.length; i++) {
        let row = result.rows[i]

        // -1 = Couldn't tell if unused or not so skip these
        if (row.value.unused == -1)
            continue

        if (row.key in data) {
            if (moment(row.value.timestamp).isAfter(moment(data[row.key].timestamp))) {
                data[row.key] = { timestamp: row.value.timestamp, unused: row.value.unused }
            }
         } else {
            data[row.key] = { timestamp: row.value.timestamp, unused: row.value.unused }
         }
    }

    return Object.keys(data).filter(key => data[key].unused != null)
}

async function getNotRecognizedMessages(assistant) {
    let result = await db.partitionedView(assistant, "stats", "not-recognized", { })
    return result.rows.map(row => row.value)
}

// async function getFailedPromptMessages(assistant) {
//     let result = await db.partitionedView(assistant, "stats", "failed-prompt-messages", { })
//     return result.rows.map(row => row.value)
// }

async function getIntentCountsByDate(assistant) {
    let result = await db.partitionedView(assistant, "stats", "intent-counts-by-date", { group: true })
    let ret = {}

    for (var i = 0; i < result.rows.length; i++) {
        let date = result.rows[i].key[0]
        let intent = result.rows[i].key[1]
        let cnt = result.rows[i].value

        if (intent == null) continue

        if (!(date in ret))
            ret[date] = { }

        ret[date][intent] = intent in ret[date] ? ret[date][intent] + cnt : cnt
    }

    return ret
}

async function getUniqueUsersByDate(assistant) {
    let result = await db.partitionedView(assistant, "stats", "unique-users-by-date", { group: true })
    let ret = {}

    for (var i = 0; i < result.rows.length; i++) {
        let date = result.rows[i].key[0]

        if (!(date in ret))
            ret[date] = { "count": 0, "users": [] }

        ret[date]["count"] += 1
        ret[date]["users"].push(result.rows[i].key[1])
    }

    return ret
}

async function getUniqueSessionsByDate(assistant) {
    let result = await db.partitionedView(assistant, "stats", "unique-sessions-by-date", { group: true })
    let ret = {}

    for (var i = 0; i < result.rows.length; i++) {
        let date = result.rows[i].key[0]
        ret[date] = date in ret ? ret[date] + 1 : 1
    }

    return ret
}

async function getRequestCountByDate(assistant) {
    let result = await db.partitionedView(assistant, "stats", "request-count-by-date", { group: true })
    let ret = {}

    for (var i = 0; i < result.rows.length; i++) {
        let date = result.rows[i].key[0]
        ret[date] = date in ret ? ret[date] + 1 : 1
    }

    return ret
}

async function getRecognizedByDate(assistant) {
    let result = await db.partitionedView(assistant, "stats", "recognized-by-date", { group: true })
    let ret = {}

    for (var i = 0; i < result.rows.length; i++) {
        let date = result.rows[i].key[0]
        let rec = result.rows[i].key[1]

        if (!(date in ret))
            ret[date] = { "recognized": 0, "notRecognized": 0 }

        ret[date][rec] += result.rows[i].value
    }

    return ret
}

async function getPromptStatusByDate(assistant) {
    let result = await db.partitionedView(assistant, "stats", "prompt-status-by-date", { group: true })
    let ret = {}

    for (var i = 0; i < result.rows.length; i++) {
        let date = result.rows[i].key[0]
        let rec = result.rows[i].key[1]

        if (!(date in ret))
            ret[date] = { "success": 0, "fail": 0 }

        ret[date][rec] += result.rows[i].value
    }

    return ret
}

// Get list of all partitions
async function listAssistants(req, res) {
    if (!db && !dbController.db) 
        return res.status(400).json("Database not initialized. Please try again")
    else if (!db)
        db = dbController.db

    const info = await getPartitions()
    res.status(200).json(info)
}

// Used first time listAssistants is called to get list of partitions
async function getPartitions() {
    if (partitions)
        return Array.from(partitions)

    let partitions_tmp = new Set()
    let docs = await db.list()

    for (var i = 0; i < docs.total_rows; i++) {
        let row_id = docs.rows[i].id
        let partition = row_id.substring(0, row_id.lastIndexOf(":"))
        
        if (partition)
            partitions_tmp.add(partition)
    }

    partitions = partitions_tmp
    return Array.from(partitions_tmp)
}

async function insert_to_db(assistant, payload) {
    // Make sure db is initialized
    if (!db && !dbController.db) 
        return null
    else if (dbController.db)
        db = dbController.db

    return await (payload.response.output.debug.turn_events ?
     insert_action_to_db(assistant, payload) : insert_dialog_to_db(assistant, payload))
}

// Insert new action log into db
async function insert_action_to_db(assistant, payload) {
    if (parsing.isWelcomeAction(payload))
        return null

    let dict = {}
    let assistantName = assistant ?? payload.assistant_id

    // If new partition, update partitions list
    if (partitions && !(partitions.has(assistantName)))
        partitions.add(assistantName)

    // Build document to insert in DB
    dict["_id"] = assistantName + ":" + payload.log_id
    dict["assistant_id"] = payload.assistant_id
    dict["skill_id"] = payload.skill_id
    dict["user_id"] = payload.customer_id
    dict["session_id"] = payload.response.context.global.session_id
    dict["date"] = moment().format('L')

    try {
        dict["recognized"] = payload.response.output.debug.output_generic_mapping[0].source.action != "anything_else"
    } catch(error) {
        dict["recognized"] = true
    }

    let [intent, start_of_action, step, prompt_status] = parsing.getTurnEventData(assistant, payload)

    dict["intent"] = intent
    dict["start_of_action"] = start_of_action
    dict["step"] = step
    dict["prompt_status"] = prompt_status

    let handler = parsing.getActionHandler(payload)

    if (handler == "validation_not_found_max_tries_handler")
        dict["prompt_status"] = "fail"

    dict["failed_prompt"] = (handler == "validation_not_found_handler" || handler == "validation_not_found_max_tries_handler")
    dict["unused_prompt"] = start_of_action ? -1 : parsing.checkForUnusedPrompt(assistant, payload)

    dict["request"] = payload.request.input
    dict["request"]["timestamp"] = payload.request_timestamp
    delete dict["request"]["options"]

    dict["response"] = {}
    dict["response"]["response"] = payload.response.output.generic
    dict["response"]["entities"] = payload.response.output.entities
    dict["response"]["timestamp"] = payload.response_timestamp

    let inserted = await db.insert(dict)
    console.log("Successfully inserted action log: " + dict["_id"])

    return inserted
}

// Insert new dialog log into db
async function insert_dialog_to_db(assistant, payload) {
    let dict = {}
    let assistantName = assistant ?? payload.assistant_id

    // If new partition, update partitions list
    if (partitions && !(partitions.has(assistantName)))
        partitions.add(assistantName)

    // Build document to insert in DB
    dict["_id"] = assistantName + ":" + payload.log_id
    dict["assistant_id"] = payload.assistant_id
    dict["skill_id"] = payload.skill_id
    dict["user_id"] = payload.customer_id
    dict["session_id"] = payload.response.context.global.session_id
    dict["date"] = moment().format('L')

    try {
        dict["recognized"] = !payload.response.output.internal.fallback
    } catch(error) {
        dict["recognized"] = true
    }

    let intents = payload.response.output.intents
    var intent = null

    if (intents && intents.length > 0)
        intent = intents[0].intent

    dict["intent"] = intent

    dict["request"] = payload.request.input
    dict["request"]["timestamp"] = payload.request_timestamp
    delete dict["request"]["options"]
    delete dict["request"]["source"]

    dict["response"] = payload.response.output
    dict["response"]["timestamp"] = payload.response_timestamp

    let inserted = await db.insert(dict)
    console.log("Successfully inserted dialog log: " + dict["_id"])
    return inserted
}

exports.logs_webhook = logs_webhook
exports.getAssistantStats = getAssistantStats
exports.listAssistants = listAssistants