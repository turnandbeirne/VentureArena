// ============================================================================
// Business "storefront art" — turning a business NAME into a picture
// ----------------------------------------------------------------------------
// Every business gets a randomly-picked whimsical name (gameConfig.js's
// BUSINESS_NAMES — 500 of them, almost all shaped like "<Owner>'s <Trade>":
// "Auntie Betty's Bakery", "The Zippy Koala Rock Collecting Club"). This
// module reads the TRADE out of that name and returns a small illustrated
// scene for it: a hero emoji, two supporting props, and a color pair for
// the card's gradient.
//
// Why emoji rather than real images: the whole game ships as a static
// bundle with no image assets and no network calls, and the rest of the UI
// is already emoji-first (assets, avatars, badges, the wealth pile). A
// keyword lookup gives every one of the 500 names a genuinely relevant
// picture — a bakery gets a cupcake, a car wash gets a car, a telescope
// shop gets a telescope — with zero bytes of art to load and nothing to
// break offline.
//
// Matching is longest-keyword-first substring matching against the whole
// lowercased name, so "Ice Cream Shop" wins over "Ice Skating" over the
// generic "Shop", and an unmatched name still lands on a sensible generic
// storefront rather than nothing.
// ============================================================================

// [keyword, hero emoji, prop, prop, gradient-start, gradient-end]. Order in
// this array does NOT matter — the lookup below sorts by keyword length so
// the most specific match always wins.
const ART = [
  // --- food & drink ---
  ['ice cream', '🍦', '🍨', '🥄', '#ffd8ec', '#ffb3d9'],
  ['cupcake', '🧁', '🍰', '🎂', '#ffe0ef', '#ffc2dd'],
  ['bakery', '🧁', '🥐', '🍞', '#ffe6cc', '#ffcf9e'],
  ['brownie', '🍫', '🍪', '🥛', '#e8cfae', '#c9a173'],
  ['cookie', '🍪', '🥛', '🍫', '#f6dfb8', '#e2bd80'],
  ['muffin', '🧁', '☕', '🫐', '#ffe9cf', '#ffd0a3'],
  ['pie shop', '🥧', '🍒', '🍴', '#ffe2c2', '#f7c48f'],
  ['donut', '🍩', '☕', '🍬', '#ffdcef', '#ffb8dd'],
  ['pretzel', '🥨', '🧂', '🍺', '#f3d9ab', '#dcb77f'],
  ['bagel', '🥯', '☕', '🧀', '#f5dcb4', '#dfba81'],
  ['pancake', '🥞', '🍯', '🧈', '#ffe4b8', '#f6c27d'],
  ['waffle', '🧇', '🍓', '🍯', '#ffe6bd', '#f8c987'],
  ['pizza', '🍕', '🚚', '🧀', '#ffd9c2', '#ff9f7a'],
  ['taco', '🌮', '🌶️', '🚚', '#ffe0b0', '#ffb457'],
  ['noodle', '🍜', '🥢', '🍥', '#ffe1c9', '#f5b183'],
  ['dumpling', '🥟', '🥢', '🍲', '#ffeccd', '#f7cf9a'],
  ['egg roll', '🥠', '🥢', '🍤', '#ffe8c8', '#f3c88f'],
  ['grilled cheese', '🧀', '🥪', '🚚', '#ffe9a8', '#f8ce5c'],
  ['sandwich', '🥪', '🥤', '🍅', '#ffe7bf', '#f5c47f'],
  ['cheese shop', '🧀', '🥖', '🍇', '#ffeeb0', '#f6d360'],
  ['soup kitchen', '🍲', '🥣', '❤️', '#ffdfc6', '#f0ab86'],
  ['popcorn', '🍿', '🎬', '🧂', '#fff0cf', '#f6d78a'],
  ['cotton candy', '🍭', '🎡', '🎠', '#ffd9f0', '#ffaee0'],
  ['snow cone', '🍧', '🧊', '🌈', '#d8f2ff', '#a5dcff'],
  ['popsicle', '🍡', '🧊', '☀️', '#d9f4ff', '#a9defe'],
  ['fudge', '🍫', '🍬', '🎀', '#e9cdb0', '#c99f70'],
  ['taffy', '🍬', '🎪', '🎀', '#ffdff0', '#ffb6e0'],
  ['honey', '🍯', '🐝', '🌻', '#ffeeb5', '#f7cd58'],
  ['jam making', '🍓', '🫙', '🍞', '#ffd6d6', '#f79c9c'],
  ['pickle', '🥒', '🫙', '🧂', '#dff3cd', '#aedb8f'],
  ['smoothie', '🥤', '🍓', '🍌', '#ffdcea', '#ffaacb'],
  ['juice bar', '🧃', '🍊', '🥕', '#ffe3bd', '#ffbe6e'],
  ['milkshake', '🥤', '🍦', '🍒', '#ffe1ef', '#ffb4d6'],
  ['root beer', '🥤', '🫧', '🧊', '#e8d3b5', '#c9a578'],
  ['hot cocoa', '☕', '🍫', '🧣', '#f0d5bb', '#d3a97f'],
  ['tea house', '🍵', '🫖', '🌸', '#dff0dc', '#a9d6a4'],
  ['coffee', '☕', '🫘', '🥐', '#e6cfb5', '#c19a6b'],
  ['garden center', '🪴', '🌷', '🌱', '#dcf2d2', '#a6dd93'],
  ['herb garden', '🌿', '🪴', '🍃', '#ddf2d6', '#a8dd98'],
  ['mushroom farm', '🍄', '🌲', '🧺', '#ecd9c6', '#cfa987'],
  ['worm farm', '🪱', '🌱', '🪣', '#ded0b6', '#b8a077'],
  ['butterfly garden', '🦋', '🌸', '🌼', '#e2dcff', '#b8aefc'],
  ['birdseed', '🐦', '🌻', '🪺', '#ffeecb', '#f3cf85'],
  ['bonsai', '🌳', '✂️', '🪴', '#dcf0e4', '#a3d5b8'],
  ['composting', '♻️', '🍂', '🪱', '#dff0cd', '#aad78d'],
  ['recycling', '♻️', '🗑️', '🌍', '#d6f0e2', '#9ed7bd'],

  // --- shops & collectibles ---
  ['comic shop', '📚', '🦸', '💥', '#ffe0d0', '#ff9f83'],
  ['bookstore', '📚', '🔖', '☕', '#e3dcff', '#b3a6f7'],
  ['book repair', '📖', '🧵', '🔧', '#e6dcc9', '#c4b391'],
  ['video game', '🎮', '🕹️', '👾', '#ded9ff', '#a89ffb'],
  ['arcade', '🕹️', '👾', '🎯', '#dfd6ff', '#a99cfb'],
  ['trading card', '🃏', '✨', '📦', '#ffe2cd', '#ffb684'],
  ['stamp collecting', '📮', '✉️', '🔍', '#e6ddff', '#b6a7f5'],
  ['coin shop', '🪙', '🔍', '💰', '#ffeec2', '#f5cf6a'],
  ['marble shop', '🔮', '✨', '🫙', '#dde6ff', '#a7bcf9'],
  ['rock polishing', '💎', '🪨', '✨', '#dde9f5', '#a8c5e3'],
  ['rock collecting', '🪨', '💎', '🔍', '#e4ded4', '#bdb2a0'],
  ['rock climbing', '🧗', '🪨', '🧗‍♀️', '#ffdccb', '#f6a67e'],
  ['seashell', '🐚', '🌊', '⭐', '#d9f0f7', '#9ed6e8'],
  ['sticker shop', '✨', '🌈', '💌', '#ffdff2', '#ffb0e2'],
  ['slime shop', '🫧', '🟢', '✨', '#d9f7e0', '#95e7ae'],
  ['puzzle shop', '🧩', '🖼️', '🧠', '#e0e6ff', '#aabbfb'],
  ['board game', '🎲', '🃏', '🍿', '#e6e0f7', '#b3a5e8'],
  ['toy repair', '🧸', '🔧', '🪀', '#ffe1d5', '#f8ab8d'],
  ['toy library', '🧸', '📚', '🪀', '#ffe4dc', '#f9b39c'],
  ['yo-yo', '🪀', '✨', '🎯', '#ffe1cd', '#f7b37c'],
  ['kite', '🪁', '☁️', '🌬️', '#d8ecff', '#9fcdf7'],
  ['hat shop', '🎩', '🧢', '👒', '#e5dcf7', '#b6a5e8'],
  ['mitten', '🧤', '❄️', '🧣', '#dfeaff', '#a9c4f5'],
  ['scarf knitting', '🧣', '🧶', '🪡', '#ffdde4', '#f5a6b6'],
  ['knitting', '🧶', '🪡', '🧣', '#ffe0e6', '#f7abb9'],
  ['quilt', '🧵', '🪡', '🛏️', '#ffe2d9', '#f6ad99'],
  ['sewing', '🪡', '🧵', '👗', '#ffdfe8', '#f6a9bd'],
  ['costume shop', '🎭', '👑', '🦸', '#ecd9ff', '#c0a1f5'],
  ['sunglasses', '🕶️', '☀️', '🏖️', '#ffe8b8', '#f9cb60'],
  ['umbrella', '☂️', '🌧️', '💧', '#d8e6ff', '#a1bff5'],
  ['rain boot', '🥾', '🌧️', '💦', '#d9e9ff', '#a3c4f7'],
  ['rain barrel', '🛢️', '🌧️', '🌱', '#d9ecf5', '#a3cee2'],
  ['compass', '🧭', '🗺️', '⛰️', '#e0e2d2', '#b4b895'],
  ['map making', '🗺️', '🧭', '✏️', '#f0e3c8', '#d3bf8f'],
  ['telescope', '🔭', '⭐', '🌙', '#d7dcf7', '#9ba4e8'],
  ['model train', '🚂', '🛤️', '🎁', '#e2ddd0', '#b9ae94'],
  ['skateboard', '🛹', '🧢', '🛞', '#ffdfd0', '#f7a887'],
  ['skate ramp', '🛹', '🔨', '🪵', '#ffe0cf', '#f6a985'],
  ['craft supply', '✂️', '🖍️', '📎', '#ffe2ef', '#ffb2d5'],
  ['papercraft', '📄', '✂️', '🎨', '#ffeede', '#f9cfa9'],
  ['origami', '🦢', '📄', '✨', '#e6f0ff', '#b3ccf7'],
  ['greeting card', '💌', '✏️', '🎀', '#ffe0ec', '#ffb1cf'],
  ['gift wrapping', '🎁', '🎀', '✂️', '#ffdfe6', '#ffabbf'],
  ['button making', '🔘', '🎨', '📌', '#e6e0f7', '#b7a9e5'],
  ['friendship bracelet', '🧶', '💖', '🪢', '#ffdfef', '#ffaed6'],
  ['aquarium', '🐠', '🫧', '🪸', '#d5f0ff', '#93d5f7'],
  ['candle making', '🕯️', '🔥', '🫙', '#ffe8cf', '#f7c88e'],
  ['pottery', '🏺', '🎨', '🪵', '#f0dcc4', '#d3b083'],
  ['woodworking', '🪵', '🔨', '📏', '#e8d5b7', '#c4a173'],
  ['chalk art', '🖍️', '🌈', '🛝', '#ffe6f2', '#ffb8dd'],
  ['sidewalk mural', '🎨', '🖌️', '🌈', '#ffe1ef', '#ffb0d3'],
  ['photography', '📷', '🖼️', '✨', '#e0e0e8', '#adadbe'],

  // --- services ---
  ['car wash', '🚗', '🫧', '🧽', '#d8ecff', '#9fcdf7'],
  ['window washing', '🪟', '🫧', '🧽', '#dceffb', '#a6d3ee'],
  ['gutter cleaning', '🏠', '🪣', '🧤', '#e0e4d8', '#b2b99f'],
  ['chimney sweep', '🧹', '🏠', '🔥', '#ded8d2', '#aea69c'],
  ['solar panel', '☀️', '🔆', '🧽', '#fff0c2', '#f8d55f'],
  ['snow shoveling', '❄️', '🧤', '🏠', '#e4f0ff', '#b3d0f5'],
  ['snowman', '⛄', '❄️', '🥕', '#e6f2ff', '#b8d6f7'],
  ['snowball fight', '⛄', '❄️', '🧤', '#e2f0ff', '#b0d2f7'],
  ['leaf raking', '🍂', '🧹', '🌳', '#ffe4c4', '#f5bd81'],
  ['firewood', '🪵', '🔥', '🚚', '#e5cfb0', '#bf9a6c'],
  ['fence painting', '🪵', '🖌️', '🎨', '#f0e3ca', '#d0b98d'],
  ['lawn', '🌱', '🚜', '☀️', '#ddf2cf', '#a7de8c'],
  ['dog walking', '🐕', '🦮', '🦴', '#ffe6d4', '#f8b892'],
  ['doghouse', '🏠', '🐕', '🔨', '#ffe3d2', '#f8b58f'],
  ['pet grooming', '🐩', '✂️', '🫧', '#ffe0ee', '#ffaed4'],
  ['pet sitting', '🐈', '🐕', '💤', '#ffe6dd', '#f9b8a3'],
  ['plant sitting', '🪴', '💧', '☀️', '#ddf2d8', '#a5dda0'],
  ['chicken coop', '🐔', '🥚', '🔨', '#ffeecb', '#f4cf84'],
  ['petting zoo', '🐐', '🐑', '🌾', '#ffeed2', '#f4ce8c'],
  ['pony rides', '🐴', '🌾', '🤠', '#ffe6cc', '#f4c184'],
  ['llama walking', '🦙', '🥾', '⛰️', '#ffeadb', '#f6c39b'],
  ['errand running', '🏃', '🛍️', '📋', '#e0eaff', '#adc4f7'],
  ['tutoring', '📖', '✏️', '💡', '#e2e6ff', '#adb8f9'],
  ['tech support', '💻', '🔧', '💡', '#dde4f0', '#a9b8d6'],
  ['computer repair', '💻', '🔧', '🖱️', '#dee4ef', '#aab6d3'],
  ['electronics repair', '🔌', '🔧', '📻', '#dfe4ee', '#abb6d2'],
  ['bike repair', '🚲', '🔧', '🛞', '#dfeeff', '#a9ccf5'],
  ['bike rental', '🚲', '🗺️', '☀️', '#dfeeff', '#a9ccf5'],
  ['scooter repair', '🛴', '🔧', '🛞', '#e0ecff', '#aac8f7'],
  ['pogo stick', '🦘', '🔧', '🌀', '#ffe2f0', '#ffb0d8'],
  ['wagon repair', '🛒', '🔨', '🛞', '#f0dfc4', '#d1b581'],
  ['mailbox repair', '📪', '🔨', '✉️', '#e6ddd0', '#bcae99'],
  ['fort building', '🏰', '🔨', '🪵', '#ffe6cd', '#f4c188'],
  ['blanket fort', '🛏️', '🏰', '🔦', '#ffe4ee', '#ffb2cf'],
  ['treehouse building', '🏡', '🌳', '🔨', '#ddf0d6', '#a4d69b'],
  ['sandcastle', '🏰', '🏖️', '🪣', '#ffeecc', '#f5d287'],
  ['birthday party', '🎂', '🎈', '🎉', '#ffdfef', '#ffabd5'],
  ['scavenger hunt', '🗺️', '🔍', '🏆', '#ffe9cf', '#f5c98d'],
  ['treasure hunt', '🗺️', '💎', '⚓', '#ffe7c2', '#f3c476'],
  ['escape room', '🔐', '🗝️', '⏱️', '#ded9e8', '#aaa1c4'],
  ['weather station', '🌦️', '🌡️', '📡', '#d9e9f7', '#a3c6e8'],
  ['fishing guide', '🎣', '🐟', '🚤', '#d7eefa', '#9ad3ec'],
  ['canoe', '🛶', '🌊', '🏕️', '#d9eff5', '#9ed5e3'],
  ['kayak', '🛶', '🌊', '⛰️', '#d8eef7', '#9cd3e8'],
  ['sled rental', '🛷', '❄️', '⛰️', '#e4f0ff', '#b2d1f7'],
  ['roller skate', '🛼', '🌈', '🎶', '#ffdff0', '#ffaddb'],
  ['roller rink', '🛼', '🪩', '🎶', '#ecdcff', '#c0a3f7'],
  ['ice skating', '⛸️', '❄️', '🎶', '#e2f2ff', '#aed6f9'],
  ['trampoline', '🤸', '🌀', '🎪', '#ffe3d6', '#f8b193'],
  ['mini golf', '⛳', '🏌️', '🌈', '#ddf2d4', '#a5dd97'],
  ['frisbee golf', '🥏', '🌳', '⛳', '#ddf2d4', '#a5dd97'],
  ['hopscotch', '🔢', '🖍️', '🦘', '#ffe3f0', '#ffb2d9'],
  ['hula hoop', '🌀', '🎶', '✨', '#ffe0f2', '#ffabde'],
  ['jump rope', '🤾', '🎶', '⏱️', '#ffe2ea', '#ffaec2'],
  ['juggling', '🤹', '🎪', '🎯', '#ffe1d2', '#f9ab8a'],
  ['magic show', '🎩', '🪄', '✨', '#e2d6f7', '#b096ec'],
  ['puppet theater', '🎭', '🧦', '🎪', '#ffe0e8', '#f8a9bd'],
  ['drone racing', '🛸', '🏁', '📡', '#dde3f0', '#a7b4d4'],
  ['robot building', '🤖', '🔧', '⚙️', '#dfe6f2', '#aabbd8'],
  ['bug collecting', '🐞', '🦋', '🔍', '#e2f0d4', '#aed897'],
  ['face painting', '🎨', '🐯', '🖌️', '#ffe0ef', '#ffaad5'],
  ['balloon animal', '🎈', '🐩', '🎪', '#ffe0e6', '#ffaabc'],
  ['balloon delivery', '🎈', '🚚', '🎉', '#ffe1ec', '#ffabc9'],
  ['popcorn delivery', '🍿', '🚚', '🎬', '#fff0cf', '#f6d78a'],

];

