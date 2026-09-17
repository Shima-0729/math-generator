// 整数問題の生成処理。式の左右へ項を追加し、計算結果を追跡して問題と答えを組み立てる。
(function (global) {
  "use strict";

  const OPERATORS = ["add", "sub", "multi", "div"];
  const SIDES = ["left", "right"];

  class GeneratorError extends Error {
    // 生成処理固有のエラーとして名前を付け、呼び出し側で入力エラーを判別できるようにする。
    constructor(message) {
      super(message);
      this.name = "GeneratorError";
    }
  }

  // 設定値が指定範囲の整数かを検証し、不正な場合は画面表示用の例外を投げる。
  function assertIntegerInRange(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new GeneratorError(`${label}は${minimum}～${maximum}の整数で指定してください。`);
    }
  }

  // 渡された乱数生成器を使い、配列の範囲内の添字を選ぶ。
  function randomIndex(length, rng) {
    if (!Number.isInteger(length) || length <= 0) {
      throw new GeneratorError("乱数の選択対象がありません。");
    }
    return Math.floor(rng() * length);
  }

  // 候補配列から1件を選ぶ。seed付き乱数を渡すと選択順も再現できる。
  function randomChoice(items, rng) {
    return items[randomIndex(items.length, rng)];
  }

  // Python版の int(a + (b - a) * random() ** strength) と同じ分布。
  // 指数で乱数の偏りを調整する。strengthが1より大きいほどa側を選びやすくする。
  function randomIntAdjust(a, b, rng, strength = 1.5) {
    const weightedRandom = rng() ** strength;
    return Math.trunc(a + (b - a) * weightedRandom);
  }

  // 1と自分自身を除く約数を昇順で返す。
  // 割り切れる除算を作るため、整数nの自明でない約数を列挙する。
  function divisors(n) {
    if (!Number.isInteger(n) || n < 4) {
      return [];
    }

    const lower = [];
    const upper = [];
    const limit = Math.floor(Math.sqrt(n));

    // 平方根まで調べ、対になる約数も保存する。平方数の同じ約数は重複させない。
    for (let i = 2; i <= limit; i += 1) {
      if (n % i !== 0) {
        continue;
      }

      lower.push(i);
      const pair = n / i;
      if (pair !== i && pair !== n) {
        upper.push(pair);
      }
    }

    return lower.concat(upper.reverse());
  }

  // maskが1の位置だけを集め、□へ置き換える数値の位置を選ぶ。
  function randomOneIndex(mask, rng) {
    const candidates = [];
    mask.forEach((value, index) => {
      if (value === 1) {
        candidates.push(index);
      }
    });

    if (candidates.length === 0) {
      throw new GeneratorError("□に置き換えられる項がありません。");
    }

    return randomChoice(candidates, rng);
  }

  // 文字列seedを混合し、32ビットの初期状態を取り出す関数を作る。
  function hashSeed(seedText) {
    let hash = 1779033703 ^ seedText.length;
    for (let i = 0; i < seedText.length; i += 1) {
      hash = Math.imul(hash ^ seedText.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }

    // 内部のハッシュをさらに混合し、符号なし32ビット整数として返す。
    return function nextHash() {
      hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
      hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
      return (hash ^= hash >>> 16) >>> 0;
    };
  }

  // 同じseedから同じ乱数列を返す、0以上1未満の乱数生成器を作る。
  function createSeededRandom(seed) {
    const seedFactory = hashSeed(String(seed));
    let state = seedFactory();

    // 呼び出すたびに状態を進め、32ビット整数を小数へ変換する。
    return function seededRandom() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  // seed未入力時の識別値を作る。利用可能ならブラウザの暗号学的乱数を使う。
  function createRandomSeed() {
    if (global.crypto && typeof global.crypto.getRandomValues === "function") {
      const values = new Uint32Array(2);
      global.crypto.getRandomValues(values);
      return `${values[0].toString(16).padStart(8, "0")}${values[1]
        .toString(16)
        .padStart(8, "0")}`;
    }

    // cryptoが使えない環境では日時と通常の乱数を組み合わせる。
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Python版 make_problems(term_num, max_int, problem_num, back=False) の移植。
   * 第5引数でseed付き乱数生成器を受け取れるようにしている。
   */
  // 指定項数の整数式を必要数作り、計算のみ・逆算のみ・混合の指定に従って□を置く。
  function makeProblems(termNum, maxInt, problemNum, back = false, rng = Math.random, calculationOnly = false) {
    assertIntegerInRange(termNum, 2, 4, "項数");
    assertIntegerInRange(maxInt, 10, 10000, "数値上限");
    assertIntegerInRange(problemNum, 1, 10000, "問題数");

    if (typeof rng !== "function") {
      throw new GeneratorError("乱数生成器が正しくありません。");
    }

    const problems = [];
    // 逆算のみの場合は等号の右側を隠す候補から除外する。
    const lastMaskValue = back ? 0 : 1;

    for (let problemIndex = 0; problemIndex < problemNum; problemIndex += 1) {
      let oldOperator = null;
      let result = Math.floor(maxInt / 8);
      // 数値と記号をtokensに保存し、対応するmaskには数値が1、記号が0を入れる。
      const tokens = [];
      const mask = [];
      let termIndex = 0;

      // 現在の式をひとかたまりとして、左右のどちらかへ新しい数値と演算子を足す。
      while (termIndex < termNum) {
        let selectedSide = randomChoice(SIDES, rng);
        let selectedOperator;

        if (result >= maxInt || result <= 1) {
          selectedSide = "right";
        }
        if (termIndex === 0) {
          selectedSide = "left";
        }

        // 左側に追加する場合は「新しい数値 演算子 現在の式」となる。
        if (selectedSide === "left") {
          if (2 * result >= maxInt) {
            selectedOperator = result > Math.floor(maxInt / 4) * 3 ? "sub" : "add";
          } else {
            selectedOperator = randomChoice(OPERATORS, rng);
          }

          if (selectedOperator === "add") {
            if (termIndex === 0) {
              result = randomIntAdjust(Math.floor(maxInt / 10), Math.floor(maxInt / 4), rng);
              tokens.push(String(result));
              mask.push(1);
              termIndex += 1;
            }

            // 式の追加：現在の式の左に「数値 +」を付ける。
            tokens.unshift("+");
            mask.unshift(0);
            const value = randomIntAdjust(1, maxInt - result + 1, rng);
            tokens.unshift(String(value));
            mask.unshift(1);
            termIndex += 1;
            result = value + result;
          } else if (selectedOperator === "sub") {
            if (termIndex === 0) {
              result = randomIntAdjust(Math.floor(maxInt / 10), Math.floor(maxInt / 4), rng);
              tokens.push(String(result));
              mask.push(1);
              termIndex += 1;
            }

            // 既存の加減算を括弧で囲み、新しい演算を加えても元の計算順を保つ。
            if (oldOperator === "add" || oldOperator === "sub") {
              tokens.unshift("(");
              mask.unshift(0);
              tokens.push(")");
              mask.push(0);
            }
            // 式の追加：現在の式の左に「数値 -」を付ける。
            tokens.unshift("-");
            mask.unshift(0);
            const value = randomIntAdjust(result + 1, maxInt, rng);
            tokens.unshift(String(value));
            mask.unshift(1);
            termIndex += 1;
            result = value - result;
          } else if (selectedOperator === "multi") {
            if (termIndex === 0) {
              result = randomIntAdjust(
                2,
                Math.floor(Math.floor(Math.sqrt(maxInt)) / 2),
                rng,
              );
              tokens.push(String(result));
              mask.push(1);
              termIndex += 1;
            }

            if (oldOperator === "add" || oldOperator === "sub" || oldOperator === "div") {
              tokens.unshift("(");
              mask.unshift(0);
              tokens.push(")");
              mask.push(0);
            }
            // 式の追加：括弧で計算順を整えた式の左に「数値 ×」を付ける。
            tokens.unshift("×");
            mask.unshift(0);
            const value = randomIntAdjust(2, Math.floor(maxInt / result), rng, 1.0);
            tokens.unshift(String(value));
            mask.unshift(1);
            termIndex += 1;
            result = value * result;
          } else {
            if (termIndex === 0) {
              result = randomIntAdjust(
                2,
                Math.floor(Math.floor(Math.sqrt(maxInt)) / 2),
                rng,
              );
              tokens.push(String(result));
              mask.push(1);
              termIndex += 1;
            }

            if (["add", "sub", "multi", "div"].includes(oldOperator)) {
              tokens.unshift("(");
              mask.unshift(0);
              tokens.push(")");
              mask.push(0);
            }
            // 式の追加：現在の式全体を除数として、その左に「数値 ÷」を付ける。
            tokens.unshift("÷");
            mask.unshift(0);
            // 現在の結果の倍数を左に置き、除算後も整数になるようにする。
            const temporaryValue = randomIntAdjust(2, Math.floor(maxInt / result), rng);
            const value = result * temporaryValue;
            tokens.unshift(String(value));
            mask.unshift(1);
            termIndex += 1;
            result = Math.floor(value / result);
          }
        } else {
          // 右側への追加では、結果の大きさと割り切れる約数の有無で演算候補を絞る。
          const resultDivisors = divisors(result);

          if (2 * result >= maxInt && resultDivisors.length === 0) {
            selectedOperator = result > Math.floor(maxInt / 4) * 3 ? "sub" : "add";
          } else if (2 * result >= maxInt) {
            let operatorIndex = Math.floor(rng() * 3);
            if (operatorIndex === 2) {
              operatorIndex += 1;
            }
            selectedOperator = OPERATORS[operatorIndex];
          } else if (resultDivisors.length === 0 && termIndex !== 0) {
            selectedOperator = OPERATORS[Math.floor(rng() * 3)];
          } else {
            selectedOperator = randomChoice(OPERATORS, rng);
          }

          // 上限付近では減算、小さすぎるときは加算へ切り替える。
          if (result >= maxInt) {
            selectedOperator = "sub";
          } else if (result <= 1) {
            selectedOperator = "add";
          }

          if (selectedOperator === "add") {
            // 式の追加：現在の式の右に「+ 数値」を付ける。
            tokens.push("+");
            mask.push(0);
            const value = randomIntAdjust(1, maxInt - result + 1, rng);
            tokens.push(String(value));
            mask.push(1);
            termIndex += 1;
            result = value + result;
          } else if (selectedOperator === "sub") {
            // 式の追加：現在の式の右に「- 数値」を付ける。
            tokens.push("-");
            mask.push(0);
            const value = randomIntAdjust(1, result - 1, rng, 0.4);
            tokens.push(String(value));
            mask.push(1);
            termIndex += 1;
            result -= value;
          } else if (selectedOperator === "multi") {
            if (oldOperator === "add" || oldOperator === "sub") {
              tokens.unshift("(");
              mask.unshift(0);
              tokens.push(")");
              mask.push(0);
            }
            // 式の追加：必要な括弧を付けた式の右に「× 数値」を付ける。
            tokens.push("×");
            mask.push(0);
            const value = randomIntAdjust(2, Math.floor(maxInt / result), rng, 1.0);
            tokens.push(String(value));
            mask.push(1);
            termIndex += 1;
            result *= value;
          } else {
            if (oldOperator === "add" || oldOperator === "sub") {
              tokens.unshift("(");
              mask.unshift(0);
              tokens.push(")");
              mask.push(0);
            }
            // 式の追加：割り切れる数値を選び、式の右に「÷ 数値」を付ける。
            tokens.push("÷");
            mask.push(0);
            // 現在の結果の約数を除数に選び、小数が生じない除算にする。
            const availableDivisors = divisors(result);
            const value = randomChoice(availableDivisors, rng);
            tokens.push(String(value));
            mask.push(1);
            termIndex += 1;
            result = Math.floor(result / value);
          }
        }

        oldOperator = selectedOperator;
      }

      // 完成した式に等号と計算結果を追加し、隠す位置の選択に備える。
      tokens.push("=");
      mask.push(0);
      tokens.push(String(result));
      mask.push(lastMaskValue);

      // 従来の2モードでは乱数の消費順を変えず、同じseedの出題を維持する。
      const hiddenIndex = calculationOnly ? tokens.length - 1 : randomOneIndex(mask, rng);
      // □に置き換える前の値を答えとして保存する。
      const solution = Number(tokens[hiddenIndex]);
      // 出題用の式にするため、答えとして保存した数値を□に置き換える。
      tokens[hiddenIndex] = "□";

      // 問題の完成：表示する数式と答え、□の位置などを1問分のデータにまとめる。
      problems.push({
        expression: tokens.join(" "),
        tokens: [...tokens],
        answer: solution,
        equationResult: result,
        hiddenIndex,
        isInverse: hiddenIndex !== tokens.length - 1,
      });
    }

    return problems;
  }

  // 画面側とWorker側で共用する関数だけを公開する。
  global.MathGenerator = Object.freeze({
    GeneratorError,
    createRandomSeed,
    createSeededRandom,
    divisors,
    makeProblems,
  });
})(typeof window === "undefined" ? self : window);
