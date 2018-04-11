class "tinyseqWindow"

local status = nil

----------------------------------------------------------------------------------------------------


function tinyseqWindow:__init (pad_synth)

    self.vb = renoise.ViewBuilder ()

    self.pad_synth = pad_synth
end


----------------------------------------------------------------------------------------------------


function tinyseqWindow:show_dialog (func)

    self.modulation_sets = {}
    self.modulation_sets[1] = "None"
    for i,v in ipairs(self.pad_synth.instrument.sample_modulation_sets) do
        self.modulation_sets[i+1] = self.pad_synth.instrument.sample_modulation_sets[i].name
    end
    self.device_chains = {}
    self.device_chains[1] = "None"
    for i,v in ipairs(self.pad_synth.instrument.sample_device_chains) do
        self.device_chains[i+1] = self.pad_synth.instrument.sample_device_chains[i].name
    end

    if self.dialog and self.dialog.visible then
        self.dialog:show ()
        return
    end

    if not self.dialog_content then
        self.dialog_content = self:gui ()
    end

    local views = self.vb.views
    if func then
      views.func.value = func
    else
      views.func.value = "Math.sin(2 * Math.PI * f * t)"
    end

    local kh = function (d, k) return self:key_handler (d, k) end
    self.dialog = renoise.app():show_custom_dialog ("tinyseq", self.dialog_content, kh)

end


----------------------------------------------------------------------------------------------------


function tinyseqWindow:key_handler (dialog, key)
    if key.modifiers == "" and key.name == "esc" then

        dialog:close()

    elseif key.modifiers == "" and key.name == "return" then

      self:generate_samples()

    else

        return key

    end

end


----------------------------------------------------------------------------------------------------


tinyseqWindow.sample_rate_names = { "11025", "22050", "32000", "44100", "48000", "88200", "96000" }
tinyseqWindow.sample_rate_values = { 11025, 22050, 32000, 44100, 48000, 88200, 96000 }

tinyseqWindow.bit_depth_names = { "16", "24", "32", }
tinyseqWindow.bit_depth_values = { 16, 24, 32, }

tinyseqWindow.nb_channels_names = { "Mono", "Stereo", }


----------------------------------------------------------------------------------------------------


function tinyseqWindow:generate_samples ()

    self:update_parameters ()
    self.pad_synth.is_test_note = false

    local views = self.vb.views

    views.do_generate:remove_released_notifier (self, tinyseqWindow.generate_samples)
    views.do_generate:add_released_notifier (self, tinyseqWindow.cancel_generation)
    views.do_generate.text = "Cancel"
    in_progress_start (function ()
        self.pad_synth:generate_samples (views.func.value)
    end,
    function ()
        views.do_generate.text = "Generate All Samples"
        views.do_generate:remove_released_notifier (self, tinyseqWindow.cancel_generation)
        views.do_generate:add_released_notifier (self, tinyseqWindow.generate_samples)
    end )

end


----------------------------------------------------------------------------------------------------


function tinyseqWindow:update_parameters ()

    local views = self.vb.views

end


----------------------------------------------------------------------------------------------------


function tinyseqWindow:cancel_generation ()

    in_progress_abort  ()
    self.vb.views.status.text = "Sample generation aborted."
    self.vb.views.do_generate.text = "Generate All Samples"
    self.vb.views.do_generate:remove_released_notifier (self, tinyseqWindow.cancel_generation)
    self.vb.views.do_generate:add_released_notifier (self, tinyseqWindow.generate_samples)

end


----------------------------------------------------------------------------------------------------


local function to_note_string (v)

    local octave = math.floor (v / 12)
    local note = v % 12 + 1
    local note_names = { "C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-" }
    local note_name = note_names[note]

    return note_name .. octave

end

local note_numbers = { ["C-"] = 0, ["C#"] = 1, ["D-"] = 2, ["D#"] = 3, ["E-"] = 4, ["F-"] = 5, ["F#"] = 6, ["G-"] = 7, ["G#"] = 8, ["A-" ]= 9, ["A#"] = 10, ["B-"] = 11,
                       ["c-"] = 0, ["c#"] = 1, ["d-"] = 2, ["d#"] = 3, ["e-"] = 4, ["f-"] = 5, ["f#"] = 6, ["g-"] = 7, ["g#"] = 8, ["a-" ]= 9, ["a#"] = 10, ["b-"] = 11 }

local function to_note_number (v)

    local note_name, octave_name = string.match (v, "([a-gA-G][%-#])([0-9])")
    if not note_name or not octave_name then
        return 48
    end

    local note = note_numbers[note_name]
    if note == nil then
        note = 0
    end

    local octave = tonumber (octave_name)

    return octave * 12 + note

end


----------------------------------------------------------------------------------------------------


function tinyseqWindow:gui ()

    local vb = self.vb
    local ps = self.pad_synth

    local dialog_margin = renoise.ViewBuilder.DEFAULT_DIALOG_MARGIN
    local dialog_spacing = renoise.ViewBuilder.DEFAULT_DIALOG_SPACING
    local control_margin = renoise.ViewBuilder.DEFAULT_CONTROL_MARGIN
    local control_spacing = renoise.ViewBuilder.DEFAULT_CONTROL_SPACING
    local control_height = renoise.ViewBuilder.DEFAULT_CONTROL_HEIGHT

    local function on_keyzones_mode_changed ()
        if self.vb.views.keyzones_mode.value == 1 then
            self.vb.views.test_note_group1.visible = false
            self.vb.views.test_note_group2.visible = false
            self.vb.views.keyzones_group1.visible = true
            self.vb.views.keyzones_group2.visible = true
            if not is_in_progress () then self.vb.views.do_generate.text = "Generate All Samples" end
        else
            self.vb.views.keyzones_group1.visible = false
            self.vb.views.keyzones_group2.visible = false
            self.vb.views.test_note_group1.visible = true
            self.vb.views.test_note_group2.visible = true
            if not is_in_progress () then self.vb.views.do_generate.text = "Generate Test Note" end
        end
    end

    local result = vb:column
    {
        style = "body",
        margin = dialog_margin,
        spacing = dialog_spacing,
        uniform = true,

        vb:horizontal_aligner
        {
            mode = "justify",
            height = 26,

            vb:column
            {
                style = "group",
                width = 800,
                height = "100%",
                uniform = true,
                margin = 2,
                vb:column
                {
                    style = "plain",
                    width = "100%",
                    vb:textfield { id = "func", height = 24, width = "100%" },
                },
            },

            vb:button
            {
                id = "do_generate",
                width = 200,
                height = "100%",
                text = "Generate All Samples",
            },

        },

    }


    vb.views.do_generate:add_released_notifier (self, tinyseqWindow.generate_samples)

    status = vb.views.status

    return result

end


----------------------------------------------------------------------------------------------------


----------------------------------------------------------------------------------------------------