// Generic fallbacks, checked ONLY after every specific trade above has been
// ruled out. They have to be a separate list rather than just short
// keywords in the same one, because "most specific wins" and "longest
// keyword wins" disagree exactly here: "Cookie Company" would otherwise
// match the 7-letter generic 'company' over the 6-letter specific 'cookie',
// and "Kayak Rental" the 6-letter 'rental' over the 5-letter 'kayak'.
const GENERIC_ART = [
  ['delivery', '🚚', '📦', '🗺️', '#ffe6cf', '#f6c187'],
  ['rental', '🔑', '📋', '🏷️', '#e2e8f2', '#b0bcd2'],
  ['repair', '🔧', '🔨', '⚙️', '#e4e2dc', '#b8b3a7'],
  ['lessons', '🎓', '📋', '⭐', '#e2e6ff', '#adb8f9'],
  ['coaching', '📣', '🏅', '📋', '#ffe4d2', '#f8b48f'],
  ['planning', '📋', '✨', '🗓️', '#e6e2f7', '#b5abe5'],
  ['studio', '🎨', '🖌️', '✨', '#ffe2ee', '#ffb0d3'],
  ['gym', '💪', '🏅', '🧗', '#ffdfd2', '#f8a98c'],
  ['club', '🎟️', '🤝', '⭐', '#e6e0f2', '#b5abd2'],
  ['cafe', '☕', '🍰', '🪑', '#e8d3b8', '#c8a273'],
  ['truck', '🚚', '🍽️', '🔥', '#ffe0c8', '#f7ba7f'],
  ['cart', '🛒', '🍽️', '☀️', '#ffe4c9', '#f6bd7f'],
  ['stand', '🏪', '☀️', '💵', '#ffe9cc', '#f6c982'],
  ['farm', '🚜', '🌾', '☀️', '#ffeecb', '#f3cd80'],
  ['service', '🛠️', '📋', '🤝', '#e4e6ee', '#b3b8ca'],
  ['shop', '🏪', '🛍️', '💵', '#ffe7d4', '#f7bd94'],
  ['company', '🏢', '📈', '💼', '#e0e6f2', '#aab6d0'],
  ['building', '🔨', '🪵', '📐', '#f0e0c6', '#d0b487'],
  ['painting', '🖌️', '🎨', '🪣', '#ffe2ec', '#ffb0cd'],
  ['cleaning', '🧽', '🫧', '🪣', '#dcf0f7', '#a3d4e8'],
];

