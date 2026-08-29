/**
 * Matching what people type against food that is written one particular way.
 *
 * Bengali dish names have no settled English spelling. The menu says
 * "Biryani"; people type biriyani, biriani, birani. It says "Shorshe Bata
 * Ilish"; people type elish, hilsa, or the whole thing in Bengali. Every one
 * of those returned nothing, and an empty result reads as "this app does not
 * have biryani" rather than "you spelled it differently from the cook".
 *
 * Three layers, in order of confidence:
 *   1. the literal text
 *   2. known spellings of the same word, including the Bengali script
 *   3. an edit-distance fallback for genuine typos
 *
 * They are ranked, not merged, so a real match is never pushed below a guess.
 */

/* Punctuation out, Bengali left alone. `\w` plus the Bengali block rather
   than \p{L}, which not every engine this ships to supports. */
const STRIP = /[^\wঀ-৿]+/g;

export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(STRIP, ' ')
    .trim();
}

export function tokenize(query) {
  const clean = normalise(query);
  return clean ? clean.split(' ').filter(Boolean) : [];
}

/**
 * Words that mean the same food.
 *
 * Every member of a group finds every other, so "fish" reaches "Rui Macher
 * Jhol" and "মাছ" reaches both. Groups stay narrow on purpose: widening
 * "curry" to every wet dish would make the search feel broken in the other
 * direction.
 */
const GROUPS = [
  // rice dishes
  ['biryani', 'biriyani', 'biriani', 'birani', 'biryany', 'বিরিয়ানি', 'বিরিয়ানী'],
  ['kacchi', 'kachchi', 'kacci', 'kachi', 'কাচ্চি'],
  ['tehari', 'tehri', 'teheri', 'তেহারি'],
  ['polao', 'pulao', 'pilau', 'polau', 'pollao', 'পোলাও'],
  ['khichuri', 'khichdi', 'khichri', 'khichudi', 'khicuri', 'খিচুড়ি'],
  ['rice', 'bhat', 'vat', 'ভাত'],

  // proteins
  ['chicken', 'morog', 'murog', 'murgi', 'murgh', 'মুরগি', 'মোরগ'],
  ['beef', 'goru', 'gorur', 'গরু', 'গরুর'],
  ['mutton', 'khashi', 'khasi', 'lamb', 'খাসি'],
  ['fish', 'mach', 'macher', 'maach', 'machher', 'মাছ'],
  ['hilsa', 'ilish', 'elish', 'ilisha', 'ইলিশ'],
  ['prawn', 'shrimp', 'chingri', 'chingdi', 'চিংড়ি'],
  ['crab', 'kakra', 'কাঁকড়া'],
  ['rui', 'rohu', 'রুই'],
  ['koi', 'কই'],
  ['pabda', 'পাবদা'],
  ['rupchanda', 'pomfret', 'রূপচাঁদা'],
  ['shutki', 'sutki', 'shuntki', 'শুঁটকি'],
  ['egg', 'dim', 'ডিম'],

  // preparations
  ['bhuna', 'bhoona', 'vuna', 'buna', 'ভুনা'],
  ['bhorta', 'bharta', 'vorta', 'borta', 'ভর্তা'],
  ['bhaja', 'vaja', 'fry', 'ভাজা'],
  ['shorshe', 'sorshe', 'mustard', 'সরিষা'],
  ['rezala', 'rejala', 'রেজালা'],
  ['kebab', 'kabab', 'kabob', 'কাবাব'],
  ['tikka', 'tika', 'টিক্কা'],
  ['haleem', 'halim', 'হালিম'],
  ['nihari', 'nehari', 'নিহারি'],
  ['thali', 'thala', 'platter', 'থালি'],

  // snacks and street food
  ['fuchka', 'fuska', 'puchka', 'phuchka', 'ফুচকা'],
  ['chotpoti', 'chatpati', 'chotpati', 'চটপটি'],
  ['jhalmuri', 'ঝালমুড়ি'],
  ['shingara', 'singara', 'samosa', 'সিঙ্গারা'],
  ['piyaju', 'peyaju', 'পিঁয়াজু'],
  ['beguni', 'begoni', 'বেগুনি'],
  ['paratha', 'porota', 'parota', 'porata', 'পরোটা'],
  ['luchi', 'loochi', 'লুচি'],

  // sweets
  ['pitha', 'peetha', 'pithe', 'পিঠা'],
  ['payesh', 'payes', 'kheer', 'পায়েস'],
  ['jilapi', 'jalebi', 'jilebi', 'জিলাপি'],
  ['jorda', 'zarda', 'zorda', 'জর্দা'],
  ['sweet', 'misti', 'mishti', 'মিষ্টি'],
  ['cake', 'কেক'],

  // regional
  ['sylheti', 'sylhet', 'সিলেটি'],
  ['shatkora', 'hatkora', 'satkora', 'সাতকরা'],
  ['mezbani', 'mezban', 'মেজবান'],
  ['chattogram', 'chittagong', 'ctg', 'চট্টগ্রাম'],

  // drinks and meal words
  ['borhani', 'borhany', 'বোরহানি'],
  ['dal', 'daal', 'lentil', 'ডাল'],
  ['iftar', 'ifter', 'ইফতার'],
  ['breakfast', 'nasta', 'nashta', 'নাস্তা', 'সকাল'],
  ['lunch', 'dupur', 'দুপুর'],
  ['dinner', 'rat', 'রাত'],
  ['vegetarian', 'veg', 'veggie', 'niramish', 'নিরামিষ'],
  ['vegan', 'ভেগান'],
];

