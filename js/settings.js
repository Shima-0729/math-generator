(function (global) {
  "use strict";

  function setup(form, countInput, mode) {
    const typeInput = form.querySelector("#number-type");
    const integerCountInput = form.querySelector("#integer-count");
    const integerCountField = form.querySelector("#integer-count-field");
    const rationalSettings = form.querySelector("#rational-settings");
    const maxIntInput = form.querySelector("#max-int");
    const maxNumInput = form.querySelector("#max-num");
    const maxDenInput = form.querySelector("#max-denominator");
    let countEdited = false;

    function sync() {
      const type = typeInput.value;
      const count = Number(countInput.value);
      integerCountField.hidden = type !== "mixed";
      integerCountInput.disabled = type !== "mixed";
      integerCountInput.max = countInput.value;
      if (!countEdited && Number.isInteger(count) && count > 0) integerCountInput.value = String(Math.ceil(count / 2));
      rationalSettings.hidden = type === "integer";
      maxNumInput.disabled = type === "integer";
      maxDenInput.disabled = type === "integer";
      maxIntInput.disabled = type === "rational";
      maxIntInput.closest("label").hidden = type === "rational";
      const rationalCount = type === "rational" ? count : type === "mixed" ? count - Number(integerCountInput.value) : 0;
      form.querySelector("#rational-count-help").textContent = Number.isInteger(rationalCount) && rationalCount >= 0
        ? `有理数問題：${rationalCount}問` : "整数問題数は0～全問題数で指定してください。";
    }
    typeInput.addEventListener("change", sync);
    countInput.addEventListener("input", sync);
    countInput.addEventListener("change", sync);
    integerCountInput.addEventListener("input", () => { countEdited = true; sync(); });
    sync();

    function readInteger(input, min, max, label) {
      const raw = input.value.trim();
      const value = Number(raw);
      if (!raw || !Number.isInteger(value) || value < min || value > max) {
        throw new global.MathGenerator.GeneratorError(`${label}は${min}～${max}の整数で指定してください。`);
      }
      return value;
    }
    function read() {
      const problemType = form.querySelector('input[name="problem-type"]:checked')?.value;
      if (!["mixed", "calculation", "inverse"].includes(problemType)) throw new global.MathGenerator.GeneratorError("問題タイプを選択してください。");
      const numberType = typeInput.value;
      if (!["integer", "rational", "mixed"].includes(numberType)) throw new global.MathGenerator.GeneratorError("数の種類を選択してください。");
      const problemCount = readInteger(countInput, 1, mode === "pdf" ? 30 : 1000, "問題数");
      if (mode === "pdf" && ![15, 30].includes(problemCount)) throw new global.MathGenerator.GeneratorError("PDFの問題数は15問または30問を選択してください。");
      const termCount = readInteger(form.querySelector("#term-count"), 2, 4, "項数");
      const integerCount = numberType === "integer" ? problemCount : numberType === "rational" ? 0
        : readInteger(integerCountInput, 0, problemCount, "整数問題数");
      return {
        problemType, numberType, problemCount, termCount, integerCount,
        maxInt: integerCount > 0 ? readInteger(maxIntInput, 10, 10000, "整数の数値上限") : null,
        maxNum: integerCount < problemCount ? readInteger(maxNumInput, 1, 10, "有理数の計算結果の上限") : null,
        maxDenominator: integerCount < problemCount ? readInteger(maxDenInput, 2, 10, "分母の設定") : null,
      };
    }
    return { read };
  }

  function generate(settings, seed, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      let worker;
      function fail(message) {
        if (worker) worker.terminate();
        reject(new global.MathGenerator.GeneratorError(message));
      }
      try {
        worker = new Worker("js/generation-worker.js");
        worker.onmessage = ({ data }) => {
          if (data.kind === "progress") onProgress(data.completed, data.total);
          else if (data.kind === "result") { worker.terminate(); resolve(data.problems); }
          else if (data.kind === "error") fail(data.message);
        };
        worker.onerror = () => fail("問題生成の準備に失敗しました。ページを再読み込みしてください。HTMLファイルを直接開いている場合は、Webサーバー経由で開いてください。");
        worker.onmessageerror = () => fail("生成した問題を受け取れませんでした。もう一度お試しください。");
        worker.postMessage({ settings, seed });
      } catch (error) {
        fail("問題生成の準備に失敗しました。Web Workerに対応したブラウザで、Webサーバー経由で開いてください。");
      }
    });
  }
  global.ProblemSettings = Object.freeze({ setup, generate });
})(window);
