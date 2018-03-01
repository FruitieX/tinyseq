_AUTO_RELOAD_DEBUG = function()
end

math.randomseed (os.clock ())

require "tinyseq"


---------------------------------------------------------------------------------------------------------------------------------------------


local function open_or_create ()

    local instrument = renoise.song().selected_instrument

    tinyseq (instrument)

end


renoise.tool():add_menu_entry {
    name = "Instrument Box:tinyseq Instrument...",
    invoke = function () open_or_create () end
}


renoise.tool():add_keybinding {
    name = "Global:Tools:tinyseq Instrument...",
    invoke = function () open_or_create () end
}


----------------------------------------------------------------------------------------------------------------------------------------------


local in_progress_coroutine = nil
local in_progress_finished_function = nil
local in_progress_clock = 0


local function on_app_idle ()
    if in_progress_coroutine then
        local status = coroutine.status (in_progress_coroutine)
        if status == "suspended" then
            local ok, msg = coroutine.resume (in_progress_coroutine)
            if not ok then
                print (msg)
            end
        elseif status == "dead" then
            if in_progress_finished_function then
                in_progress_finished_function ()
            end
            if renoise.tool().app_idle_observable:has_notifier (on_app_idle) then
            renoise.tool().app_idle_observable:remove_notifier (on_app_idle)
            end
            in_progress_coroutine = nil
            in_progress_finished_function = nil
        end
    end
end


function in_progress_start (f, finished)
    if not in_progress_coroutine then
        in_progress_coroutine = coroutine.create (f)
        in_progress_finished_function = finished
        in_progress_clock = os.clock ()
        if not renoise.tool().app_idle_observable:has_notifier (on_app_idle) then
            renoise.tool().app_idle_observable:add_notifier (on_app_idle)
        end
    end
end


function in_progress_yield ()
    local t = os.clock ()
    if t - in_progress_clock > 0.5 then
        in_progress_clock = t
        coroutine.yield ()
    end
end


function in_progress_abort ()
    in_progress_coroutine = nil
    in_progress_finished_function = nil
end


function is_in_progress ()
    return in_progress_coroutine ~= nil
end


----------------------------------------------------------------------------------------------------------------------------------------------
