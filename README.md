# 算数問題生成アルゴリズム
整数と有理数の四則演算問題を生成するコードです。計算結果を求める問題と、式中の数を求める逆算問題を作れます。

生成処理は [`algorithm/`](algorithm/) にまとめています。Python版を基に、生成AIを使ってJavaScript版へ移植し、ブラウザで使えるよう調整しました。同梱のWebサイトは、JavaScript版を使ったサンプルです。

## アルゴリズム

どちらの生成器も、**途中の計算結果を保持しながら式を一項ずつ伸ばす**方法を取ります。最後に計算結果か式中の数を一つ隠し、問題と解答の組を作ります。

### 整数版

整数版は、式を数・演算子・括弧の**トークン列**として保持します。実装上は明示的な木構造を作りませんが、現在の式全体を一つの部分式として扱い、その左か右に新しい演算を付けることで式を成長させます。

1. 最初の整数を選び、その値を現在の計算結果として保存します。
2. 左右のどちらに項を加えるか、四則演算のどれを使うかを選びます。例えば結果が `12` の式に右から `+ 3` を付けたら、結果を `15` に更新します。
3. 次の演算を付ける際に計算順序を保つ必要があれば、既存の式に括弧を付けます。例えば左から `2 ×` を付けると `2 × (12 + 3)` となり、結果を `30` に更新します。引き算では結果が正になる数を、割り算では割り切れる数を選びます。
4. 指定した項数まで繰り返した後、結果または式中の整数を `□` に置き換えます。隠した数を解答として保存します。

この例なら、`2 × (□ + 3) = 30` と答え `12` の組を作れます。どこを隠すかは「計算のみ」「逆算のみ」「計算＋逆算」の指定で決まります。

### 有理数版

有理数版では、**既約分数での計算**と**式の表示**を分けて扱います。計算には分子・分母を整数で持つ `Rational` を使い、式は演算子を親、数を葉とする `RationalExpression` の木構造で保持します。

1. 整数ではない分数を最初の項に選び、現在の計算結果と式の木を作ります。
2. 式の左右それぞれについて、加減乗除で追加できる数を探します。演算後の結果が正で `max_num` 以下か、結果の分母が許容範囲かを確かめ、加減算では追加する数の分母にも `max_denominator` を適用します。
3. 候補の中から演算と追加する数を重み付きで選びます。約分しやすさや表示される数の大きさを考慮し、新しい数と演算子を木の左または右に接続して、正確な分数値で結果を更新します。
4. 指定した項数になったら木を式に変換し、演算順序に必要な括弧を付けます。計算結果か葉の数を一つ `□` にし、隠した数の値を解答として保存します。途中で候補が尽きた場合は、その問題を最初から作り直します。

例えば `1/2 → 1/2 + 1/3 → (1/2 + 1/3) × 6/5` と伸ばすと、途中結果は `1/2 → 5/6 → 1` です。実際の表示では、分数・帯分数に加えて、一部の数を小数で表す場合もあります。

## Python版・JavaScript版の関数の仕様

### 整数版

[`int_problem_generator.py`](algorithm/int_problem_generator.py) と [`int_problem_generator.js`](algorithm/int_problem_generator.js) に実装しています。現在の計算結果を追跡しながら、式の左または右に数と演算子を追加します。除算では割り切れる数を選び、必要な位置に括弧を付けて、整数の四則演算式を組み立てます。

完成した式では、計算結果または式中の数を一つ `□` に置き換えます。例えば計算問題は `3 + 4 = □`、逆算問題は `3 + □ = 7` の形です。`max_int` は数値を選ぶ際の上限として使います。

### 有理数版

[`rational_problem_generator.py`](algorithm/rational_problem_generator.py) と [`rational_problem_generator.js`](algorithm/rational_problem_generator.js) に実装しています。分子と分母を整数で保持して約分し、浮動小数点の誤差を使わずに計算します。最初の分数から始め、四則演算と追加する数の候補を条件に合わせて選び、式の左右に項を増やします。

`max_num` は各演算後の計算結果の上限です。追加する数そのものの上限ではありません。`max_denominator` は加減算で追加する数の既約分母の上限で、乗除算で使う数や計算結果の分母がこの値を超えることはあります。計算結果の既約分母は、`1` から `max_denominator` までの最小公倍数の約数に制限します。

