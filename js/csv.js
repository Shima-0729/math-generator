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
  let busy = false;
  let exportController = null;
  let zipUrl = null;

  const state = {
    problems: [],
    seed: null,
  };

  function showError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function clearError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  function formatSeedDate(date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  function setBusy(isBusy) {
    busy = isBusy;
    generateButton.disabled = isBusy;
    generateButton.textContent = isBusy ? "問題を作成中…" : "問題を作成";
    form.setAttribute("aria-busy", String(isBusy));
  }

  function readSettings() {
    readOutputFormat();
    return settingsController.read();
  }

  function readOutputFormat() {
    const format = form.querySelector('input[name="csv-output-format"]:checked')?.value;
    if (!["plain", "latex", "zip"].includes(format)) {
      throw new window.MathGenerator.GeneratorError("出力形式を選択してください。");
    }
    return format;
  }

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

  function renderPreview(problems) {
    const previewProblems = problems.slice(0, PREVIEW_LIMIT);
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
      window.MathDisplay.render(expression, problem.expression, problem.numberType);
      expressionCell.append(number, expression);
      answerCell.className = "problem-preview__answer";
      window.MathDisplay.render(answerCell, problem.answer, problem.numberType);
      row.append(expressionCell, answerCell);
      fragment.append(row);
    });

    problemPreviewBody.replaceChildren(fragment);
    previewDescription.textContent =
      problems.length > PREVIEW_LIMIT
        ? `${problems.length}問中、先頭${PREVIEW_LIMIT}問を表示しています。`
        : `${problems.length}問すべてを表示しています。`;
    previewEmpty.hidden = true;
    problemPreview.hidden = false;
  }

  function escapeCsvCell(value) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function createCsv(problems, format) {
    const rows = [["問題", "答え"]];
    problems.forEach((problem) => {
      rows.push([formatCsvValue(problem.expression, format), formatCsvValue(problem.answer, format)]);
    });
    return serializeCsv(rows);
  }

  function serializeCsv(rows) {
    return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  }

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

  function updateOutputUi() {
    const zipSelected = form.querySelector('input[name="csv-output-format"]:checked')?.value === "zip";
    downloadButton.textContent = exportController ? "ZIPを作成中…"
      : zipSelected ? "画像付きZIPをダウンロード" : "CSVをダウンロード";
    downloadButton.disabled = busy || Boolean(exportController) || state.problems.length === 0;
    zipStatus.hidden = !zipSelected || !zipProgress.textContent;
  }

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
      const items = state.problems.map((problem, index) => ({
        id: String(index + 1).padStart(4, "0"),
        questionLatex: formatCsvValue(problem.expression, "latex"),
        answerLatex: formatCsvValue(problem.answer, "latex"),
      }));
      const csv = serializeCsv([
        ["id", "question_latex", "answer_latex"],
        ...items.map((item) => [item.id, item.questionLatex, item.answerLatex]),
      ]);
      const blob = await window.MathZipExporter.create(items, csv, {
        signal: controller.signal,
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
      zipUrl = URL.createObjectURL(blob);
      zipSaveLink.href = zipUrl;
      zipSaveLink.hidden = false;
      zipSaveHelp.hidden = false;
      zipProgress.textContent = `${items.length}問のCSVと${items.length * 2}枚のPNGをZIPにまとめました。`;
      // 非同期処理後の自動保存を制限するブラウザでも、このリンクから保存できる。
      zipSaveLink.click();
    } catch (error) {
      zipMeter.hidden = true;
      if (error.name === "AbortError") {
        zipProgress.textContent = "ZIP作成をキャンセルしました。作成済みの問題はそのまま利用できます。";
      } else {
        console.error("ZIP download failed:", error);
        zipProgress.textContent = "ZIPを作成できませんでした。";
        showError(error.message || "ZIPを作成できませんでした。もう一度お試しください。");
      }
    } finally {
      controller.abort();
      exportController = null;
      controls.forEach(({ element, disabled }) => { element.disabled = disabled; });
      form.setAttribute("aria-busy", "false");
      zipCancelButton.hidden = true;
      updateOutputUi();
    }
  }

  async function handleGenerate(event) {
    event.preventDefault();
    if (busy || exportController) return;
    clearError();
    clearZipDownload();
    setBusy(true);
    downloadButton.disabled = true;
    state.problems = [];
    usedSeedOutput.textContent = "未生成";
    generatedCountOutput.textContent = "未生成";
    problemPreview.hidden = true;
    previewEmpty.hidden = false;
    generationProgress.hidden = true;

    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const settings = readSettings();
      const requestedSeed = seedInput.value.trim();
      const seed = requestedSeed || window.MathGenerator.createRandomSeed();
      generationProgress.hidden = false;
      generationProgress.textContent = `問題を生成中：0 / ${settings.problemCount}問`;
      const problems = await window.ProblemSettings.generate(
        settings, seed,
        (completed, total) => { generationProgress.textContent = `問題を生成中：${completed} / ${total}問`; },
      );

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
        await downloadZip();
        return;
      }
      const blob = new Blob([createCsv(state.problems, format)], { type: "text/csv;charset=utf-8" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = CSV_FILENAME;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
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
  form.querySelectorAll('input[name="csv-output-format"]').forEach((input) => {
    input.addEventListener("change", updateOutputUi);
  });
  zipCancelButton.addEventListener("click", () => {
    zipCancelButton.disabled = true;
    exportController?.abort();
  });
  updateOutputUi();
})();
