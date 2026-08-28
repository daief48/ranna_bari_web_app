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

/** A token and every other way of writing it. */
export function expand(token) {
  return INDEX.get(token) ?? [token];
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
      else if (fuzzyHit(tokens[i], nameWords)) best = RANK.FUZZY;

      if (best === RANK.NONE) return RANK.NONE;
      if (best > worst) worst = best;
    }

    return worst;
  };

  return { phrase, tokens, rank };
}
