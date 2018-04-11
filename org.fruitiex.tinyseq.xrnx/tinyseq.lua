class "tinyseq"

require "tinyseqWindow"

complex = require "complex"
luafft = require "luafft"

require "utils"


----------------------------------------------------------------------------------------------------


function tinyseq:__init (instrument)

    self.instrument = instrument

    if
        instrument.name == ""
        and #self.instrument.samples == 0
    then
        self.instrument.name = "[tinyseq]"
    end

    local func = self:load_func ()

    self.window = tinyseqWindow (self)

    self.window:show_dialog (func)

end


----------------------------------------------------------------------------------------------------


function tinyseq:generate_samples (func)

    -- Delete the samples previously generated

    local i = 1
    while i <= #self.instrument.samples do
        if string.sub (self.instrument:sample(i).name, 1, 12) == "tinyseq Note" then
            self.instrument:delete_sample_at (i)
        else
            i = i + 1
        end
    end

    self:save_func (func)

    local cmd = "node " .. "gensample.js " .. "output.wav " .. "\"" .. func .. "\""
    print ("Running: " .. cmd)
    local handle = io.popen(cmd)
    local result = handle:read("*a")

    print(result)

    handle:close()

    --local asd = renoise.app().prompt_for_filename_to_read({"wav"}, "asd")

    --print(asd)
    -- TODO why doesn't this work :|
    renoise.app():load_instrument_sample("output.wav")

    -- Generate the samples

    --local range_start = 0
    --local range_end = 119

    --self:generate_one_sample (41, range_start, range_end, false)

    --local sample_index = self:create_sample (result, 41 , {range_start, range_end})

    -- select the newly created sample
    --renoise.song().selected_sample_index = sample_index
end


----------------------------------------------------------------------------------------------------







----------------------------------------------------------------------------------------------------


-- Save the synth parameters in the first sample name
-- (this sample is never used)
function tinyseq:save_func (func)

    local index = 1
    while
        index <= #self.instrument.samples
        and string.sub (self.instrument:sample(index).name, 1, 12) ~= "tinyseq func"
    do
        index = index + 1
    end
    if index > #self.instrument.samples then
        self.instrument:insert_sample_at (index)
    end

    self.instrument.samples[index].sample_buffer:create_sample_data (44100, 16, 1, 1)

    local name = "tinyseq func " .. func


    self.instrument.samples[index].name = name

    self.instrument.samples[index].volume = 0.0
    self.instrument.samples[index].sample_mapping.note_range = {0, 0}
    self.instrument.samples[index].sample_mapping.velocity_range = {0, 0}

end


----------------------------------------------------------------------------------------------------


function tinyseq:load_func ()

    local index = 1
    while index <= #self.instrument.samples
          and string.sub (self.instrument:sample(index).name, 1, 12) ~= "tinyseq func" do
        index = index + 1
    end

    if index > #self.instrument.samples then
        return
    end

    local name = self.instrument.samples[index].name

    local func = string.sub (name, 14)

    return func
end

----------------------------------------------------------------------------------------------------
