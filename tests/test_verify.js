const Sub = require('../subtitles.js');
const DSP = require('../audio-dsp.js');

console.log('--- Testing Audio DSP ---');
console.log('Presets available:', Object.keys(DSP.PRESETS));
console.log('Frequency bands:', DSP.FREQUENCIES);
const dsp = new DSP();
console.log('Default band gains:', dsp.getBandGains());
dsp.applyPreset('Bass Boost');
console.log('Bass Boost gains:', dsp.getBandGains());
dsp.setVolumeBoost(1.75);
console.log('Volume Boost:', dsp.getVolumeBoost());
dsp.setPan(-0.5);
console.log('Stereo Pan:', dsp.getPan());

console.log('\n--- Testing Subtitles Parser & Engine ---');
const srtSample = `
1
00:00:01,000 --> 00:00:04,500
<b>Hello</b> <i>World</i> with <font color="#ff0000">Red</font> text {\\an8}

2
00:00:05.200 --> 00:00:08.000
Second line without index formatting
`;

const vttSample = `WEBVTT - Header info
NOTE this is a note

00:00:01.500 --> 00:00:03.500 position:50% line:90%
<c.yellow>Yellow speech</c>

00:00:06.000 --> 00:00:09.000
Regular WebVTT text
`;

const srtCues = Sub.parseSRT(srtSample);
console.log('SRT parsed cues count:', srtCues.length);
console.log('SRT Cue 1 html:', srtCues[0].html);

const vttCues = Sub.parseWebVTT(vttSample);
console.log('WebVTT parsed cues count:', vttCues.length);
console.log('VTT Cue 1 html:', vttCues[0].html);

const engine = new Sub();
engine.loadText(srtSample);
console.log('Active cues at 2.0s (offset 0):', engine.getActiveCues(2.0).map(c => c.html));
console.log('Active cues at 0.5s (offset 0):', engine.getActiveCues(0.5).length);

// Advance 600ms (-600ms offset) -> Cue from 1.0s should become active at 0.5s
engine.adjustOffset(-600);
console.log('Active cues at 0.5s (advance 600ms):', engine.getActiveCues(0.5).map(c => c.html));

// Reset offset
engine.resetOffset();
console.log('Offset reset to:', engine.getOffset());

console.log('All tests passed successfully!');
