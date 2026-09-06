(function (global) {
  "use strict";

  // Python版 make_problems_rational の移植。計算はBigIntで行い、
  // Numberへの変換は乱数の添字と選択の重みにのみ使用する。
  const ErrorType = global.MathGenerator.GeneratorError;
  const abs = (n) => n < 0n ? -n : n;
  function gcd(a, b) {
    a = abs(a);
    b = abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  }
  class Rational {
    constructor(numerator, denominator = 1n) {
      let n = BigInt(numerator);
      let d = BigInt(denominator);
      if (d === 0n) throw new ErrorType("分母を0にはできません。");
      if (d < 0n) { n = -n; d = -d; }
      const divisor = gcd(n, d);
      this.n = n / divisor;
      this.d = d / divisor;
    }
    mixed() {
      const sign = this.n < 0n ? "-" : "";
      const n = abs(this.n);
      const integer = n / this.d;
      const remainder = n % this.d;
      if (!remainder) return `${sign}${integer}`;
      return `${sign}${integer || ""}\\frac{${remainder}}{${this.d}}`;
    }
  }
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
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const maximum = (a, b) => a > b ? a : b;
  function shuffle(values, rng) {
    for (let i = values.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  }
  function boundedIntegers(first, last, limit, rng) {
    if (last < first) return [];
    const count = last - first + 1n;
    if (count <= BigInt(limit)) {
      const values = [];
      for (let i = first; i <= last; i += 1n) values.push(i);
      return shuffle(values, rng);
    }
    const values = new Set([first, last, (first + last) / 2n]);
    while (values.size < limit) {
      values.add(first + BigInt(Math.floor(rng() * Number(count))));
    }
    return shuffle([...values], rng);
  }
  function weightedChoice(values, weights, rng) {
    let target = rng() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < values.length; i += 1) {
      target -= weights[i];
      if (target < 0) return values[i];
    }
    return values[values.length - 1];
  }
  function display(value, rng) {
    if (![2n, 4n, 5n, 8n, 10n].includes(value.d) || rng() >= 0.5) {
      return value.mixed();
    }
    let remainder = value.n % value.d;
    let text = `${value.n / value.d}.`;
    while (remainder) {
      remainder *= 10n;
      text += String(remainder / value.d);
      remainder %= value.d;
    }
    return text;
  }

  function createContext(maxNum, maxDen, rng) {
    let lcm = 1n;
    for (let i = 2n; i <= BigInt(maxDen); i += 1n) lcm = lcm * i / gcd(lcm, i);
    const allowedDivisors = divisors(lcm);
    const compatibleCache = new Map();
    const candidateCache = new Map();
    const maxValue = BigInt(maxNum);
    function remember(cache, key, value, limit) {
      // 多数の異なる途中結果が出ても、1回の生成中の保持数を制限する。
      // 破棄するのは乱数を使わない計算結果なので、seedの再現性には影響しない。
      if (cache.size >= limit) cache.delete(cache.keys().next().value);
      cache.set(key, value);
    }
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
    function candidate(operand, rawNum, rawDen) {
      if (operand.d === 1n || rawNum <= 0n) return null;
      const result = new Rational(rawNum, rawDen);
      if (result.n > maxValue * result.d || lcm % result.d !== 0n) return null;
      return { operand, result, reduction: gcd(rawNum, rawDen), rawNum, rawDen };
    }
    function addSub(ans, op, side) {
      const a = ans.d;
      const b = ans.n;
      const pool = [];
      const seen = new Set();
      const denominators = shuffle(Array.from({ length: maxDen - 1 }, (_, i) => BigInt(i + 2)), rng);
      const perDenLimit = Math.max(4, Math.floor(40 / denominators.length) + 2);
      for (const c of denominators) {
        let first = 1n;
        let last;
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
    function candidateOrder(x, y) {
      return compare(maximum(x.operand.n, x.operand.d), maximum(y.operand.n, y.operand.d))
        || compare(x.operand.n + x.operand.d, y.operand.n + y.operand.d)
        || compare(x.operand.d, y.operand.d) || compare(x.operand.n, y.operand.n);
    }
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
      let pool = collect(denominators.filter((n) => n <= 120n), numerators.filter((n) => n <= 120n));
      if (!pool.length) pool = collect(denominators, numerators);
      remember(candidateCache, cacheKey, pool, 512);
      return pool;
    }
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
    return { initial, pool: (ans, op, side) => op === "add" || op === "sub"
      ? addSub(ans, op, side) : multiplyDivide(ans, op, side) };
  }

  const symbols = { add: "+", sub: "-", multi: "×", div: "÷" };
  const precedence = { add: 1, sub: 1, multi: 2, div: 2 };
  function render(node, masked = null) {
    if (!node.op) return node.id === masked ? "□" : node.display;
    function childText(child, right) {
      const text = render(child, masked);
      const brackets = child.op && (precedence[child.op] < precedence[node.op]
        || (right && precedence[child.op] === precedence[node.op]));
      return brackets ? `\\left( ${text} \\right)` : text;
    }
    return `${childText(node.left, false)} ${symbols[node.op]} ${childText(node.right, true)}`;
  }
  function candidateWeight(item, op, maxDen) {
    const reduction = Number(item.reduction);
    if (op === "multi" || op === "div") return reduction > 1 ? 1 + Math.min(6, 1.5 * Math.sqrt(reduction)) : 0.55;
    const size = maximum(abs(item.rawNum), item.rawDen);
    if (size <= BigInt(Math.max(12, maxDen * 2))) return 1;
    return reduction > 1 ? 1 + Math.min(4, Math.sqrt(reduction)) : 0.35;
  }
  function oneProblem(termNum, maxDen, type, context, rng) {
    let ans = context.initial();
    let expression = { id: 0, display: display(ans, rng) };
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
      const { side, op, pool } = weightedChoice(choices, weights, rng);
      const selected = weightedChoice(pool, pool.map((item) => candidateWeight(item, op, maxDen)), rng);
      const leaf = { id, display: display(selected.operand, rng) };
      leaves.push(selected.operand);
      expression = side === "left" ? { op, left: leaf, right: expression } : { op, left: expression, right: leaf };
      ans = selected.result;
    }
    const resultDisplay = display(ans, rng);
    const mask = type === "calculation" ? termNum
      : Math.floor(rng() * (type === "inverse" ? termNum : termNum + 1));
    const calculation = mask === termNum;
    const problem = calculation ? `${render(expression)} = □` : `${render(expression, mask)} = ${resultDisplay}`;
    return {
      problem, expression: problem,
      answer: (calculation ? ans : leaves[mask]).mixed(),
      numberType: "rational", problemType: calculation ? "calculation" : "reverse",
      isInverse: !calculation,
    };
  }
  function makeProblemsRational(termNum, maxDen, maxNum, problemNum, type = "mixed", rng = Math.random, onProgress = () => {}) {
    for (const [value, min, max, label] of [[termNum, 2, 4, "項数"], [maxDen, 2, 10, "分母の設定"],
      [maxNum, 1, 10, "有理数の計算結果の上限"], [problemNum, 0, 1000, "有理数問題数"]]) {
      if (!Number.isInteger(value) || value < min || value > max) throw new ErrorType(`${label}は${min}～${max}の整数で指定してください。`);
    }
    if (!["mixed", "calculation", "inverse"].includes(type) || typeof rng !== "function") throw new ErrorType("有理数問題の設定が正しくありません。");
    const context = createContext(maxNum, maxDen, rng);
    const problems = [];
    const maxAttempts = Math.max(100, problemNum * 50);
    for (let attempts = 0; problems.length < problemNum && attempts < maxAttempts; attempts += 1) {
      const problem = oneProblem(termNum, maxDen, type, context, rng);
      if (problem) {
        problems.push(problem);
        if (problems.length % 5 === 0 || problems.length === problemNum) onProgress(problems.length);
      }
    }
    if (problems.length !== problemNum) throw new ErrorType("指定した問題数を生成できませんでした。条件またはseedを変更してください。");
    return problems;
  }
  global.RationalGenerator = Object.freeze({ makeProblemsRational });
})(typeof window === "undefined" ? self : window);
