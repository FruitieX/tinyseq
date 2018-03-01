

function renoise_note_of (note, octave)

    return (octave - 1) * 12 + (note - 1)

end


function frequency_of_renoise_note (note)

    -- In the formula, A4 is 49
    -- For the value calculated above, A4 is 57
    local n = note - 57 + 49

    return 440 * math.pow(2, (n - 49) / 12)

end

function name_of_renoise_note (note)

    local n = math.floor (note % 12) + 1

    local o = math.floor (note / 12)

    local names = { "C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-", }

    return names[n] .. o

end

--------------------------------------------------------------------------------------------------------------------------

function lin_to_ln (v)

    local ee = math.exp (-1)

    local w = math.exp (- (1 - v))

    return (w - ee) / (1 - ee)

end

function ln_to_lin (v)

    local ee = math.exp (-1)

    local w = v * (1 - ee) + ee

    return 1 + math.log (w)

end

--------------------------------------------------------------------------------------------------------------------------


function from_display (v)

    local ee = 0.1

    local w = math.pow (10, - (1 - v))

    return (w - ee) / (1 - ee)

end


function to_display (v)

    local ee = 0.1

    local w = v * (1 - ee) + ee

    return 1 + math.log10 (w)

end
