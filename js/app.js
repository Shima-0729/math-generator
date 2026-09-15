// PDFページの画面操作を管理する。問題生成とPDF描画はそれぞれ専用モジュールに任せる。
(function () {
  "use strict";

  // PDFファイルネーム設定
  const PDF_FILENAME = "math-worksheet.pdf";
  // 設定フォームのHTML要素を取得する。入力値の読み取りはreadSettingsで行う。
  const form = document.querySelector("#generator-form");
  // ボタン受け取り
  const generateButton = form.querySelector('button[type="submit"]');
  // 問題数・seedの入力欄と、実際に使ったseedの表示先を取得する。
  const problemCountInput = document.querySelector("#problem-count");
  const seedInput = document.querySelector("#seed");
  const usedSeedOutput = document.querySelector("#used-seed");
  // 生成や保存のエラーメッセージを表示する要素を取得する。
  const formError = document.querySelector("#form-error");
  // プレビューオブジェクト
  const previewEmpty = document.querySelector("#preview-empty");
  const problemPreview = document.querySelector("#problem-preview");
  const problemPreviewBody = document.querySelector("#problem-preview-body");
  // ダウンロードボタン
  const downloadButton = document.querySelector("#download-button");
  // 問題生成・PDF作成の進捗メッセージを表示する要素を取得する。
  const generationProgress = document.querySelector("#generation-progress");
  // 問題設定コントローラー
  const settingsController = window.ProblemSettings.setup(form, problemCountInput, "pdf");
  // 生成中かどうか管理する
  let busy = false;

  // 最新の生成結果を保持する。PDFデータを再利用し、保存時に問題を作り直さない。
  const state = {
    problems: [],
    settings: null,
    seed: null,
    date: null,
    pdfData: null,
  };

  // エラー文を設定し、それまで非表示だったエラー欄を表示する。
  function showError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  // エラー文だけを消して非表示に戻す。生成済みの問題は変更しない。
  function clearError() {
    formError.textContent = "";
    formError.hidden = true;
  }

  // 渡された日付をローカル時刻のyyyyMMddに整形し、seed入力欄の例に使う。
  function formatSeedDate(date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  // 生成中フラグ、生成ボタン、支援技術向けの処理中状態をまとめて切り替える。
  function setGenerationBusy(isBusy) {
    busy = isBusy;
    generateButton.disabled = isBusy;
    generateButton.textContent = isBusy ? "問題を生成中…" : "問題を生成";
    form.setAttribute("aria-busy", String(isBusy));
  }

  // 共通コントローラーで入力値を検証し、生成器へ渡す設定オブジェクトを返す。
  function readSettings() {
    return settingsController.read();
  }

  // 問題番号・数式・答えの表を作り、以前のプレビューを最新の結果で置き換える。
  function renderProblemPreview(problems) {
    const fragment = document.createDocumentFragment();

    // 行をDocumentFragmentに蓄積し、完成した表を最後に一括で画面へ反映する。
    problems.forEach((problem, index) => {
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
      // 答えも数の種類に合わせて整形し、解答欄に描画する。
      window.MathDisplay.render(answerCell, problem.answer, problem.numberType);
      row.append(expressionCell, answerCell);
      fragment.append(row);
    });

    // 作成した行をプレビュー表へまとめて反映する。
    problemPreviewBody.replaceChildren(fragment);
    previewEmpty.hidden = true;
    problemPreview.hidden = false;
  }

  // フォーム送信を受け、問題生成、プレビュー更新、PDFの事前作成を順に行う。
  async function handleGenerate(event) {
    // ページ遷移を止め、二重生成を防いでから以前の保存データと表示をリセットする。
    event.preventDefault();
    if (busy) return; // 既に押されている場合は何もしない
    clearError();
    setGenerationBusy(true);
    downloadButton.disabled = true;
    state.pdfData = null;
    state.problems = [];
    usedSeedOutput.textContent = "未生成";
    problemPreview.hidden = true;
    previewEmpty.hidden = false;
    generationProgress.hidden = true;

    try {
      // 設定を読み込み、画面表示を変更
      const settings = readSettings();
      const requestedSeed = seedInput.value.trim();
      const seed = requestedSeed || window.MathGenerator.createRandomSeed();
      generationProgress.hidden = false;
      generationProgress.textContent = `問題を生成中：0 / ${settings.problemCount}問`;

      // Workerで問題を生成し、通知される完了件数を画面に表示する。
      const problems = await window.ProblemSettings.generate(
        settings, seed,
        (completed, total) => { generationProgress.textContent = `問題を生成中：${completed} / ${total}問`; },
      );
      const generatedDate = new Date();

      // 後から設定欄が編集されても、生成時の条件・日付と結果を保持しておく。
      state.problems = problems;
      state.settings = settings;
      state.seed = seed;
      state.date = generatedDate;
      state.pdfData = null;

      usedSeedOutput.textContent = seed;
      // プレビュー表示：生成した問題と答えを画面に表示する。
      renderProblemPreview(problems);

      // 保存操作で待たせないよう、この時点でPDFのバイナリデータまで準備する。
      try {
        generateButton.textContent = "PDFを作成中…";
        generationProgress.textContent = "PDFを作成中…";
        // PDF作成：問題用紙と解答用紙を作り、保存に使うPDFデータを保持する。
        state.pdfData = await window.WorksheetPdf.createWorksheetData({
          problems,
          date: generatedDate,
        });
        downloadButton.disabled = false;
        generationProgress.textContent = `${problems.length}問の問題とPDFを作成しました。`;
      } catch (pdfError) {
        // PDFだけが失敗した場合は、生成できた問題のプレビューを残して知らせる。
        console.error("PDF preparation failed:", pdfError);
        generationProgress.hidden = true;
        showError("問題は生成できましたが、PDFを準備できませんでした。もう一度お試しください。");
      }
    } catch (error) {
      generationProgress.hidden = true;
      console.error("Problem generation failed:", error);
      showError(
        error instanceof window.MathGenerator.GeneratorError
          ? error.message
          : "問題を生成できませんでした。設定条件を確認してください。",
      );
    } finally {
      // 成功・失敗のどちらでも生成ボタンを再び操作できる状態に戻す。
      setGenerationBusy(false);
    }
  }

  // ダウンロード管理
  // 生成済みのPDFデータを指定名で保存する。未生成の場合はエラーを表示する。
  function handleDownload() {
    if (!state.pdfData) {
      showError("先に問題を生成してください。");
      return;
    }

    clearError();

    try {
      // PDF保存：準備済みのPDFをブラウザからダウンロードする。
      window.WorksheetPdf.downloadPdfData({
        data: state.pdfData,
        filename: PDF_FILENAME,
      });
    } catch (error) {
      console.error("PDF download failed:", error);
      showError("PDFをダウンロードできませんでした。もう一度お試しください。");
    }
  }

  // イベント検知
  // 画面の操作と処理を接続し、seedの入力例を今日の日付に更新する。
  form.addEventListener("submit", handleGenerate);
  downloadButton.addEventListener("click", handleDownload);
  seedInput.placeholder = `例：${formatSeedDate(new Date())}`;

  // ライブラリチェック
  // ページを開いた時点でフォントを先読みし、初回のPDF作成時の待ち時間を減らす。
  if (window.WorksheetPdf && typeof window.WorksheetPdf.prepare === "function") {
    window.WorksheetPdf.prepare().catch((error) => {
      console.error("PDF assets could not be prepared:", error);
    });
  }
})();
