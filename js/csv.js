(function () {
  "use strict";

  const MAX_PROBLEM_COUNT = 10000;
  const PREVIEW_LIMIT = 50;
  const CSV_FILENAME = "math-problems.csv";
  const form = document.querySelector("#csv-form");
  const generateButton = form.querySelector('button[type="submit"]');
  const problemCountInput = document.querySelector("#csv-problem-count");
  const termCountInput = document.querySelector("#term-count");
  const maxIntInput = document.querySelector("#max-int");
  const seedInput = document.querySelector("#seed");
  const usedSeedOutput = document.querySelector("#used-seed");
  const generatedCountOutput = document.querySelector("#generated-count");
  const formError = document.querySelector("#form-error");
  const previewEmpty = document.querySelector("#preview-empty");
  const problemPreview = document.querySelector("#problem-preview");
  const problemPreviewBody = document.querySelector("#problem-preview-body");
  const previewDescription = document.querySelector("#preview-description");
  const downloadButton = document.querySelector("#csv-download-button");

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

  function setBusy(isBusy) {
    generateButton.disabled = isBusy;
    generateButton.textContent = isBusy ? "問題を作成中…" : "問題を作成";
  }

  function readSettings() {
    const selectedType = form.querySelector('input[name="problem-type"]:checked');
    const problemCount = Number(problemCountInput.value);

    if (!selectedType) {
      throw new window.MathGenerator.GeneratorError("問題タイプを選択してください。");
    }
    if (!Number.isInteger(problemCount) || problemCount < 1 || problemCount > MAX_PROBLEM_COUNT) {
      throw new window.MathGenerator.GeneratorError(
        `問題数は1～${MAX_PROBLEM_COUNT}の整数で指定してください。`,
      );
    }

    return {
      problemCount,
      termCount: Number(termCountInput.value),
      maxInt: Number(maxIntInput.value),
      inverseOnly: selectedType.value === "inverse",
    };
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
      expression.textContent = problem.expression;
      expressionCell.append(number, expression);
      answerCell.className = "problem-preview__answer";
      answerCell.textContent = String(problem.answer);
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

  function createCsv(problems) {
    const rows = [["問題", "答え"]];
    problems.forEach((problem) => {
      rows.push([problem.expression, problem.answer]);
    });
    return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  }

  async function handleGenerate(event) {
    event.preventDefault();
    clearError();
    setBusy(true);
    downloadButton.disabled = true;

    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const settings = readSettings();
      const requestedSeed = seedInput.value.trim();
      const seed = requestedSeed || window.MathGenerator.createRandomSeed();
      const rng = window.MathGenerator.createSeededRandom(seed);
      const problems = window.MathGenerator.makeProblems(
        settings.termCount,
        settings.maxInt,
        settings.problemCount,
        settings.inverseOnly,
        rng,
      );

      state.problems = problems;
      state.seed = seed;
      usedSeedOutput.textContent = seed;
      generatedCountOutput.textContent = `${problems.length}問`;
      renderPreview(problems);
      downloadButton.disabled = false;
    } catch (error) {
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
    const blob = new Blob([createCsv(state.problems)], { type: "text/csv;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = CSV_FILENAME;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  form.addEventListener("submit", handleGenerate);
  downloadButton.addEventListener("click", handleDownload);
})();
