// サイト全体の生成条件。上限や初期値を変更するときは、この設定ブロックを編集する。
(function (global) {
  "use strict";

  const config = {
    // PDFのレイアウトは30問を1ページに収める設計。選択肢はproblemsPerPage以下にする。
    pdf: { problemCounts: [15, 30], defaultProblemCount: 15, problemsPerPage: 30 },
    // 件数を大きくすると、特に有理数問題と画像付きZIPの作成時間が長くなる。
    csv: { problemCount: { min: 1, max: 1000, default: 100 } },
    test: { questionCount: 15, poolSize: 1000 },
    termCount: { min: 2, max: 4, default: 3 },
    maxInt: { min: 10, max: 10000, default: 500 },
    maxNum: { min: 1, max: 10, default: 5 },
    maxDenominator: { min: 2, max: 10, default: 6 },
  };

  for (const [name, range] of Object.entries({
    csvProblemCount: config.csv.problemCount,
    termCount: config.termCount,
    maxInt: config.maxInt,
    maxNum: config.maxNum,
    maxDenominator: config.maxDenominator,
  })) {
    if (![range.min, range.max, range.default].every(Number.isSafeInteger)
      || range.min > range.max || range.default < range.min || range.default > range.max) {
      throw new Error(`js/site-config.js: ${name}の範囲または初期値が正しくありません。`);
    }
  }
  // 生成器そのものが必要とする下限より、小さい値をサイトで許可しない。
  if (config.csv.problemCount.min < 1 || config.termCount.min < 2 || config.maxInt.min < 10
    || config.maxNum.min < 1 || config.maxDenominator.min < 2) {
    throw new Error("js/site-config.js: 生成器が扱えない下限が指定されています。");
  }
  if (!Number.isSafeInteger(config.pdf.problemsPerPage) || config.pdf.problemsPerPage < 1
    || config.pdf.problemsPerPage > 30
    || !config.pdf.problemCounts.length
    || config.pdf.problemCounts.some((count) => !Number.isSafeInteger(count) || count < 1 || count > config.pdf.problemsPerPage)
    || !config.pdf.problemCounts.includes(config.pdf.defaultProblemCount)
    || !Number.isSafeInteger(config.test.questionCount) || config.test.questionCount < 1
    || !Number.isSafeInteger(config.test.poolSize) || config.test.poolSize < config.test.questionCount) {
    throw new Error("js/site-config.js: PDFまたはテストの問題数設定が正しくありません。");
  }
  Object.freeze(config.pdf.problemCounts);
  Object.freeze(config.pdf);
  Object.freeze(config.csv.problemCount);
  Object.freeze(config.csv);
  Object.freeze(config.test);
  for (const key of ["termCount", "maxInt", "maxNum", "maxDenominator"]) Object.freeze(config[key]);
  global.MathSiteConfig = Object.freeze(config);

  // Workerでは画面要素がないため、ブラウザのページでだけ入力欄と案内文を設定する。
  if (!global.document) return;
  const document = global.document;

  function fillNumberInput(id, range) {
    const input = document.getElementById(id);
    if (!input) return;
    input.min = String(range.min);
    input.max = String(range.max);
    input.value = String(range.default);
  }

  function fillSelect(id, numbers, selected, unit) {
    const select = document.getElementById(id);
    if (!select) return;
    select.replaceChildren(...numbers.map((number) => {
      const option = document.createElement("option");
      option.value = String(number);
      option.textContent = `${number}${unit}`;
      return option;
    }));
    select.value = String(selected);
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  // HTMLに件数や上限を重複して置かず、このファイルから初期値と選択肢を反映する。
  fillSelect("problem-count", config.pdf.problemCounts, config.pdf.defaultProblemCount, "問");
  fillNumberInput("csv-problem-count", config.csv.problemCount);
  setText("csv-problem-count-help", `${config.csv.problemCount.min}～${config.csv.problemCount.max}問の整数を入力してください。`);
  fillSelect("term-count", Array.from({ length: config.termCount.max - config.termCount.min + 1 },
    (_, index) => config.termCount.min + index), config.termCount.default, "項");
  fillNumberInput("max-int", config.maxInt);
  fillNumberInput("max-num", config.maxNum);
  fillNumberInput("max-denominator", config.maxDenominator);
  setText("max-int-help", document.getElementById("test-settings-form")
    ? `${config.maxInt.min}～${config.maxInt.max}の整数`
    : `${config.maxInt.min}～${config.maxInt.max}の整数を入力してください。`);
  setText("max-num-help", `${config.maxNum.min}～${config.maxNum.max}の整数。途中の計算結果に適用します。式中の数はこの値を超える場合があります。`);
  setText("max-denominator-help", `${config.maxDenominator.min}～${config.maxDenominator.max}の整数。加減算で追加する数の分母の上限です。乗除算や計算結果では、より大きな分母も使います。`);
  document.querySelectorAll("[data-test-size]").forEach((element) => {
    element.textContent = String(config.test.questionCount);
  });
  document.querySelectorAll("[data-test-pool-size]").forEach((element) => {
    element.textContent = String(config.test.poolSize);
  });
})(typeof window === "undefined" ? self : window);
