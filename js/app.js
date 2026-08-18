(function () {
  "use strict";

  const PDF_FILENAME = "math-worksheet.pdf";
  const form = document.querySelector("#generator-form");
  const generateButton = form.querySelector('button[type="submit"]');
  const problemCountInput = document.querySelector("#problem-count");
  const termCountInput = document.querySelector("#term-count");
  const maxIntInput = document.querySelector("#max-int");
  const seedInput = document.querySelector("#seed");
  const usedSeedOutput = document.querySelector("#used-seed");
  const formError = document.querySelector("#form-error");
  const previewEmpty = document.querySelector("#preview-empty");
  const problemPreview = document.querySelector("#problem-preview");
  const problemPreviewBody = document.querySelector("#problem-preview-body");
  const downloadButton = document.querySelector("#download-button");

  const state = {
    problems: [],
    settings: null,
    seed: null,
    date: null,
    pdfData: null,
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

  function setGenerationBusy(isBusy) {
    generateButton.disabled = isBusy;
    generateButton.textContent = isBusy ? "PDFを作成中…" : "問題を生成";
  }

  function readSettings() {
    const selectedType = form.querySelector('input[name="problem-type"]:checked');
    if (!selectedType) {
      throw new window.MathGenerator.GeneratorError("問題タイプを選択してください。");
    }

    return {
      problemCount: Number(problemCountInput.value),
      termCount: Number(termCountInput.value),
      maxInt: Number(maxIntInput.value),
      inverseOnly: selectedType.value === "inverse",
    };
  }

  function renderProblemPreview(problems) {
    const fragment = document.createDocumentFragment();

    problems.forEach((problem, index) => {
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
    previewEmpty.hidden = true;
    problemPreview.hidden = false;
  }

  async function handleGenerate(event) {
    event.preventDefault();
    clearError();
    setGenerationBusy(true);
    downloadButton.disabled = true;

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
      const generatedDate = new Date();

      state.problems = problems;
      state.settings = settings;
      state.seed = seed;
      state.date = generatedDate;
      state.pdfData = null;

      usedSeedOutput.textContent = seed;
      renderProblemPreview(problems);

      try {
        state.pdfData = await window.WorksheetPdf.createWorksheetData({
          problems,
          date: generatedDate,
        });
        downloadButton.disabled = false;
      } catch (pdfError) {
        console.error("PDF preparation failed:", pdfError);
        showError("問題は生成できましたが、PDFを準備できませんでした。もう一度お試しください。");
      }
    } catch (error) {
      console.error("Problem generation failed:", error);
      showError(
        error instanceof window.MathGenerator.GeneratorError
          ? error.message
          : "問題を生成できませんでした。設定条件を確認してください。",
      );
    } finally {
      setGenerationBusy(false);
    }
  }

  function handleDownload() {
    if (!state.pdfData) {
      showError("先に問題を生成してください。");
      return;
    }

    clearError();

    try {
      window.WorksheetPdf.downloadPdfData({
        data: state.pdfData,
        filename: PDF_FILENAME,
      });
    } catch (error) {
      console.error("PDF download failed:", error);
      showError("PDFをダウンロードできませんでした。もう一度お試しください。");
    }
  }

  form.addEventListener("submit", handleGenerate);
  downloadButton.addEventListener("click", handleDownload);
  seedInput.placeholder = `例：${formatSeedDate(new Date())}`;

  if (window.WorksheetPdf && typeof window.WorksheetPdf.prepare === "function") {
    window.WorksheetPdf.prepare().catch((error) => {
      console.error("PDF assets could not be prepared:", error);
    });
  }
})();
