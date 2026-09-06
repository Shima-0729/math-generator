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
  const settingsController = window.ProblemSettings.setup(form, problemCountInput, "csv");
  let busy = false;

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
    if (!["plain", "latex"].includes(format)) {
      throw new window.MathGenerator.GeneratorError("CSVの出力形式を選択してください。");
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
    return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  }

  async function handleGenerate(event) {
    event.preventDefault();
    if (busy) return;
    clearError();
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
      downloadButton.disabled = state.problems.length === 0;
    }
  }

  function handleDownload() {
    if (state.problems.length === 0) {
      showError("先に問題を作成してください。");
      return;
    }

    clearError();
    try {
      const format = readOutputFormat();
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
})();
