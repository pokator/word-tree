# Semantic neighbours (prototype)

An offline experiment for a separate "meaning mode" in Moto, where a word
branches into words that are related in meaning instead of words that share
its kanji. Nothing in the app uses this yet.

## How it works

`build_neighbours.py` reads [chiVe](https://github.com/WorksApplications/chiVe)
1.3 `mc90` word vectors (word2vec on CommonCrawl Japanese, Sudachi
tokenisation, Apache-2.0, 594MB download from
`https://sudachi.s3-ap-northeast-1.amazonaws.com/chive/chive-1.3-mc90.tar.gz`)
and finds, for each ranked JMdict word, its nearest neighbours by cosine
similarity.

- **Coverage:** chiVe knows 82,145 of the 228k JMdict headwords, including
  26,844 of the 30,389 ranked (common) words. Every one of those that is
  ranked or among chiVe's 60k most frequent words gets a neighbour list
  (43,785 roots), and any of the 82k can show up as a neighbour.
- **Commonness:** chiVe's vocabulary is in corpus-frequency order, so a
  word's line number shows how common it is, for every word and not only the
  ~13% JMdict ranks. The script keeps up to 6 / 8 / 10 neighbours in three
  frequency bands (index < 15k common, < 60k everyday, beyond that rare),
  weighted toward the rare end so the Adventurous end of the dial has plenty
  to pick from. The app re-scores with
  `similarity + 2·(2·dial − 1)·log-frequency` (`src/graph/commonness.js`):
  the middle of the dial is pure similarity, and the ends pull hard toward
  everyday or rare words.
- **Variety:** within a band, picks are diversified (maximal marginal
  relevance, λ = 0.75). Other spellings of the root, pieces of the root, and
  more than 2 words per band that share the root's kanji are dropped, since
  kanji mode already covers those.

## Sample output

From the first prototype run, which kept 8 neighbours per band:

```

## 学校 (school)
  [common] 中学校(junior high school), 公立(public (institution)), 高等(high class), 生徒(pupil), 中高(middle and high school), 進学(entering a higher-leve), 教員(teacher), 幼稚(infancy)
  [everyday] 全日制(the full-day (school s), 小中学校(elementary and middle ), 同校(same school), 定時制(part time (school syst), 高等部(senior high school (es), 補習(supplementary lessons), 課外(extracurricular), 専修(specialization)
  [rare] 公立中学校(public junior high sch), 女子高(girls' high school), 全寮(whole dormitory), 女学校(girls' school), 養護教諭(school nurse), 生徒指導(student guidance), オープンスクール(school(s) with flexibl), 町立(established by the tow)

## 天気 (weather)
  [common] 予報(forecast), 快晴(clear weather), 晴天(fine weather (i.e. lit), 晴れる(to clear up), 雨(rain), 生憎(unfortunately), 天候(weather), 梅雨入り(entering the rainy sea)
  [everyday] 天気予報(weather forecast), 雨模様(signs of rain), 曇り空(cloudy sky), 空模様(look of the sky), 晴れ間(break (in the weather,), 秋晴れ(clear autumnal weather), 好天(fine weather), 雷雨(thunderstorm)
  [rare] 薄曇り(slightly cloudy), 俄雨(rain shower), 梅雨空(overcast sky in the ra), 本降り(heavy rainfall), 秋雨前線(autumn rain front), 五月晴れ(fine weather during th), 晴れ男(man who brings good we), 悪天(bad weather)

## 料理 (cooking)
  [common] 食材(ingredient), 和食(Japanese food), 料理店(restaurant), 煮込み(stew), シェフ(chef), 美味しい(delicious), 調理(cooking), 前菜(hors d'oeuvre)
  [everyday] 鍋料理(hot pot cooking), 料理人(cook), 懐石(kaiseki), パエリア(paella (Spanish rice d), 炊き込み御飯(rice seasoned and cook), 焼き魚(grilled fish), 盛り付け(arrangement of food (o), 酢豚(sweet-and-sour pork)
  [rare] 調理人(chef), ロールキャベツ(cabbage roll), キュイジーヌ(cuisine), 握り鮨(nigirizushi), サイドディッシュ(side dish), オープンキッチン(open kitchen), 美食家(epicure), 調理道具(kitchen utensils)

## 桜 (cherry tree)
  [common] 満開(full bloom (esp. of ch), 花見(cherry blossom viewing), 紅葉(autumn colours), 躑躅(azalea (Rhododendron s), 藤(wisteria (esp. Japanes), 散る(to fall (e.g. blossoms), 菜の花(rape blossoms), 椿(common camellia (Camel)
  [everyday] 八重桜(double-flowered cherry), 染井吉野(Yoshino cherry (Prunus), 山桜(mountain cherry (Ceras), 早咲き(early blooming), 咲き誇る(to be in full bloom), 白梅(white plum blossoms), 山茶花(sasanqua (Camellia sas), 爛漫(glorious)
  [rare] 寒桜(Prunus kanzakura (spec), 花筏(floral raft), 花吹雪(falling cherry blossom), 里桜(any oriental variety o), 枝垂れ(weeping form (e.g. tre), 咲き揃う(to be in full bloom), 薄紅(light pink), 咲き初める(to begin to blossom)

## 悲しい (sad)
  [common] 悲しみ(sadness), 切ない(painful), 寂しい(lonely), 泣く(to cry), 可哀想(poor), 嘆く(to lament), 悔しい(vexing), 悲惨(disastrous)
  [everyday] 悲しむ(to be sad), 惨め(miserable), 喪失感(sense of loss), 憎い(hateful), 込み上げる(to well up (of tears, ), 物悲しい(sad), 落胆(discouragement), 残酷(cruel)
  [rare] 打ち拉ぐ(to crush (with the wei), 張り裂ける(to burst (open)), 嘆き悲しむ(to grieve and moan), 悲劇的(tragic), 感傷的(sentimental), 泣き崩れる(to break down crying), 塞ぎ込む(to mope), 惨い(cruel)

## 侍 (warrior (esp. of milit)
  [common] 忍者(ninja), 武士(warrior), 伝(means of making contac), 忍(endurance), ジャパン(Japan), 刀剣(sword), 達人(master), 虎(tiger (Panthera tigris)
  [everyday] 武者(warrior), 剣豪(master fencer), 丁髷(topknot (hair style)), 龍馬(splendid horse), ナイン(nine), 吟(recitation (of a poem)), 滾る(to boil), グラディエーター(gladiator)
  [rare] 武士道(Bushido), 見参(seeing), 若武者(young warrior), 豪傑(hero), 独眼(one-eyed), 荒武者(daredevil), リーパー(reaper), 血煙(spurt or spray of bloo)
```

Known noise: proper-noun contexts leak in, for example 侍 → ジャパン and ナイン
from "Samurai Japan", the baseball team.

## Output and size

The script writes straight into `public/data/`:

- `frequency.gzjson`: chiVe frequency index for all 82k words (0.7 MB gz).
  The Commonness dial in both modes uses it.
- `semantic/000.gzjson` to `127.gzjson`: neighbour lists, sharded by
  `shardOf()` (FNV-1a over code points, in both the script and
  `src/data/semantic.js`, and tested to agree). About 55–65 KB each, 7.4 MB
  in all.

The app fetches the frequency file the first time someone uses Meaning mode
or moves the dial, and a shard only when a word in it is expanded in Meaning
mode. A first visit downloads none of this.

Regenerate with:

```
python3 scripts/semantic/build_neighbours.py path/to/chive-1.3-mc90.txt
```

It takes about 5 minutes on 4 CPUs and needs only numpy.
