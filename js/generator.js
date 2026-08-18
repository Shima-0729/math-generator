(function (global) {
  "use strict";

  const OPERATORS = ["add", "sub", "multi", "div"];
  const SIDES = ["left", "right"];

  class GeneratorError extends Error {
    constructor(message) {
      super(message);
      this.name = "GeneratorError";
    }
  }

  function assertIntegerInRange(value, minimum, maximum, label) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new GeneratorError(`${label}は${minimum}～${maximum}の整数で指定してください。`);
    }
  }

  function randomIndex(length, rng) {
    if (!Number.isInteger(length) || length <= 0) {
      throw new GeneratorError("乱数の選択対象がありません。");
    }
    return Math.floor(rng() * length);
  }

  function randomChoice(items, rng) {
    return items[randomIndex(items.length, rng)];
  }

  // Python版の int(a + (b - a) * random() ** strength) と同じ分布。
  function randomIntAdjust(a, b, rng, strength = 1.5) {
    const weightedRandom = rng() ** strength;
    return Math.trunc(a + (b - a) * weightedRandom);
  }

  // 1と自分自身を除く約数を昇順で返す。
  function divisors(n) {
    if (!Number.isInteger(n) || n < 4) {
      return [];
    }

    const lower = [];
    const upper = [];
    const limit = Math.floor(Math.sqrt(n));

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

  function hashSeed(seedText) {
    let hash = 1779033703 ^ seedText.length;
    for (let i = 0; i < seedText.length; i += 1) {
      hash = Math.imul(hash ^ seedText.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }

    return function nextHash() {
      hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
      hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
      return (hash ^= hash >>> 16) >>> 0;
    };
  }

  function createSeededRandom(seed) {
    const seedFactory = hashSeed(String(seed));
    let state = seedFactory();

    return function seededRandom() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRandomSeed() {
    if (global.crypto && typeof global.crypto.getRandomValues === "function") {
      const values = new Uint32Array(2);
      global.crypto.getRandomValues(values);
      return `${values[0].toString(16).padStart(8, "0")}${values[1]
        .toString(16)
        .padStart(8, "0")}`;
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * Python版 make_problems(term_num, max_int, problem_num, back=False) の移植。
   * 第5引数でseed付き乱数生成器を受け取れるようにしている。
   */
  function makeProblems(termNum, maxInt, problemNum, back = false, rng = Math.random) {
    assertIntegerInRange(termNum, 2, 4, "項数");
    assertIntegerInRange(maxInt, 10, 10000, "数値上限");
    assertIntegerInRange(problemNum, 1, 300, "問題数");

    if (typeof rng !== "function") {
      throw new GeneratorError("乱数生成器が正しくありません。");
    }

    const problems = [];
    const lastMaskValue = back ? 0 : 1;

    for (let problemIndex = 0; problemIndex < problemNum; problemIndex += 1) {
      let oldOperator = null;
      let result = Math.floor(maxInt / 8);
      const tokens = [];
      const mask = [];
      let termIndex = 0;

      while (termIndex < termNum) {
        let selectedSide = randomChoice(SIDES, rng);
        let selectedOperator;

        if (result >= maxInt || result <= 1) {
          selectedSide = "right";
        }
        if (termIndex === 0) {
          selectedSide = "left";
        }

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

            if (oldOperator === "add" || oldOperator === "sub") {
              tokens.unshift("(");
              mask.unshift(0);
              tokens.push(")");
              mask.push(0);
            }
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
            tokens.unshift("÷");
            mask.unshift(0);
            const temporaryValue = randomIntAdjust(2, Math.floor(maxInt / result), rng);
            const value = result * temporaryValue;
            tokens.unshift(String(value));
            mask.unshift(1);
            termIndex += 1;
            result = Math.floor(value / result);
          }
        } else {
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

          if (result >= maxInt) {
            selectedOperator = "sub";
          } else if (result <= 1) {
            selectedOperator = "add";
          }

          if (selectedOperator === "add") {
            tokens.push("+");
            mask.push(0);
            const value = randomIntAdjust(1, maxInt - result + 1, rng);
            tokens.push(String(value));
            mask.push(1);
            termIndex += 1;
            result = value + result;
          } else if (selectedOperator === "sub") {
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
            tokens.push("÷");
            mask.push(0);
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

      tokens.push("=");
      mask.push(0);
      tokens.push(String(result));
      mask.push(lastMaskValue);

      const hiddenIndex = randomOneIndex(mask, rng);
      const solution = Number(tokens[hiddenIndex]);
      tokens[hiddenIndex] = "□";

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

  global.MathGenerator = Object.freeze({
    GeneratorError,
    createRandomSeed,
    createSeededRandom,
    divisors,
    makeProblems,
  });
})(window);
