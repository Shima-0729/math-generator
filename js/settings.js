// PDF・CSVの設定欄を連動させ、入力検証と生成Workerの呼び出しを共通化する。
(function (global) {
  "use strict";

  // 設定フォームへイベントを登録し、検証済みの設定を取得するread関数を返す。
  function setup(form, countInput, mode) {
    const typeInput = form.querySelector("#number-type");
    const integerCountInput = form.querySelector("#integer-count");
    const integerCountField = form.querySelector("#integer-count-field");
    const rationalSettings = form.querySelector("#rational-settings");
    const maxIntInput = form.querySelector("#max-int");
    const maxNumInput = form.querySelector("#max-num");
    const maxDenInput = form.querySelector("#max-denominator");
    // 整数問題数を手入力した後は、総問題数が変わっても自動的に半数へ戻さない。
    let countEdited = false;

    // 数の種類・総問題数に合わせて入力欄の表示と有効状態を切り替え、残りの有理数問題数を表示する。
    function sync() {
      const type = typeInput.value;
      const count = Number(countInput.value);
      // 混合モードだけ内訳を指定する。未編集なら整数問題数は半数を切り上げた値にする。
      integerCountField.hidden = type !== "mixed";
      integerCountInput.disabled = type !== "mixed";
      integerCountInput.max = countInput.value;
      if (!countEdited && Number.isInteger(count) && count > 0) integerCountInput.value = String(Math.ceil(count / 2));
      // 生成しない種類の入力欄は無効にし、不要な設定を操作しないようにする。
      rationalSettings.hidden = type === "integer";
      maxNumInput.disabled = type === "integer";
      maxDenInput.disabled = type === "integer";
      maxIntInput.disabled = type === "rational";
      maxIntInput.closest("label").hidden = type === "rational";
      const rationalCount = type === "rational" ? count : type === "mixed" ? count - Number(integerCountInput.value) : 0;
      form.querySelector("#rational-count-help").textContent = Number.isInteger(rationalCount) && rationalCount >= 0
        ? `有理数問題：${rationalCount}問` : "整数問題数は0～全問題数で指定してください。";
    }
    // 入力変更に追従するイベントを登録し、初期表示にも同じ連動規則を適用する。
    typeInput.addEventListener("change", sync);
    countInput.addEventListener("input", sync);
    countInput.addEventListener("change", sync);
    integerCountInput.addEventListener("input", () => { countEdited = true; sync(); });
    sync();

    // 空欄・小数・範囲外を拒否し、入力文字列を整数へ変換して返す。
    function readInteger(input, min, max, label) {
      const raw = input.value.trim();
      const value = Number(raw);
      if (!raw || !Number.isInteger(value) || value < min || value > max) {
        throw new global.MathGenerator.GeneratorError(`${label}は${min}～${max}の整数で指定してください。`);
      }
      return value;
    }
    // 出力先ごとの制限を検証し、生成器へ渡す設定オブジェクトを作る。
    function read() {
      const problemType = form.querySelector('input[name="problem-type"]:checked')?.value;
      if (!["mixed", "calculation", "inverse"].includes(problemType)) throw new global.MathGenerator.GeneratorError("問題タイプを選択してください。");
      const numberType = typeInput.value;
      if (!["integer", "rational", "mixed"].includes(numberType)) throw new global.MathGenerator.GeneratorError("数の種類を選択してください。");
      // PDFは15問または30問、CSV・ZIPは1～1000問という上限を検証する。
      const problemCount = readInteger(countInput, 1, mode === "pdf" ? 30 : 1000, "問題数");
      if (mode === "pdf" && ![15, 30].includes(problemCount)) throw new global.MathGenerator.GeneratorError("PDFの問題数は15問または30問を選択してください。");
      const termCount = readInteger(form.querySelector("#term-count"), 2, 4, "項数");
      const integerCount = numberType === "integer" ? problemCount : numberType === "rational" ? 0
        : readInteger(integerCountInput, 0, problemCount, "整数問題数");
      // 生成しない種類の上限値はnullにし、非表示の入力欄の値を検証対象に含めない。
      return {
        problemType, numberType, problemCount, termCount, integerCount,
        maxInt: integerCount > 0 ? readInteger(maxIntInput, 10, 10000, "整数の数値上限") : null,
        maxNum: integerCount < problemCount ? readInteger(maxNumInput, 1, 10, "有理数の計算結果の上限") : null,
        maxDenominator: integerCount < problemCount ? readInteger(maxDenInput, 2, 10, "分母の設定") : null,
      };
    }
    return { read };
  }

  // 生成専用Workerを起動し、進捗を通知しながら完成した問題配列をPromiseで返す。
  function generate(settings, seed, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      let worker;
      // Workerを停止して資源を解放し、画面で表示できる生成エラーとして処理を終了する。
      function fail(message) {
        if (worker) worker.terminate();
        reject(new global.MathGenerator.GeneratorError(message));
      }
      try {
        // 問題生成の準備：画面操作とは別に数式を作るため、専用Workerを起動する。
        worker = new Worker("js/generation-worker.js");
        // メッセージのkindで進捗・正常終了・失敗を振り分け、完了時にはWorkerを停止する。
        worker.onmessage = ({ data }) => {
          if (data.kind === "progress") onProgress(data.completed, data.total);
          else if (data.kind === "result") { worker.terminate(); resolve(data.problems); }
          else if (data.kind === "error") fail(data.message);
        };
        // Workerの読込失敗と結果の受信失敗を、利用者向けの説明文へ置き換える。
        worker.onerror = () => fail("問題生成の準備に失敗しました。ページを再読み込みしてください。HTMLファイルを直接開いている場合は、Webサーバー経由で開いてください。");
        worker.onmessageerror = () => fail("生成した問題を受け取れませんでした。もう一度お試しください。");
        // 検証済み設定とseedをWorkerに送り、画面とは別の処理で問題を生成する。
        worker.postMessage({ settings, seed });
      } catch (error) {
        fail("問題生成の準備に失敗しました。Web Workerに対応したブラウザで、Webサーバー経由で開いてください。");
      }
    });
  }
  global.ProblemSettings = Object.freeze({ setup, generate });
})(window);