約分しやすさや数の大きさを考慮して候補を選び、演算の順序を保つため式を木構造で管理します。表示では分数・帯分数のほか、条件に合う数を小数にする場合があります。条件によって候補が見つからない試行はやり直すため、項数や生成数が増えると処理に時間がかかります。

### 問題タイプ

両方のPython版では、`type` に次の値を指定します。JavaScript版では指定方法が異なります。

| `type` | 内容 | 空欄の位置 |
| --- | --- | --- |
| `0` | 計算＋逆算 | 計算結果または式中の数 |
| `1` | 計算のみ | 計算結果 |
| `2` | 逆算のみ | 式中の数 |

## Python版の使い方

Python 3.10以上で使えます。生成とCSV出力に外部パッケージは必要ありません。リポジトリのルートから、例えば次のように呼び出します。

```python
from algorithm.int_problem_generator import make_problems, export_questions_to_csv

problems = make_problems(term_num=3, max_int=100, problem_num=10, type=0)
export_questions_to_csv(problems, "integer_problems.csv")
```

```python
from algorithm.rational_problem_generator import make_problems_rational, export_questions_to_csv

problems = make_problems_rational(
    term_num=3,
    max_denominator=6,
    max_num=2,
    problem_num=10,
    type=1,
)
export_questions_to_csv(problems, "rational_problems.csv")
```

`term_num` は式に登場する数の個数、`problem_num` は問題数です。両関数は `[問題, 答え]` の組を並べたリストを返します。CSV出力関数は、番号を加えた `index,problem,ans` の3列をUTF-8（BOM付き）で保存します。有理数版の問題・答えはLaTeX形式の文字列で、問題中の数は小数表示になる場合があります。

各Pythonファイルを直接実行すると、ファイル末尾の使用例が1000問を生成し、同じ `algorithm/` フォルダ内にそれぞれ `integer_problems.csv` または `rational_problems.csv` を保存します。生成数や条件は使用例の引数を編集してください。

## JavaScript版の使い方

ブラウザで `algorithm/int_problem_generator.js` と `algorithm/rational_problem_generator.js` を読み込むと、`MathGenerator` と `RationalGenerator` が利用できます。例えば両ファイルを `<script>` で読み込んだページでは、次の呼び出しでそれぞれ10問を生成します。

```javascript
const integerProblems = MathGenerator.makeProblems(3, 100, 10);
const rationalProblems = RationalGenerator.makeProblemsRational(3, 6, 2, 10, "mixed");
```

整数版の第4引数 `back` を `true` にすると逆算のみ、第6引数 `calculationOnly` を `true` にすると計算のみになります。省略時は計算と逆算の混合です。有理数版の第5引数には `"mixed"`、`"calculation"`、`"inverse"` を指定します。両JavaScript版は問題と答えなどを含むオブジェクトの配列を返し、Python版とは引数と返り値の形が異なります。

## Webサイトでの使用例

同梱のサイトでは、JavaScript版を使って[PDFプリント](index.html)、[CSV・画像付きZIP](csv.html)、[整数問題の15問テスト](test.html)を作れます。PDFとCSVでは整数のみ、有理数のみ、両方の混合を選べます。[CSVと画像の使い方](csv-guide.html)には、出力した画像をExcelで使う例もあります。サイトの生成処理はブラウザ内で行います。ローカルで動かす場合は、Web Workerを読み込めるようWebサーバー経由で開いてください。

## 主なファイル

| 場所 | 内容 |
| --- | --- |
| [`algorithm/`](algorithm/) | Python版・JavaScript版の問題生成アルゴリズム |
| [`js/`](js/) | サイトの画面操作、CSV・PDF・ZIP出力、生成Worker |
| [`index.html`](index.html)、[`csv.html`](csv.html)、[`test.html`](test.html) | アルゴリズムを利用するサンプルサイト |
| [`css/`](css/) | サイトのスタイル |
| [`katex/`](katex/)、[`vendor/`](vendor/)、[`fonts/`](fonts/) | サイトで使用する外部ライブラリとフォント |

外部ライブラリとフォントの権利表示・ライセンス文の所在は、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) に記載しています。
