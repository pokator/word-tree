// Hand-curated MVP dataset: a small, richly interconnected set of common
// Japanese words and the kanji they're composed of. This is NOT a complete
// dictionary -- it's just enough overlap between words to demonstrate the
// "word tree" exploration concept (word -> component kanji -> other words
// sharing that kanji -> ...).
//
// Sources for meanings/readings: standard jouyou kanji references (memory),
// not pulled from any external dataset. Good enough for a prototype; a real
// version should use a licensed dictionary (e.g. JMdict/KANJIDIC2).

export const KANJI = {
  日: { char: "日", meaning: "day / sun", onyomi: ["ニチ", "ジツ"], kunyomi: ["ひ", "か"] },
  本: { char: "本", meaning: "origin / book", onyomi: ["ホン"], kunyomi: ["もと"] },
  人: { char: "人", meaning: "person", onyomi: ["ジン", "ニン"], kunyomi: ["ひと"] },
  語: { char: "語", meaning: "language / word", onyomi: ["ゴ"], kunyomi: ["かた.る"] },
  国: { char: "国", meaning: "country", onyomi: ["コク"], kunyomi: ["くに"] },
  学: { char: "学", meaning: "study / learning", onyomi: ["ガク"], kunyomi: ["まな.ぶ"] },
  校: { char: "校", meaning: "school", onyomi: ["コウ"], kunyomi: [] },
  生: { char: "生", meaning: "life / birth / raw", onyomi: ["セイ", "ショウ"], kunyomi: ["い.きる", "う.まれる"] },
  先: { char: "先", meaning: "previous / ahead", onyomi: ["セン"], kunyomi: ["さき"] },
  話: { char: "話", meaning: "talk / speak", onyomi: ["ワ"], kunyomi: ["はな.す"] },
  電: { char: "電", meaning: "electricity", onyomi: ["デン"], kunyomi: [] },
  気: { char: "気", meaning: "spirit / energy", onyomi: ["キ", "ケ"], kunyomi: [] },
  天: { char: "天", meaning: "heaven / sky", onyomi: ["テン"], kunyomi: ["あめ"] },
  水: { char: "水", meaning: "water", onyomi: ["スイ"], kunyomi: ["みず"] },
  火: { char: "火", meaning: "fire", onyomi: ["カ"], kunyomi: ["ひ"] },
  木: { char: "木", meaning: "tree / wood", onyomi: ["モク", "ボク"], kunyomi: ["き"] },
  金: { char: "金", meaning: "gold / money", onyomi: ["キン", "コン"], kunyomi: ["かね"] },
  土: { char: "土", meaning: "earth / soil", onyomi: ["ド", "ト"], kunyomi: ["つち"] },
  月: { char: "月", meaning: "moon / month", onyomi: ["ゲツ", "ガツ"], kunyomi: ["つき"] },
  曜: { char: "曜", meaning: "weekday", onyomi: ["ヨウ"], kunyomi: [] },
  会: { char: "会", meaning: "meet / meeting", onyomi: ["カイ"], kunyomi: ["あ.う"] },
  社: { char: "社", meaning: "company / shrine", onyomi: ["シャ"], kunyomi: ["やしろ"] },
  員: { char: "員", meaning: "member", onyomi: ["イン"], kunyomi: [] },
  大: { char: "大", meaning: "big", onyomi: ["ダイ", "タイ"], kunyomi: ["おお.きい"] },
  小: { char: "小", meaning: "small", onyomi: ["ショウ"], kunyomi: ["ちい.さい"] },
  中: { char: "中", meaning: "middle / inside", onyomi: ["チュウ"], kunyomi: ["なか"] },
  外: { char: "外", meaning: "outside", onyomi: ["ガイ", "ゲ"], kunyomi: ["そと"] },
  内: { char: "内", meaning: "inside", onyomi: ["ナイ"], kunyomi: ["うち"] },
  手: { char: "手", meaning: "hand", onyomi: ["シュ"], kunyomi: ["て"] },
  力: { char: "力", meaning: "power / strength", onyomi: ["リョク", "リキ"], kunyomi: ["ちから"] },
  車: { char: "車", meaning: "car / vehicle", onyomi: ["シャ"], kunyomi: ["くるま"] },
  元: { char: "元", meaning: "origin / vigor", onyomi: ["ゲン", "ガン"], kunyomi: ["もと"] },
};