/** token -> every spelling of the same word, built once. */
const INDEX = new Map();
for (const group of GROUPS) {
  for (const word of group) {
    INDEX.set(word, group);
  }
}

/* ------------------------------------------------------------------ *
 * Bengali, for the words nobody listed
 * ------------------------------------------------------------------ */

/**
 * Sound out a Bengali word in Latin letters.
 *
 * `GROUPS` above is a hand-written list, and a hand-written list is only ever
 * as good as the day somebody last thought about it: type মাংস, or a dish
 * name no one anticipated, and the whole ladder returns nothing. This is the
 * general case behind the specific one — a rough phonetic rendering, matched
 * against the menu's Latin spelling by the same fuzzy layer that already
 * forgives typos.
 *
 * Rough is the point. Bengali orthography does not map cleanly onto Latin
 * and the transcription people actually type is inconsistent anyway
 * (mangsho / mangso / mangs). Getting within an edit or two of the menu is
 * the whole job; anything more precise would match *fewer* of the spellings
 * real people use.
 *
 * The inherent vowel is the one real decision: অ is written between
 * consonants and dropped at the end, which is what makes মাংস "mangsho"
 * rather than "mangsa".
 */
const BENGALI = {
  "অ": 'o', "আ": 'a', "ই": 'i', "ঈ": 'i', "উ": 'u', "ঊ": 'u', "ঋ": 'ri',
  "এ": 'e', "ঐ": 'oi', "ও": 'o', "ঔ": 'ou',

  // vowel signs
  "া": 'a', "ি": 'i', "ী": 'i', "ু": 'u', "ূ": 'u', "ৃ": 'ri',
  "ে": 'e', "ৈ": 'oi', "ো": 'o', "ৌ": 'ou',

  "ক": 'k', "খ": 'kh', "গ": 'g', "ঘ": 'gh', "ঙ": 'ng',
  "চ": 'ch', "ছ": 'chh', "জ": 'j', "ঝ": 'jh', "ঞ": 'n',
  "ট": 't', "ঠ": 'th', "ড": 'd', "ঢ": 'dh', "ণ": 'n',
  "ত": 't', "থ": 'th', "দ": 'd', "ধ": 'dh', "ন": 'n',
  "প": 'p', "ফ": 'ph', "ব": 'b', "ভ": 'bh', "ম": 'm',
  "য": 'j', "র": 'r', "ল": 'l', "শ": 'sh', "ষ": 'sh', "স": 's', "হ": 'h',
  "ড়": 'r', "ঢ়": 'rh', "য়": 'y', "ৎ": 't',

  "ং": 'ng', "ঃ": 'h', "ঁ": '',
  '্': '', // hasanta: kills the inherent vowel, handled below
};

/** Every Bengali vowel sign, so the inherent vowel is not doubled onto one. */
const SIGNS = new Set(['া', 'ি', 'ী', 'ু', 'ূ', 'ৃ', 'ে', 'ৈ', 'ো', 'ৌ', '্', 'ং', 'ঃ', 'ঁ']);

const CONSONANT = /[ক-হড়ঢ়য়ৎ]/;

/**
 * The nukta, U+09BC.
 *
 * ড়, ঢ় and য় are each two code points — a base letter and this — unless the
 * text happens to arrive precomposed, which a phone keyboard does not
 * guarantee. Reading one character at a time therefore sees ড, emits "d",
 * then meets a mark it has no entry for: চিংড়ি came out "chingdoi" instead
 * of "chingri". The pair has to be consumed together.
 */
