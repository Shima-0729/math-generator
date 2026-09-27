// サイト用の入力検証と生成器の呼び出し。algorithm内のコードにサイト設定を持ち込まない。
(function (global) {
  "use strict";

  const config = global.MathSiteConfig;
  const ErrorType = global.MathGenerator.GeneratorError;

  // サイト設定の範囲外や小数を、生成器へ渡す前に拒否する。
  function requireInteger(value, range, label) {
    if (!Number.isSafeInteger(value) || value < range.min || value > range.max) {
      throw new ErrorType(`${label}は${range.min}～${range.max}の整数で指定してください。`);
    }
  }

  function requireChoice(value, choices, label) {
    if (!choices.includes(value)) throw new ErrorType(`${label}を選択してください。`);
  }

  // PDF・CSVの設定を検証し、整数・有理数の生成件数を確定する。
  function validateWorksheetSettings(settings) {
    if (!settings || typeof settings !== "object") throw new ErrorType("問題の設定が正しくありません。");
    requireChoice(settings.outputMode, ["pdf", "csv"], "出力形式");
    requireChoice(settings.problemType, ["mixed", "calculation", "inverse"], "問題タイプ");
    requireChoice(settings.numberType, ["integer", "rational", "mixed"], "数の種類");
    if (settings.outputMode === "pdf") {
      if (!Number.isSafeInteger(settings.problemCount) || !config.pdf.problemCounts.includes(settings.problemCount)) {
        throw new ErrorType(`PDFの問題数は${config.pdf.problemCounts.join("問または")}問を選択してください。`);
      }
    } else {
      requireInteger(settings.problemCount, config.csv.problemCount, "問題数");
    }
    requireInteger(settings.termCount, config.termCount, "項数");
    if (typeof settings.addSubOnly !== "boolean") throw new ErrorType("演算の種類の設定が正しくありません。");

    const integerCount = settings.numberType === "integer" ? settings.problemCount
      : settings.numberType === "rational" ? 0 : settings.integerCount;
    if (settings.numberType === "mixed") {
      requireInteger(integerCount, { min: 0, max: settings.problemCount }, "整数問題数");
    }
    const rationalCount = settings.problemCount - integerCount;
    if (integerCount > 0) requireInteger(settings.maxInt, config.maxInt, "整数の数値上限");
    if (rationalCount > 0) {
      requireInteger(settings.maxNum, config.maxNum, "有理数の計算結果の上限");
      requireInteger(settings.maxDenominator, config.maxDenominator, "分母の設定");
    }
    return { ...settings, integerCount, rationalCount };
  }

  // 検証済みの条件で整数・有理数問題を生成し、画面用の共通オブジェクト配列を返す。
  function generateWorksheet(settings, rng, onProgress = () => {}) {
    const options = validateWorksheetSettings(settings);
    if (typeof rng !== "function" || typeof onProgress !== "function") {
      throw new ErrorType("乱数または進捗通知の設定が正しくありません。");
    }
    // 整数の生成結果に種類を付け、有理数の結果と同じ形にする。
    const integers = options.integerCount ? global.MathGenerator.makeProblems(
      options.termCount, options.maxInt, options.integerCount, options.problemType === "inverse",
      rng, options.problemType === "calculation", options.addSubOnly,
    ).map((item) => ({ ...item, problem: item.expression, numberType: "integer",
      problemType: item.isInverse ? "reverse" : "calculation" })) : [];
    // 有理数の進捗には、先に生成した整数の件数を加える。
    const rationals = options.rationalCount ? global.RationalGenerator.makeProblemsRational(
      options.termCount, options.maxDenominator, options.maxNum, options.rationalCount,
      options.problemType, rng,
      (count) => onProgress(options.integerCount + count, options.problemCount), options.addSubOnly,
    ) : [];
    const problems = integers.concat(rationals);
    // 混合モードでは生成順の偏りをなくす。乱数の使用順は従来と同じに保つ。
    if (options.numberType === "mixed") {
      for (let index = problems.length - 1; index > 0; index -= 1) {
        const selected = Math.floor(rng() * (index + 1));
        [problems[index], problems[selected]] = [problems[selected], problems[index]];
      }
    }
    return problems;
  }

  // テストの入力条件と候補数を、サイト設定に従って確認する。
  function validateTestSettings(settings) {
    if (!settings || typeof settings !== "object") throw new ErrorType("テストの設定が正しくありません。");
    requireChoice(settings.problemType, ["mixed", "calculation", "inverse"], "問題タイプ");
    requireInteger(settings.termCount, config.termCount, "項数");
    requireInteger(settings.maxInt, config.maxInt, "数値上限");
    if (typeof settings.addSubOnly !== "boolean") throw new ErrorType("演算の種類の設定が正しくありません。");
    return settings;
  }

  // テスト条件を検証してから整数生成器を呼び、候補の問題オブジェクト配列を返す。
  function generateTestPool(settings, rng) {
    const options = validateTestSettings(settings);
    if (typeof rng !== "function") throw new ErrorType("乱数生成器が正しくありません。");
    return global.MathGenerator.makeProblems(
      options.termCount, options.maxInt, config.test.poolSize, options.problemType === "inverse",
      rng, options.problemType === "calculation", options.addSubOnly,
    );
  }

  global.SiteProblemGenerator = Object.freeze({
    validateWorksheetSettings, generateWorksheet, validateTestSettings, generateTestPool,
  });
})(typeof window === "undefined" ? self : window);
