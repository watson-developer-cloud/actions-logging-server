let action_names = {}
let step_names = {}

exports.isWelcomeAction = (payload) => {
    try {
        let ogm = payload.response.output.debug.output_generic_mapping[0]
        return ogm && ogm.source.step == "step_001" && ogm.source.action == "welcome"
    } catch (error) {
        return false
    }
}

exports.getActionHandler = (payload) => {
    try {
        return payload.response.output.debug.output_generic_mapping[0].source.handler
    } catch (error) {
        return ""
    }
}

exports.checkForUnusedPrompt = (assistant, payload) => {
    let turn_events = payload.response.output.debug.turn_events
    let last_event = ""
    let step_name = "step"

    for (let i = 0; i < turn_events.length; i++) {
        let event = turn_events[i]

        // Can't tell if unused or not in this case so just return -1
        if (event.event == "handler_visited" && (event.source.handler == "validation_not_found_handler" || event.source.handler == "validation_not_found_max_tries_handler"))
            return -1

        if (event.event == "step_answered")
            step_name = step_names[assistant + ":::" + event.source.step] ?? event.source.step
        if (last_event == "step_answered" && event.event == "action_finished" && event.reason != "ended_by_step" )
            return step_name

        last_event = event.event
    }

    return null
}

exports.getTurnEventData = (assistant, payload) => {
    let turn_events = payload.response.output.debug.turn_events

    let prompt_status = null
    let intent = null
    let step = null
    let start_of_action = false

    for (let i = 0; i < turn_events.length; i++) {
        let event = turn_events[i]

        if (event.source.action_title)
            action_names[assistant  + ":::" + event.source.action] = event.source.action_title
        if (event.event == "step_visited" && i == turn_events.length - 1) {
            for (let j = 0; j <  payload.response.output.generic.length; j++) {
                if (payload.response.output.generic[j].response_type == "text") {
                    step_names[assistant + ":::" + event.source.step] = payload.response.output.generic[j].text
                    break
                }
            }
        }
        if (event.source.type == "action" || event.source.type == "handler")
            intent = event.source.action_title ?? (action_names[assistant + ":::" + event.source.action] ?? event.source.action)
        else if (intent == null && event.source.action && (event.event == "step_answered" || event.event == "step_visited"))
            intent = action_names[assistant + ":::" + event.source.action] ?? event.source.action

        if (i == 0) {
            step = step_names[assistant + ":::" + event.source.step] ?? event.source.step

            if (event.event == "step_answered")
                prompt_status = "success"
            else if (event.event == "action_visited")
                start_of_action = true
        }
    }

    return [intent, start_of_action, step, prompt_status]
}