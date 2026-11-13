// The test library's content: a fixed outline plus deterministic generated
// prose and beats. Same seed, same output, every run.
//
// All names, titles and prose here are invented placeholder text.

export function rng(seed) {
  // mulberry32: small, deterministic, good enough for test data.
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p
  }
}

// Scene counts per chapter are fixed so the edge cases land where intended.
// `special` marks a scene that must carry an edge case.
export const OUTLINE = [
  {
    title: 'The Lantern Road',
    folder: 'lantern-road',
    chapters: [
      { title: 'Departures', status: 'posted', scenes: 4, special: { 2: 'crlf' } },
      { title: 'One Night at the Ferry', status: 'posted', scenes: 1 }, // exactly one scene
      { title: 'Weather Turning', status: 'ready to post', scenes: 3 }
    ]
  },
  {
    title: 'Salt and Static',
    folder: 'salt-and-static',
    chapters: [
      { title: 'Signal', status: 'posted', scenes: 6 },
      { title: 'The Tide Tables', status: 'ready to post', scenes: 2, special: { 2: 'no-beats' } },
      { title: 'Low Water', status: 'drafting', scenes: 5 },
      { title: 'Interference', status: 'drafting', scenes: 3 },
      { title: 'What the Radio Said', status: 'drafting', scenes: 2, special: { 2: 'empty' } }
    ]
  },
  {
    title: 'Untitled Orchard Idea',
    folder: 'orchard-idea',
    chapters: [] // a work with no chapters
  }
]

export const POVS = ['Wren', 'Oskar', 'Tamsin', 'Wren', 'Oskar', 'ensemble']

// Weighted by repetition so the suggestion counts differ.
export const KINDS = [
  'plot', 'plot', 'plot', 'plot',
  'line', 'line', 'line',
  'image', 'image',
  'continuity', 'continuity',
  'callback',
  'thread'
]

const SCENE_TITLES = [
  'The Long Way Round', 'Kettle Weather', 'A Map with No Key', 'Borrowed Coats',
  'Counting Stairs', 'The Second Letter', 'Lamplight', 'Small Hours',
  'Unfinished Business', 'The Open Door', 'Crossing Over', 'Static on the Line',
  'Ledger', 'Rope and Pulley', 'High Tide', 'The Quiet Carriage',
  'Paper Boats', 'Nothing Said', 'Fog Bank', 'A Fair Trade',
  'Late Arrivals', 'Spare Key', 'The Wrong Station', 'Salt on the Glass',
  'Holding Pattern', 'First Light'
]

const PLACES = ['kitchen', 'station', 'harbour wall', 'back room', 'stairwell', 'ferry deck', 'orchard', 'radio shed']
const OBJECTS = ['letter', 'lantern', 'spare key', 'tide table', 'map', 'radio', 'coat', 'ledger']
const PEOPLE = ['Wren', 'Oskar', 'Tamsin']

const SENTENCES = [
  '{A} set the kettle on and waited for it to boil.',
  'The {place} was quieter than {A} remembered.',
  'Rain moved across the window in long grey lines.',
  '{A} turned the {object} over twice before putting it down.',
  '"You could have told me," {B} said.',
  '"I did," said {A}. "You weren\'t listening."',
  'Somewhere below, a door closed and did not open again.',
  'It was nearly dark by the time anyone thought to light the lamps.',
  '{A} counted the steps without meaning to: fourteen, then a landing, then nine more.',
  'Nobody mentioned the {object}, which meant everyone was thinking about it.',
  'The clock in the {place} ran four minutes fast, and always had.',
  '{B} laughed, short and surprised, and then looked away.',
  'There was salt on everything, even here, even this far inland.',
  '{A} had made a list, and none of it was going to plan.',
  'The radio hissed, caught half a word, and lost it.',
  '*Later*, {A} thought. *Later, when there is time.*',
  'They ate standing up, because sitting down would have meant staying.',
  '{B} left the {object} on the table where it could not be missed.',
  'Outside, the wind changed direction and the whole house noticed.',
  'It was not an apology, but it was close enough to pass for one.',
  '{A} waited until the {place} was empty before reading it again.',
  'The light went from grey to gold without anyone seeing it happen.'
]

const BEATS = {
  plot: [
    '{A} finds the {object} in the {place}',
    '{A} and {B} argue about whether to leave tonight',
    '{B} admits they knew about the {object} all along',
    'The plan falls through; {A} improvises',
    '{A} decides to stay'
  ],
  line: [
    '"You could have told me."',
    '"I did. You weren\'t listening."',
    '"It isn\'t far now."',
    '"Leave the light on."'
  ],
  image: [
    'Rain on the window in long grey lines',
    'Salt crusted on the {object}',
    'The {place} lit only by the radio dial',
    'Gold light coming up over the water'
  ],
  continuity: [
    '{A} still has the {object} from earlier',
    'Clock in the {place} runs four minutes fast',
    '{B} is still limping',
    'It has been raining since chapter one'
  ],
  callback: [
    'Echo the fourteen stairs from the opening',
    'Return to the unanswered letter',
    '{B} uses the line from the ferry'
  ],
  thread: [
    'Who sent the {object}?',
    'The radio signal: where is it coming from?',
    '{A} and {B}: not yet resolved'
  ]
}

function fill(template, r, pov) {
  const a = pov === 'ensemble' ? r.pick(PEOPLE) : pov
  const b = r.pick(PEOPLE.filter((p) => p !== a))
  return template
    .replaceAll('{A}', a)
    .replaceAll('{B}', b)
    .replaceAll('{place}', r.pick(PLACES))
    .replaceAll('{object}', r.pick(OBJECTS))
}

// Returns an array of paragraphs (strings). Empty array for an empty file.
export function prose(r, pov) {
  const paragraphs = []
  for (let p = r.int(3, 8); p > 0; p--) {
    // No sentence twice in one paragraph.
    const pool = [...SENTENCES]
    const sentences = []
    for (let s = r.int(2, 5); s > 0; s--) {
      const [template] = pool.splice(Math.floor(r.next() * pool.length), 1)
      sentences.push(fill(template, r, pov))
    }
    paragraphs.push(sentences.join(' '))
  }
  return paragraphs
}

export function sceneTitle(index) {
  return SCENE_TITLES[index % SCENE_TITLES.length]
}

export function beatContent(r, kind, pov) {
  return fill(r.pick(BEATS[kind]), r, pov)
}

// Scene status follows the chapter's: posted and ready chapters are
// finished work, drafting chapters are mixed.
export function sceneStatus(r, chapterStatus) {
  if (chapterStatus === 'drafting') return r.pick(['outlined', 'drafting', 'drafting', 'drafted'])
  return r.pick(['drafted', 'revised', 'revised'])
}

// Beat status follows the scene's.
export function beatStatus(r, sceneStatus) {
  switch (sceneStatus) {
    case 'outlined':
      return 'planned'
    case 'drafting':
      return r.pick(['planned', 'planned', 'in draft', 'in draft', 'cut'])
    default:
      return r.pick(['in draft', 'in draft', 'in draft', 'cut', 'planned'])
  }
}