const DEFAULT_ART = { hero: '🏪', props: ['📈', '💵'], from: '#e6ecf7', to: '#b4c2dc' };

// Within each tier, longest keyword first, so a specific trade beats a
// less specific one that happens to appear inside the same name ("Ice Cream
// Shop" must not match on "ice"). Computed once at module load, not per
// lookup.
const byKeywordLength = (a, b) => b[0].length - a[0].length;
const SORTED_ART = [...ART].sort(byKeywordLength);
const SORTED_GENERIC_ART = [...GENERIC_ART].sort(byKeywordLength);

/**
 * The illustrated scene for a business name: `{ hero, props, from, to }` —
 * hero emoji, two supporting prop emoji, and the two ends of the card's
 * background gradient. Always returns something; an unrecognized name gets
 * a generic storefront.
 */
export function businessArt(name) {
  const haystack = (name || '').toLowerCase();
  for (const [keyword, hero, propA, propB, from, to] of SORTED_ART) {
    if (haystack.includes(keyword)) return { hero, props: [propA, propB], from, to };
  }
  for (const [keyword, hero, propA, propB, from, to] of SORTED_GENERIC_ART) {
    if (haystack.includes(keyword)) return { hero, props: [propA, propB], from, to };
  }
  return DEFAULT_ART;
}
