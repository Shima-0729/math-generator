// CSV出力画面の制御。問題を保持し、普通表示・LaTeX表示・画像付きZIPの保存へ振り分ける。
(function () {
  "use strict";

  const PREVIEW_LIMIT = 20;
  const CSV_FILENAME = "math-problems.csv";
  const form = document.querySelector("#csv-form");
  const generateButton = form.querySelector('button[type="submit"]');
  const problemCountInput = document.querySelector("#csv-problem-count");
  const seedInput = document.querySelector("#seed");
  const usedSeedOutput = document.querySelector("#used-seed");
  const generatedCountOutput = document.querySelector("#generated-count");
  const formError = document.querySelector("#form-error");
  const previewEmpty = document.querySelector("#preview-empty");
  const problemPreview = document.querySelector("#problem-preview");
  const problemPreviewBody = document.querySelector("#problem-preview-body");
  const previewDescription = document.querySelector("#preview-description");
  const downloadButton = document.querySelector("#csv-download-button");
  const generationProgress = document.querySelector("#generation-progress");
  const zipStatus = document.querySelector("#zip-export-status");
  const zipProgress = document.querySelector("#zip-export-progress");
  const zipMeter = document.querySelector("#zip-export-meter");
  const zipCancelButton = document.querySelector("#zip-cancel-button");
  const zipSaveLink = document.querySelector("#zip-save-link");
  const zipSaveHelp = document.querySelector("#zip-save-help");
  const settingsController = window.ProblemSettings.setup(form, problemCountInput, "csv");
  // 問題生成とZIP書き出しの実行状態を別々に持ち、処理の重複を防ぐ。
  let busy = false;
  let exportController = null;
  let zipUrl = null;

  // 出力形式を切り替えても同じ問題を保存できるよう、生成結果を保持する。
  const state = {
    problems: [],
    seed: null,
  };

  // フォームにエラーメッセージを表示する。
  function showError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  // エラー表示を消して次の操作に備える。
  function clearError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  // seedの入力例に使う日付をyyyyMMdd形式に整える。
  function formatSeedDate(date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  // 問題生成中の状態と開始ボタン、支援技術向けの処理中属性を更新する。
  function setBusy(isBusy) {
    busy = isBusy;
    generateButton.disabled = isBusy;
    generateButton.textContent = isBusy ? "問題を作成中…" : "問題を作成";
    form.setAttribute("aria-busy", String(isBusy));
  }

  // 出力形式を検証してから、共通の設定管理から生成条件を読み取る。
  function readSettings() {
    readOutputFormat();
    return settingsController.read();
  }

  // 選択中の出力形式を取得し、未選択や想定外の値を検出する。
  function readOutputFormat() {
    const format = form.querySelector('input[name="csv-output-format"]:checked')?.value;
    if (!["plain", "latex", "zip"].includes(format)) {
      throw new window.MathGenerator.GeneratorError("出力形式を選択してください。");
    }
    return format;
  }

  // 数式を出力形式に合わせる。LaTeXでは記号をコマンド化し、普通表示では分数を斜線表記にする。
  function formatCsvValue(value, format) {
    const text = String(value);
    if (format === "latex") {
      const symbols = { "×": "\\times", "÷": "\\div", "□": "\\square" };
      return text.replace(/[×÷□]/g, (symbol) => symbols[symbol]);
    }
    // 帯分数を先に変換し、整数部分と分子が連結しないよう空白を入れる。
    // 生成器のLaTeXコマンドは frac・left・right のみ。
    return text
      .replace(/(\d+)\\frac\{(\d+)\}\{(\d+)\}/g, "$1 $2/$3")
      .replace(/\\frac\{(\d+)\}\{(\d+)\}/g, "$1/$2")
      .replace(/\\left\s*\(/g, "(")
      .replace(/\\right\s*\)/g, ")")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
  }

  // 先頭20問までの式と答えを描画し、プレビューを表示する。
  function renderPreview(problems) {
    const previewProblems = problems.slice(0, PREVIEW_LIMIT);
    // 行を画面外のFragmentへまとめてから置き換え、DOM更新を一度に行う。
    const fragment = document.createDocumentFragment();

    previewProblems.forEach((problem, index) => {
      const row = document.createElement("tr");
      const expressionCell = document.createElement("td");
      const number = document.createElement("span");
      const expression = document.createElement("span");
      const answerCell = document.createElement("td");

      number.className = "problem-preview__number";
      number.textContent = `${index + 1}.`;
      expression.className = "problem-preview__expression";
      // 問題の数式を整形して、プレビューの問題欄に描画する。
      window.MathDisplay.render(expression, problem.expression, problem.numberType);
      expressionCell.append(number, expression);
      answerCell.className = "problem-preview__answer";
      // 答えの数値を整形して、プレビューの解答欄に描画する。
      window.MathDisplay.render(answerCell, problem.answer, problem.numberType);
      row.append(expressionCell, answerCell);
      fragment.append(row);
    });

    // 作成した行をプレビュー表へまとめて反映する。
    problemPreviewBody.replaceChildren(fragment);
    previewDescription.textContent =
      problems.length > PREVIEW_LIMIT
        ? `${problems.length}問中、先頭${PREVIEW_LIMIT}問を表示しています。`
        : `${problems.length}問すべてを表示しています。`;
    previewEmpty.hidden = true;
    problemPreview.hidden = false;
  }

  // カンマ・引用符・改行を含むセルを引用符で囲み、セル内の引用符は二重にする。
  function escapeCsvCell(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  // 生成済み問題から「問題,答え」の2列を作り、CSV文字列へ変換する。
  function createCsv(problems, format) {
    const rows = [["問題", "答え"]];
    problems.forEach((problem) => {
      rows.push([formatCsvValue(problem.expression, format), formatCsvValue(problem.answer, format)]);
    });
    return serializeCsv(rows);
  }

  // セルをエスケープしてCRLFで行を区切り、UTF-8の識別用BOMを先頭に付ける。
  function serializeCsv(rows) {
    return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  }

  // 前回のZIP保存URLを解放し、保存リンクと進捗表示を初期化する。
  function clearZipDownload() {
    if (zipUrl) URL.revokeObjectURL(zipUrl);
    zipUrl = null;
    zipSaveLink.removeAttribute("href");
    zipSaveLink.hidden = true;
    zipSaveHelp.hidden = true;
    zipStatus.hidden = true;
    zipProgress.textContent = "";
    zipMeter.hidden = true;
  }

  // 選択形式と実行状態から、ダウンロードボタンの文言・有効状態を決める。
  function updateOutputUi() {
    const zipSelected = form.querySelector('input[name="csv-output-format"]:checked')?.value === "zip";
    downloadButton.textContent = exportController ? "ZIPを作成中…"
      : zipSelected ? "画像付きZIPをダウンロード" : "CSVをダウンロード";
    downloadButton.disabled = busy || Boolean(exportController) || state.problems.length === 0;
    zipStatus.hidden = !zipSelected || !zipProgress.textContent;
  }

  // 生成済み問題をCSVとPNGのZIPにまとめ、進捗・キャンセル・保存リンクを管理する。
  async function downloadZip() {
    clearZipDownload();
    const controller = new AbortController();
    exportController = controller;
    // disabledの元の状態を保持し、有理数設定などの無効状態も正確に戻す。
    const controls = [...form.querySelectorAll("input, select, button")].map((element) => ({
      element, disabled: element.disabled,
    }));
    controls.forEach(({ element }) => { element.disabled = true; });
    form.setAttribute("aria-busy", "true");
    zipStatus.hidden = false;
    zipCancelButton.hidden = false;
    zipCancelButton.disabled = false;
    zipProgress.textContent = "画像用フォントを準備中…";
    updateOutputUi();
    try {
      if (!window.MathZipExporter?.create) {
        throw new Error("ZIP作成機能を読み込めませんでした。ページを再読み込みしてください。");
      }
      // 4桁の連番をCSVと画像名で共用し、式と答えをLaTeXへ統一する。
      const items = state.problems.map((problem, index) => ({
        id: String(index + 1).padStart(4, "0"),
        questionLatex: formatCsvValue(problem.expression, "latex"),
        answerLatex: formatCsvValue(problem.answer, "latex"),
      }));
      // ZIP版は通常CSVと異なり、ID・問題LaTeX・解答LaTeXの3列を使う。
      const csv = serializeCsv([
        ["id", "question_latex", "answer_latex"],
        ...items.map((item) => [item.id, item.questionLatex, item.answerLatex]),
      ]);
      // 画像付きZIPの作成：数式と答えをPNG画像へ変換し、CSVと一緒にZIPへ格納する。
      const blob = await window.MathZipExporter.create(items, csv, {
        // 中止ボタンの操作を、画像変換やフォント取得の処理へ伝える。
        signal: controller.signal,
        // フォント準備・画像作成・ZIP仕上げの各段階を画面へ反映する。
        onProgress({ phase, completed, total }) {
          zipMeter.max = total;
          zipMeter.value = completed;
          zipMeter.hidden = phase === "fonts";
          zipProgress.textContent = phase === "fonts" ? "画像用フォントを準備中…"
            : phase === "zip" ? "ZIPファイルを仕上げています…"
            : `PNG画像を作成中：${completed} / ${total}枚`;
        },
      });
      if (controller.signal.aborted) throw new DOMException("キャンセルしました。", "AbortError");
      // 完成したZIPをブラウザ内のURLにし、再度保存できるリンクとして残す。
      zipUrl = URL.createObjectURL(blob);
      zipSaveLink.href = zipUrl;
      zipSaveLink.hidden = false;
      zipSaveHelp.hidden = false;
      zipProgress.textContent = `${items.length}問のCSVと${items.length * 2}枚のPNGをZIPにまとめました。`;
      // 非同期処理後の自動保存を制限するブラウザでも、このリンクから保存できる。
      // ZIP保存：完成した画像付きZIPのダウンロードを開始する。
      zipSaveLink.click();
    } catch (error) {
      zipMeter.hidden = true;
      // ユーザーによる中止は通常のエラーと分けて表示する。
      if (error.name === "AbortError") {
        zipProgress.textContent = "ZIP作成をキャンセルしました。作成済みの問題はそのまま利用できます。";
      } else {
        console.error("ZIP download failed:", error);
        zipProgress.textContent = "ZIPを作成できませんでした。";
        showError(error.message || "ZIPを作成できませんでした。もう一度お試しください。");
      }
    } finally {
      // 残る取得処理にも終了を通知し、開始前の入力欄の状態へ戻す。
      controller.abort();
      exportController = null;
      controls.forEach(({ element, disabled }) => { element.disabled = disabled; });
      form.setAttribute("aria-busy", "false");
      zipCancelButton.hidden = true;
      updateOutputUi();
    }
  }

  // フォームから問題を生成し、保存用データと画面のプレビューを更新する。
  async function handleGenerate(event) {
    event.preventDefault();
    if (busy || exportController) return;
    clearError();
    clearZipDownload();
    setBusy(true);
    downloadButton.disabled = true;
    // 新しい生成の開始時に古い結果を破棄し、失敗時に前回の問題を誤って保存させない。
    state.problems = [];
    usedSeedOutput.textContent = "未生成";
    generatedCountOutput.textContent = "未生成";
    problemPreview.hidden = true;
    previewEmpty.hidden = false;
    generationProgress.hidden = true;

    // 生成開始の表示を描画する機会を与えてから、問題の準備を始める。
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const settings = readSettings();
      const requestedSeed = seedInput.value.trim();
      const seed = requestedSeed || window.MathGenerator.createRandomSeed();
      generationProgress.hidden = false;
      generationProgress.textContent = `問題を生成中：0 / ${settings.problemCount}問`;
      // 共通の生成処理から受け取る進捗を、完成数と総数で表示する。
      const problems = await window.ProblemSettings.generate(
        settings, seed,
        (completed, total) => { generationProgress.textContent = `問題を生成中：${completed} / ${total}問`; },
      );

      // プレビュー表示：生成した問題と答えを、先頭20問まで画面に表示する。
      renderPreview(problems);
      state.problems = problems;
      state.seed = seed;
      usedSeedOutput.textContent = seed;
      generatedCountOutput.textContent = `${problems.length}問`;
      downloadButton.disabled = false;
      generationProgress.textContent = `${problems.length}問を作成しました。`;
    } catch (error) {
      generationProgress.hidden = true;
      console.error("CSV problem generation failed:", error);
      showError(
        error instanceof window.MathGenerator.GeneratorError
          ? error.message
          : "問題を作成できませんでした。設定条件を確認してください。",
      );
    } finally {
      setBusy(false);
      updateOutputUi();
    }
  }

  // 選択形式に応じてZIP作成または通常のCSV保存を実行する。
  async function handleDownload() {
    if (busy || exportController) return;
    if (state.problems.length === 0) {
      showError("先に問題を作成してください。");
      return;
    }

    clearError();
    try {
      const format = readOutputFormat();
      if (format === "zip") {
        // 画像付きZIPが選ばれている場合は、画像生成から保存までを実行する。
        await downloadZip();
        return;
      }
      // 通常のCSVは生成済みデータから作成し、一時リンクのクリックで保存を開始する。
      const blob = new Blob([createCsv(state.problems, format)], { type: "text/csv;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = CSV_FILENAME;
      link.hidden = true;
      document.body.append(link);
      // CSV保存：選択した普通表示またはLaTeX表示のCSVをダウンロードする。
      link.click();
      link.remove();
      // ブラウザが保存を開始する時間を置いて、一時URLを解放する。
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error("CSV download failed:", error);
      showError(error instanceof window.MathGenerator.GeneratorError
        ? error.message : "CSVをダウンロードできませんでした。もう一度お試しください。");
    }
  }

  seedInput.placeholder = `例：${formatSeedDate(new Date())}`;

  form.addEventListener("submit", handleGenerate);
  downloadButton.addEventListener("click", handleDownload);
  // 形式の変更は保存ボタンの表示へ反映し、問題自体は再生成しない。
  form.querySelectorAll('input[name="csv-output-format"]').forEach((input) => {
    input.addEventListener("change", updateOutputUi);
  });
  // 中止ボタンは連打を止めてから、進行中のZIP処理へキャンセルを通知する。
  zipCancelButton.addEventListener("click", () => {
    zipCancelButton.disabled = true;
    exportController?.abort();
  });
  updateOutputUi();
})();