// components lists each kanji once even if it appears twice in the word
// (e.g. 日曜日 visually repeats 日, but we only need one edge to it).
export const WORDS = [
  { word: "日本", reading: "にほん", meaning: "Japan", components: ["日", "本"] },
  { word: "日本語", reading: "にほんご", meaning: "Japanese language", components: ["日", "本", "語"] },
  { word: "日本人", reading: "にほんじん", meaning: "Japanese person", components: ["日", "本", "人"] },
  { word: "本人", reading: "ほんにん", meaning: "the person themself", components: ["本", "人"] },
  { word: "外国人", reading: "がいこくじん", meaning: "foreigner", components: ["外", "国", "人"] },
  { word: "外国語", reading: "がいこくご", meaning: "foreign language", components: ["外", "国", "語"] },
  { word: "国語", reading: "こくご", meaning: "national language / Japanese (subject)", components: ["国", "語"] },
  { word: "学校", reading: "がっこう", meaning: "school", components: ["学", "校"] },
  { word: "学生", reading: "がくせい", meaning: "student", components: ["学", "生"] },
  { word: "先生", reading: "せんせい", meaning: "teacher", components: ["先", "生"] },
  { word: "電話", reading: "でんわ", meaning: "telephone", components: ["電", "話"] },
  { word: "電車", reading: "でんしゃ", meaning: "train", components: ["電", "車"] },
  { word: "会話", reading: "かいわ", meaning: "conversation", components: ["会", "話"] },
  { word: "社会", reading: "しゃかい", meaning: "society", components: ["社", "会"] },
  { word: "会社", reading: "かいしゃ", meaning: "company", components: ["会", "社"] },
  { word: "社員", reading: "しゃいん", meaning: "employee", components: ["社", "員"] },
  { word: "天気", reading: "てんき", meaning: "weather", components: ["天", "気"] },
  { word: "元気", reading: "げんき", meaning: "energetic / well", components: ["元", "気"] },
  { word: "元日", reading: "がんじつ", meaning: "New Year's Day", components: ["元", "日"] },
  { word: "気力", reading: "きりょく", meaning: "energy / vitality", components: ["気", "力"] },
  { word: "水曜日", reading: "すいようび", meaning: "Wednesday", components: ["水", "曜", "日"] },
  { word: "火曜日", reading: "かようび", meaning: "Tuesday", components: ["火", "曜", "日"] },
  { word: "木曜日", reading: "もくようび", meaning: "Thursday", components: ["木", "曜", "日"] },
  { word: "金曜日", reading: "きんようび", meaning: "Friday", components: ["金", "曜", "日"] },
  { word: "土曜日", reading: "どようび", meaning: "Saturday", components: ["土", "曜", "日"] },
  { word: "日曜日", reading: "にちようび", meaning: "Sunday", components: ["日", "曜"] },
  { word: "月曜日", reading: "げつようび", meaning: "Monday", components: ["月", "曜", "日"] },
  { word: "中国", reading: "ちゅうごく", meaning: "China", components: ["中", "国"] },
  { word: "中国語", reading: "ちゅうごくご", meaning: "Chinese language", components: ["中", "国", "語"] },
  { word: "中国人", reading: "ちゅうごくじん", meaning: "Chinese person", components: ["中", "国", "人"] },
  { word: "大人", reading: "おとな", meaning: "adult", components: ["大", "人"] },
  { word: "大国", reading: "たいこく", meaning: "great power (country)", components: ["大", "国"] },
  { word: "小学校", reading: "しょうがっこう", meaning: "elementary school", components: ["小", "学", "校"] },
  { word: "中学校", reading: "ちゅうがっこう", meaning: "middle school", components: ["中", "学", "校"] },
  { word: "手話", reading: "しゅわ", meaning: "sign language", components: ["手", "話"] },
  { word: "車内", reading: "しゃない", meaning: "inside the train/car", components: ["車", "内"] },
  { word: "社内", reading: "しゃない", meaning: "in-house / within the company", components: ["社", "内"] },
  { word: "国内", reading: "こくない", meaning: "domestic (within the country)", components: ["国", "内"] },
];

export const WORDS_BY_TEXT = Object.fromEntries(WORDS.map((w) => [w.word, w]));

// Reverse index: kanji char -> list of words that contain it.
export const WORDS_CONTAINING_KANJI = (() => {
  const index = {};
  for (const w of WORDS) {
    for (const k of w.components) {
      if (!index[k]) index[k] = [];
      index[k].push(w.word);
    }
  }
  return index;
})();
