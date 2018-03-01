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

    self:load_parameters ()

    self.window = tinyseqWindow (self)

    self.window:show_dialog ()

end


----------------------------------------------------------------------------------------------------


function tinyseq:generate_samples ()

    -- Delete the samples previously generated

    local i = 1
    while i <= #self.instrument.samples do
        if string.sub (self.instrument:sample(i).name, 1, 12) == "tinyseq Note" then
            self.instrument:delete_sample_at (i)
        else
            i = i + 1
        end
    end

    self:save_parameters ()

    -- Generate the samples

    local range_start = 0
    local range_end = 119

    self:generate_one_sample (41, range_start, range_end, false)

end


----------------------------------------------------------------------------------------------------


function tinyseq:generate_one_sample (note, range_start, range_end, render_frequency_table)

    local sample_rate = 44100
    local bit_depth = 16

    --local f = frequency_of_renoise_note (note) -- 440 -- 261.63
    -- local period = sample_rate / f

    --local desired_length = self.sample_duration * sample_rate

    local nb_frames = 1024
    --while nb_frames < desired_length do
     --   nb_frames = nb_frames * 2
    --end

    local harmonics = self.harmonics

    local freq = {}
    local freq_amp = {}

    -- Pad with zeros (for LuaFFT)

    for i = 1, nb_frames do
        freq_amp[i] = 0
        freq[i] = complex.new (0, 0)
    end

    for i = 1, #harmonics do
      freq_amp[i] = harmonics[i]
    end

    -- Zero out phases

    for i = 1, nb_frames / 2 do
        -- local phase = math.random () * math.pi * 2
        local phase = 0
        freq[i] = complex.new (freq_amp[i] * math.cos (phase) , freq_amp[i] * math.sin (phase) )
    end

    -- Inverse Fourier Transform

    local wavetable = fft (freq, true)

    -- Normalize samples

    local ampl_max = 0
    ampl_max = 0
    for i = 1, #wavetable do
        if math.abs(wavetable[i][1]) > ampl_max then
            ampl_max = math.abs(wavetable[i][1])
        end
    end
    if ampl_max < 0.00001 then ampl_max = 0.00001 end
    for i = 1, #wavetable do
        wavetable[i][1] = wavetable[i][1] / ampl_max
    end

    -- Create and write the sample buffer

    local sample_index = self:create_sample (wavetable, note , {range_start, range_end})

    -- select the newly created sample
    renoise.song().selected_sample_index = sample_index
end


----------------------------------------------------------------------------------------------------



function tinyseq:create_sample (wavetable, note, range)

    local index = 1
    while index <= #self.instrument.samples
          and string.sub (self.instrument:sample(index).name, 1, 18) ~= "tinyseq Parameters" do
        index = index + 1
    end
    local sample_index = #self.instrument.samples + 1
    if index <= #self.instrument.samples then
        sample_index = index + 1
    end
    local sample = self.instrument:insert_sample_at (sample_index)

    local success = sample.sample_buffer:create_sample_data(44100, 16, 1, #wavetable)
    ---TODO: ?
    if not success then return end

    sample.loop_mode = renoise.Sample.LOOP_MODE_FORWARD

    local sample_buffer = sample.sample_buffer
    sample_buffer:prepare_sample_data_changes ()

    -- Find a nice 0-crossing point to start the sample
    local start = math.floor (math.random (1, 3 * #wavetable / 8))
    while start < #wavetable and math.abs(wavetable[start][1]) > 0.001 do
        start = start + 1
    end
    local position = 1
    for i = start, #wavetable do
        sample_buffer:set_sample_data (1, position, wavetable[i][1])
        position = position + 1
    end
    for i = 1, start - 1 do
        sample_buffer:set_sample_data (1, position, wavetable[i][1])
        position = position + 1
    end

    sample_buffer:finalize_sample_data_changes ()

    -- self.instrument:insert_sample_mapping (renoise.Instrument.LAYER_NOTE_ON, sample_index, note, range)
    local sample_mapping = self.instrument:sample(sample_index).sample_mapping
    sample_mapping.layer = renoise.Instrument.LAYER_NOTE_ON
    sample_mapping.base_note = note
    sample_mapping.note_range = range
    sample.name = "tinyseq Note " .. name_of_renoise_note (note)
    sample.volume = 0.5
    sample.interpolation_mode = renoise.Sample.INTERPOLATE_NONE

    return sample_index

end


----------------------------------------------------------------------------------------------------


----------------------------------------------------------------------------------------------------

--TODO: cleaner approach for the 3 following functions


function tinyseq:initialize_parameters ()

    self.harmonics = { 1 }

end


----------------------------------------------------------------------------------------------------


-- Save the synth parameters in the first sample name
-- (this sample is never used)
function tinyseq:save_parameters ()

    local index = 1
    while
        index <= #self.instrument.samples
        and string.sub (self.instrument:sample(index).name, 1, 18) ~= "tinyseq Parameters"
    do
        index = index + 1
    end
    if index > #self.instrument.samples then
        self.instrument:insert_sample_at (index)
    end

    self.instrument.samples[index].sample_buffer:create_sample_data (44100, 16, 1, 1)

    local name = "tinyseq Parameters { "

    name = name .. "harmonics={ "
    for i = 1, #self.harmonics do
        name = name .. self.harmonics[i] .. ", "
    end
    name = name .. "} "

    self.instrument.samples[index].name = name .. "}"

    self.instrument.samples[index].volume = 0.0
    self.instrument.samples[index].sample_mapping.note_range = {0, 0}
    self.instrument.samples[index].sample_mapping.velocity_range = {0, 0}

end


----------------------------------------------------------------------------------------------------


function tinyseq:load_parameters ()

    local index = 1
    while index <= #self.instrument.samples
          and string.sub (self.instrument:sample(index).name, 1, 18) ~= "tinyseq Parameters" do
        index = index + 1
    end

    self:initialize_parameters ()
    if index > #self.instrument.samples then
        return
    end

    local name = self.instrument.samples[index].name

    local data_string = "return" .. string.sub (name, 19)

    local f = loadstring (data_string)

    local data = f ()

    self.harmonics = data.harmonics
end

----------------------------------------------------------------------------------------------------
