// 有理数問題の生成処理。約分した分数と式の木構造を別々に保持し、値を正確に計算する。
(function (global) {
  "use strict";

  // Python版 make_problems_rational の移植。計算はBigIntで行い、
  // Numberへの変換は乱数の添字と選択の重みにのみ使用する。
  const ErrorType = global.MathGenerator.GeneratorError;
  // BigIntのまま絶対値を求め、負数を含む約分にも対応する。
  const abs = (n) => n < 0n ? -n : n;
  // ユークリッドの互除法でBigIntの最大公約数を求める。
  function gcd(a, b) {
    a = abs(a);
    b = abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  }
  class Rational {
    // 分母の符号を正にそろえ、最大公約数で割って常に既約分数として保持する。
    constructor(numerator, denominator = 1n) {
      let n = BigInt(numerator);
      let d = BigInt(denominator);
      if (d === 0n) throw new ErrorType("分母を0にはできません。");
      if (d < 0n) { n = -n; d = -d; }
      const divisor = gcd(n, d);
      this.n = n / divisor;
      this.d = d / divisor;
    }
    // 整数部と余りに分け、整数またはLaTeXの分数表記を返す。
    mixed() {
      const sign = this.n < 0n ? "-" : "";
      const n = abs(this.n);
      const integer = n / this.d;
      const remainder = n % this.d;
      if (!remainder) return `${sign}${integer}`;
      return `${sign}${integer || ""}\\frac{${remainder}}{${this.d}}`;
    }
  }
  // 1と自身を含むBigIntの約数を、平方根までの探索で昇順に集める。
  function divisors(n) {
    const lower = [];
    const upper = [];
    for (let i = 1n; i * i <= n; i += 1n) {
      if (n % i) continue;
      lower.push(i);
      if (i * i !== n) upper.push(n / i);
    }
    return lower.concat(upper.reverse());
  }
  // BigIntの値をNumberへ変換せず、ソート用の比較結果だけを数値で返す。
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  // BigInt同士を比較して大きい方を返す。
  const maximum = (a, b) => a > b ? a : b;
  // 指定した乱数で配列をその場で並べ替え、同じ配列を返す。
  function shuffle(values, rng) {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
  // 整数区間から候補を抽出する。広い区間では全列挙を避けて探索量を抑える。
  function boundedIntegers(first, last, limit, rng) {
    if (last < first) return [];
    const count = last - first + 1n;
    if (count <= BigInt(limit)) {
      const values = [];
      for (let i = first; i <= last; i += 1n) values.push(i);
      return shuffle(values, rng);
    }
    // 区間の両端と中央を含め、残りを重複しない乱数で補う。
    const values = new Set([first, last, (first + last) / 2n]);
    while (values.size < limit) {
      values.add(first + BigInt(Math.floor(rng() * Number(count))));
    }
    return shuffle([...values], rng);
  }
  // 各候補の重みに比例する確率で1件を選ぶ。
  function weightedChoice(values, weights, rng) {
    let target = rng() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < values.length; i += 1) {
      target -= weights[i];
      if (target < 0) return values[i];
    }
    return values[values.length - 1];
  }
  // 有限小数にできる一部分母では小数表示も選び、それ以外は整数・帯分数で表示する。
  function display(value, rng) {
    if (![2n, 4n, 5n, 8n, 10n].includes(value.d) || rng() >= 0.5) {
      return value.mixed();
    }
    // 小数の各桁も整数の割り算で作り、浮動小数点の丸め誤差を避ける。
    let remainder = value.n % value.d;
    let text = `${value.n / value.d}.`;
    while (remainder) {
      remainder *= 10n;
      text += String(remainder / value.d);
      remainder %= value.d;
    }
    return text;
  }

  // 1回の生成で共有する分母条件、候補探索関数、計算結果のキャッシュを用意する。
  function createContext(maxNum, maxDen, rng) {
    // 設定分母までの最小公倍数を作り、約分後に許容できる分母の判定へ使う。
    let lcm = 1n;
    for (let i = 2n; i <= BigInt(maxDen); i += 1n) lcm = lcm * i / gcd(lcm, i);
    const allowedDivisors = divisors(lcm);
    const compatibleCache = new Map();
    const candidateCache = new Map();
    const maxValue = BigInt(maxNum);
    // 件数上限を守りながら候補の計算結果をキャッシュへ保存する。
    function remember(cache, key, value, limit) {
      // 多数の異なる途中結果が出ても、1回の生成中の保持数を制限する。
      // 破棄するのは乱数を使わない計算結果なので、seedの再現性には影響しない。
      if (cache.size >= limit) cache.delete(cache.keys().next().value);
      cache.set(key, value);
    }
    // 約分後の値が許容する最小公倍数の約数になる候補を集める。
    function compatible(cancel, minimum) {
      const key = `${cancel}:${minimum}`;
      if (compatibleCache.has(key)) return compatibleCache.get(key);
      const values = new Set();
      for (const g of divisors(cancel)) {
        for (const r of allowedDivisors) {
          const value = g * r;
          if (value >= minimum && lcm % (value / gcd(value, cancel)) === 0n) values.add(value);
        }
      }
      const sorted = [...values].sort(compare);
      remember(compatibleCache, key, sorted, 256);
      return sorted;
    }
    // 整数の追加項や範囲外の結果を除外し、採用可能な候補と約分情報を返す。
    function candidate(operand, rawNum, rawDen) {
      if (operand.d === 1n || rawNum <= 0n) return null;
      const result = new Rational(rawNum, rawDen);
      if (result.n > maxValue * result.d || lcm % result.d !== 0n) return null;
      return { operand, result, reduction: gcd(rawNum, rawDen), rawNum, rawDen };
    }
    // 正の結果と数値上限を満たす加減算の追加項を、最大40件まで集める。
    function addSub(ans, op, side) {
      const a = ans.d;
      const b = ans.n;
      const pool = [];
      const seen = new Set();
      const denominators = shuffle(Array.from({ length: maxDen - 1 }, (_, i) => BigInt(i + 2)), rng);
      // 分母ごとの探索数を抑え、候補収集が一部の分母に偏りすぎるのを防ぐ。
      const perDenLimit = Math.max(4, Math.floor(40 / denominators.length) + 2);
      for (const c of denominators) {
        let first = 1n;
        let last;
        // 加算・右側の減算・左側の減算で、結果が正かつ上限以下になる分子の範囲を変える。
        if (op === "add") {
          const remaining = maxValue * a - b;
          if (remaining <= 0n) continue;
          last = remaining * c / a;
        } else if (side === "right") {
          last = (b * c - 1n) / a;
        } else {
          first = b * c / a + 1n;
          last = (maxValue * a + b) * c / a;
        }
        for (const d of boundedIntegers(first, last, perDenLimit * 3, rng)) {
          const operand = new Rational(d, c);
          const rawNum = op === "add" ? b * operand.d + a * operand.n
            : side === "right" ? b * operand.d - a * operand.n : a * operand.n - b * operand.d;
          const item = candidate(operand, rawNum, a * operand.d);
          const key = `${operand.n}/${operand.d}`;
          if (!item || seen.has(key)) continue;
          seen.add(key);
          pool.push(item);
          if (pool.length === 40) return pool;
        }
      }
      return pool;
    }
    // 分子・分母が小さい追加項を優先するための並べ替え順を定義する。
    function candidateOrder(x, y) {
      return compare(maximum(x.operand.n, x.operand.d), maximum(y.operand.n, y.operand.d))
        || compare(x.operand.n + x.operand.d, y.operand.n + y.operand.d)
        || compare(x.operand.d, y.operand.d) || compare(x.operand.n, y.operand.n);
    }
    // 約分後の分母条件を満たす乗除算の追加項を探索し、結果を再利用する。
    function multiplyDivide(ans, op, side) {
      // 乗除算の候補列挙は乱数を使用しないので、生成1回の範囲で再利用できる。
      const cacheKey = `${ans.n}/${ans.d}:${op}:${op === "multi" ? "both" : side}`;
      if (candidateCache.has(cacheKey)) return candidateCache.get(cacheKey);
      const a = ans.d;
      const b = ans.n;
      const denominators = compatible(op === "multi" ? b : a, 2n);
      const numerators = op === "multi"
        ? [...new Set([...Array.from({ length: maxDen }, (_, i) => BigInt(i + 1)), ...compatible(a, 1n)])].sort(compare)
        : compatible(b, 1n);
      // 分母・分子の組を調べ、条件を満たす候補のうち小さいものを最大20件保持する。
      function collect(ds, ns) {
        const pool = [];
        const seen = new Set();
        for (const c of ds) {
          const dMax = maxValue * a * c / b;
          for (const d of ns) {
            if (op === "multi" && d > dMax) break;
            const operand = new Rational(d, c);
            const key = `${operand.n}/${operand.d}`;
            if (operand.d === 1n || seen.has(key)) continue;
            seen.add(key);
            const rawNum = op === "multi" ? b * operand.n
              : side === "right" ? b * operand.d : a * operand.n;
            const rawDen = op === "multi" ? a * operand.d
              : side === "right" ? a * operand.n : b * operand.d;
            const item = candidate(operand, rawNum, rawDen);
            if (!item) continue;
            // 全候補を保持せず、Pythonの並べ替え後の先頭20件と同じ集合を保持する。
            pool.push(item);
            pool.sort(candidateOrder);
            if (pool.length > 20) pool.pop();
          }
        }
        return pool;
      }
      // まず120以下の分子・分母で探し、候補がない場合だけ探索範囲を広げる。
      let pool = collect(denominators.filter((n) => n <= 120n), numerators.filter((n) => n <= 120n));
      if (!pool.length) pool = collect(denominators, numerators);
      remember(candidateCache, cacheKey, pool, 512);
      return pool;
    }
    // 指定範囲から整数ではない分数を集め、式の最初の数値を選ぶ。
    function initial() {
      const pool = [];
      for (let d = 2n; d <= BigInt(maxDen); d += 1n) {
        for (const n of boundedIntegers(1n, maximum(1n, maxValue * d), Math.max(8, maxDen * 2), rng)) {
          const value = new Rational(n, d);
          if (value.d !== 1n) pool.push(value);
        }
      }
      return pool[Math.floor(rng() * pool.length)];
    }
    // 呼び出し側には初期値の選択と、演算に応じた候補取得の窓口を返す。
    return { initial, pool: (ans, op, side) => op === "add" || op === "sub"
      ? addSub(ans, op, side) : multiplyDivide(ans, op, side) };
  }

  const symbols = { add: "+", sub: "-", multi: "×", div: "÷" };
  const precedence = { add: 1, sub: 1, multi: 2, div: 2 };
  // 式の木を再帰的に文字列化する。指定された葉の数値だけを□に置き換える。
  function render(node, masked = null) {
    if (!node.op) return node.id === masked ? "□" : node.display;
    // 子の演算の優先順位と左右の位置から括弧の必要性を判断する。
    function childText(child, right) {
      const text = render(child, masked);
      const brackets = child.op && (precedence[child.op] < precedence[node.op]
        || (right && precedence[child.op] === precedence[node.op]));
      return brackets ? `\\left( ${text} \\right)` : text;
    }
    return `${childText(node.left, false)} ${symbols[node.op]} ${childText(node.right, true)}`;
  }
  // 演算子の選択とは別に、約分しやすさや数値の大きさで追加項の重みを決める。
  function candidateWeight(item, op, maxDen) {
    const reduction = Number(item.reduction);
    if (op === "multi" || op === "div") return reduction > 1 ? 1 + Math.min(6, 1.5 * Math.sqrt(reduction)) : 0.55;
    const size = maximum(abs(item.rawNum), item.rawDen);
    if (size <= BigInt(Math.max(12, maxDen * 2))) return 1;
    return reduction > 1 ? 1 + Math.min(4, Math.sqrt(reduction)) : 0.35;
  }
  // 追加項と演算を順に選んで1問を作る。続行できる候補がなければnullを返す。
  function oneProblem(termNum, maxDen, type, context, rng) {
    // 数式生成の開始：最初の項となる分数を選ぶ。
    let ans = context.initial();
    let expression = { id: 0, display: display(ans, rng) };
    // 表示文字列とは別に各項の分数値を残し、逆算の答えを取り出せるようにする。
    const leaves = [ans];
    for (let id = 1; id < termNum; id += 1) {
      const choices = [];
      const weights = [];
      for (const side of ["left", "right"]) {
        for (const op of ["add", "sub", "multi", "div"]) {
          const pool = context.pool(ans, op, side);
          if (!pool.length) continue;
          choices.push({ side, op, pool });
          // 確定仕様: 約分できる乗除算の演算選択重みは1.0。
          weights.push(op === "add" || op === "sub" || pool.some((item) => item.reduction > 1n) ? 1 : 0.55);
        }
      }
      if (!choices.length) return null;
      // 演算と追加位置を選んだ後、その候補群から実際の追加項を選ぶ。
      const { side, op, pool } = weightedChoice(choices, weights, rng);
      const selected = weightedChoice(pool, pool.map((item) => candidateWeight(item, op, maxDen)), rng);
      const leaf = { id, display: display(selected.operand, rng) };
      leaves.push(selected.operand);
      // 式の追加：現在の式の左右どちらかに、新しい数値と演算子をつなぐ。
      expression = side === "left" ? { op, left: leaf, right: expression } : { op, left: expression, right: leaf };
      // 追加後の式の計算結果を保持し、次の項の選択と最終的な答えに使う。
      ans = selected.result;
    }
    const resultDisplay = display(ans, rng);
    // 計算のみは結果を隠す。逆算のみは式の項、混合は項と結果の両方から選ぶ。
    const mask = type === "calculation" ? termNum
      : Math.floor(rng() * (type === "inverse" ? termNum : termNum + 1));
    const calculation = mask === termNum;
    // 問題文の作成：式を文字列へ変換し、計算問題は結果、逆算問題は式の項を□にする。
    const problem = calculation ? `${render(expression)} = □` : `${render(expression, mask)} = ${resultDisplay}`;
    return {
      problem, expression: problem,
      answer: (calculation ? ans : leaves[mask]).mixed(),
      numberType: "rational", problemType: calculation ? "calculation" : "reverse",
      isInverse: !calculation,
    };
  }
  // 設定を検証し、失敗した試行をやり直しながら指定数の有理数問題を生成する。
  function makeProblemsRational(termNum, maxDen, maxNum, problemNum, type = "mixed", rng = Math.random, onProgress = () => {}) {
    for (const [value, min, max, label] of [[termNum, 2, 4, "項数"], [maxDen, 2, 10, "分母の設定"],
      [maxNum, 1, 10, "有理数の計算結果の上限"], [problemNum, 0, 1000, "有理数問題数"]]) {
      if (!Number.isInteger(value) || value < min || value > max) throw new ErrorType(`${label}は${min}～${max}の整数で指定してください。`);
    }
    if (!["mixed", "calculation", "inverse"].includes(type) || typeof rng !== "function") throw new ErrorType("有理数問題の設定が正しくありません。");
    const context = createContext(maxNum, maxDen, rng);
    const problems = [];
    // 候補が見つからない条件で無限に再試行しないよう、試行回数に上限を設ける。
    const maxAttempts = Math.max(100, problemNum * 50);
    for (let attempts = 0; problems.length < problemNum && attempts < maxAttempts; attempts += 1) {
      // 数式生成：指定条件で1問を作り、成功した問題を必要数まで集める。
      const problem = oneProblem(termNum, maxDen, type, context, rng);
      if (problem) {
        problems.push(problem);
        // 進捗通知は5問ごとと最後にまとめ、画面への通知回数を抑える。
        if (problems.length % 5 === 0 || problems.length === problemNum) onProgress(problems.length);
      }
    }
    if (problems.length !== problemNum) throw new ErrorType("指定した問題数を生成できませんでした。条件またはseedを変更してください。");
    return problems;
  }
  global.RationalGenerator = Object.freeze({ makeProblemsRational });
})(typeof window === "undefined" ? self : window);