const NUKTA = '়';

export function romanise(word) {
  const text = String(word ?? '');
  if (!/[ঀ-৿]/.test(text)) return '';

  let out = '';
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];

    // Take the nukta with its base letter, however the keyboard sent it.
    if (text[i + 1] === NUKTA && BENGALI[ch + NUKTA] !== undefined) {
      ch += NUKTA;
      i += 1;
    }

    const mapped = BENGALI[ch];
    if (mapped === undefined) continue;
    out += mapped;

    /* The inherent vowel: a consonant with nothing modifying it is followed
       by a short "o" — except at the very end of the word, where Bengali
       drops it. মাংস → m-a-ng-s(+o) → "mangso". */
    if (CONSONANT.test(ch)) {
      const next = text[i + 1];
      const last = i === text.length - 1;
      if (!last && !SIGNS.has(next)) out += 'o';
    }
  }
  return out;
}

/**
 * A token and every other way of writing it.
 *
 * The curated group first, because a hand-picked spelling beats a guess. A
 * Bengali word with no group falls through to its sounded-out form, which the
 * fuzzy layer can then get the rest of the way.
 */
export function expand(token) {
  const group = INDEX.get(token);
  if (group) return group;

  const roman = romanise(token);
  return roman && roman !== token ? [token, roman] : [token];
}

/**
 * Levenshtein, capped.
 *
 * Bails as soon as a row's best is already over the limit, so a long query
 * against eighty menus stays cheap.
 */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * How wrong a word may be before the match stops being believable.
 *
 * Short words get no slack at all: at three letters, one edit reaches half
 * the dictionary, and "dal" matching "dim" helps nobody.
 */
function slack(word) {
  if (word.length < 5) return 0;
  if (word.length < 8) return 1;
  return 2;
}

function fuzzyHit(token, haystackWords) {
  const max = slack(token);
  if (!max) return false;
  return haystackWords.some((word) => {
    if (word.length < 4) return false;
    return editDistance(token, word, max) <= max;
  });
}

/** Ranks, best first. Exported so callers can talk about them by name. */
export const RANK = {
  NAME_PREFIX: 0,
  NAME: 1,
  TAG: 2,
  TEXT: 3,
  FUZZY: 4,
  NONE: -1,
};

/**
 * Build a matcher for one query.
 *
 * Returns null for an empty query rather than a matcher that says yes to
 * everything, so callers have to decide what "no query" means for them.
 */
export function makeMatcher(query) {
  const phrase = normalise(query);
  if (!phrase) return null;

  const tokens = tokenize(query);
  const variants = tokens.map(expand);

  /**
   * @param {{name?: string, tags?: string[], text?: string}} fields
   * @returns {number} a RANK, or RANK.NONE
   */
  const rank = (fields) => {
    const name = normalise(fields.name);
    const tags = (fields.tags ?? []).map(normalise).join(' ');
    const text = normalise(fields.text);

    // The whole query, typed as written -- the only thing worth ranking top.
    if (name.startsWith(phrase)) return RANK.NAME_PREFIX;
    if (name.includes(phrase)) return RANK.NAME;

    /* Otherwise every word has to land somewhere, and the result is only as
       good as its weakest word: "chicken zzz" must not rank as a chicken
       match just because one of the two words was found. */
    const nameWords = name.split(' ').filter(Boolean);
    let worst = RANK.NAME_PREFIX;

    for (let i = 0; i < tokens.length; i++) {
      const spellings = variants[i];
      let best = RANK.NONE;

      if (spellings.some((v) => name.includes(v))) best = RANK.NAME;
      else if (tags && spellings.some((v) => tags.includes(v))) best = RANK.TAG;
      else if (text && spellings.some((v) => text.includes(v))) best = RANK.TEXT;
      /* Every spelling gets a turn at the fuzzy layer, not just the one that
         was typed. A Bengali word's only Latin form is the one `romanise`
         produced, and it is approximate by design — so it is exactly the
         spelling that needs an edit or two of slack to reach the menu. */
      else if (spellings.some((v) => fuzzyHit(v, nameWords))) best = RANK.FUZZY;

      if (best === RANK.NONE) return RANK.NONE;
      if (best > worst) worst = best;
    }

    return worst;
  };

  return { phrase, tokens, rank };
}
