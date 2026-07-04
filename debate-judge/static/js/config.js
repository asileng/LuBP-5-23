/**
 * config.js — Debate segment definitions and constants
 */
const DEBATE_CONFIG = {
    segments: [
        { speaker: "1st Speaker Affirmative",   type: "Constructive",          side: "affirmative", duration: 360, poiAllowed: true  },
        { speaker: "1st Speaker Negative",      type: "Constructive",          side: "negative",    duration: 360, poiAllowed: true  },
        { speaker: "2nd Speaker Affirmative",   type: "Rebuttal & Extension",  side: "affirmative", duration: 360, poiAllowed: true  },
        { speaker: "2nd Speaker Negative",      type: "Rebuttal & Extension",  side: "negative",    duration: 360, poiAllowed: true  },
        { speaker: "3rd Speaker Affirmative",   type: "Rebuttal & Summary",    side: "affirmative", duration: 360, poiAllowed: true  },
        { speaker: "3rd Speaker Negative",      type: "Rebuttal & Summary",    side: "negative",    duration: 360, poiAllowed: true  },
        { speaker: "Reply Speaker Negative",    type: "Closing Remarks",       side: "negative",    duration: 240, poiAllowed: false },
        { speaker: "Reply Speaker Affirmative", type: "Closing Remarks",       side: "affirmative", duration: 240, poiAllowed: false },
    ],
    poiRules: {
        protectedStartSec: 60,      // first minute is protected
        protectedEndSec: 60,        // last minute is protected
        maxPoiPerSpeech: 1,         // max 1 POI accepted per speech
        poiDurationSec: 15,        // each POI max 15 seconds
    },
    timerWarnings: [60, 30, 10],    // seconds remaining to trigger audio alerts
    apiBase: "",                     // empty = same origin
};
