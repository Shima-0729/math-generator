// 同梱フォントをjsPDFへ登録し、問題用紙と解答用紙を作成して保存する。
(function (global) {
  "use strict";

  // フォントの取得先と登録名を定義する。PDF座標はmm、文字サイズはptを使う。
  const FONT_URL = "fonts/MPLUS1p-Regular.ttf";
  const FONT_FILE_NAME = "MPLUS1p-Regular.ttf";
  const FONT_FAMILY = "MPLUS1p";
  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const MARGIN_X = 15;
  const PROBLEMS_PER_PAGE = 30;

  // 取得処理そのものをキャッシュし、同時要求や2回目の生成で重複取得を避ける。
  let fontBinaryPromise = null;

  // フォントのバイト列を、jsPDFの仮想ファイルシステムに渡すバイナリ文字列へ変換する。
  function arrayBufferToBinaryString(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    // バイト列を分割して変換し、一度に大量の引数を渡して上限を超えないようにする。
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return binary;
  }

  // フォントを取得・変換して返す。取得中または取得済みなら同じPromiseを再利用する。
  async function loadFontBinary() {
    if (!fontBinaryPromise) {
      fontBinaryPromise = fetch(FONT_URL)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Font loading failed with status ${response.status}.`);
          }
          return response.arrayBuffer();
        })
        .then(arrayBufferToBinaryString)
        .catch((error) => {
          // 失敗したPromiseは保持せず、次の操作でフォントを再取得できるようにする。
          fontBinaryPromise = null;
          throw error;
        });
    }

    return fontBinaryPromise;
  }

  // 問題配列を指定件数ずつに分割し、ページ単位の問題配列を返す。
  function splitIntoPages(items, pageSize) {
    const pages = [];
    for (let index = 0; index < items.length; index += pageSize) {
      pages.push(items.slice(index, index + pageSize));
    }
    return pages;
  }

  // PDFの見出し用に、ローカル日付を年/月/日の文字列へ整形する。
  function formatLocalDate(date) {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  // 文字列が指定幅に入るか最小サイズになるまで、文字サイズを0.5ptずつ下げる。
  function setFontSizeToFit(doc, text, maximumWidth, preferredSize, minimumSize) {
    let fontSize = preferredSize;
    doc.setFontSize(fontSize);

    while (fontSize > minimumSize && doc.getTextWidth(text) > maximumWidth) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
    }
  }

  // 用紙上部にタイトル・日付・名前欄を描き、複数ページの場合はページ番号も添える。
  function drawHeader(doc, title, dateText, pageNumber, totalPages) {
    doc.setTextColor(23, 33, 43);
    doc.setFontSize(18);
    doc.text(title, MARGIN_X, 17);

    doc.setFontSize(9.5);
    doc.text(`日付：${dateText}`, 119, 17);
    doc.text("名前：", 157, 17);
    doc.line(171, 17.5, 195, 17.5);

    doc.setLineWidth(0.55);
    doc.line(MARGIN_X, 24, PAGE_WIDTH - MARGIN_X, 24);

    if (totalPages > 1) {
      doc.setFontSize(7.5);
      doc.setTextColor(100, 112, 122);
      doc.text(`${pageNumber} / ${totalPages}`, PAGE_WIDTH - MARGIN_X, 29, { align: "right" });
      doc.setTextColor(23, 33, 43);
    }
  }

  // 問題文を上から下へ並べる。15問を超える場合は2列にして1ページに収める。
  function drawProblems(doc, problems, startNumber) {
    const twoColumns = problems.length > 15;
    const columnCount = twoColumns ? 2 : 1;
    const rowsPerColumn = Math.ceil(problems.length / columnCount);
    const columnWidth = (PAGE_WIDTH - MARGIN_X * 2) / columnCount;
    const problemTop = 43;
    const rowGap = twoColumns ? 10.2 : 10.7;

    doc.setFontSize(10);
    doc.text("□に当てはまる数を求めなさい。", MARGIN_X, 35);

    problems.forEach((problem, index) => {
      // 添字を列と行に分解し、左列を上から埋めてから右列へ移る縦方向の番号順にする。
      const columnIndex = Math.floor(index / rowsPerColumn);
      const rowIndex = index % rowsPerColumn;
      const x = MARGIN_X + columnIndex * columnWidth;
      const y = problemTop + rowIndex * rowGap;
      const numberText = `${startNumber + index}.`;

      doc.setFontSize(10.5);
      doc.text(numberText, x, y);
      // 分数は専用描画で上下に配置し、整数問題は文字列の横幅を調整して描く。
      if (problem.numberType === "rational") {
        // 問題描画：有理数の式を、分数の上下配置を保ってPDFへ直接描く。
        global.MathDisplay.drawPdf(doc, problem.expression, x + 11, y - 1, columnWidth - 14, rowGap - 1.5);
      } else {
        setFontSizeToFit(doc, problem.expression, columnWidth - 14, 11.5, 7.5);
        // 問題描画：整数の式を、調整した文字サイズでPDFへ描く。
        doc.text(problem.expression, x + 11, y);
      }
    });
  }

  // 用紙下部に5列の解答欄を描き、showAnswersがtrueの場合だけ正解も入れる。
  function drawAnswerGrid(doc, problems, startNumber, showAnswers) {
    const headingY = 215;
    const gridTop = 223;
    const columnCount = 5;
    const rowsPerColumn = Math.ceil(problems.length / columnCount);
    const columnWidth = (PAGE_WIDTH - MARGIN_X * 2) / columnCount;
    const boxGap = 2;
    const boxWidth = columnWidth - boxGap;
    const boxHeight = 9.5;
    const rowGap = 10.5;

    doc.setFontSize(11);
    doc.text(showAnswers ? "解答" : "解答欄", MARGIN_X, headingY);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_X, headingY + 3, PAGE_WIDTH - MARGIN_X, headingY + 3);

    problems.forEach((problem, index) => {
      // 解答欄も列を先に埋める順番にし、縦方向に問題番号を進める。
      const columnIndex = Math.floor(index / rowsPerColumn);
      const rowIndex = index % rowsPerColumn;
      const x = MARGIN_X + columnIndex * columnWidth + boxGap / 2;
      const y = gridTop + rowIndex * rowGap;

      doc.setLineWidth(0.3);
      doc.rect(x, y, boxWidth, boxHeight);

      doc.setFontSize(10);
      doc.text(`${startNumber + index}.`, x + 2, y + 6.2);

      // 番号の領域を避けた残りの枠に、答えを中央ぞろえで配置する。
      if (showAnswers) {
        const answerAreaStart = x + 12;
        const answerAreaEnd = x + boxWidth - 2;
        const centerX = (answerAreaStart + answerAreaEnd) / 2;
        if (problem.numberType === "rational") {
          // 解答描画：分数を含む答えを、解答欄の中央に描く。
          global.MathDisplay.drawPdf(doc, problem.answer, answerAreaStart, y + boxHeight / 2,
            answerAreaEnd - answerAreaStart, boxHeight - 0.5, 11.5, true);
        } else {
          setFontSizeToFit(doc, String(problem.answer), answerAreaEnd - answerAreaStart, 11.5, 8);
          // 解答描画：整数の答えを、解答欄の中央に描く。
          doc.text(String(problem.answer), centerX, y + 6.3, { align: "center" });
        }
      }
    });
  }

  // 見出し・問題文・解答欄・フッターを組み合わせ、PDFの1ページを完成させる。
  function drawWorksheetPage(doc, options) {
    const {
      problems,
      startNumber,
      dateText,
      showAnswers,
      pageNumber,
      totalPages,
    } = options;

    // 用紙の見出しを描く。問題用紙と解答用紙でタイトルを切り替える。
    drawHeader(doc, showAnswers ? "解答" : "算数プリント", dateText, pageNumber, totalPages);
    // 用紙の上部に、番号順で問題の数式を並べる。
    drawProblems(doc, problems, startNumber);
    // 用紙の下部に解答欄を描き、解答用紙の場合は正解も入れる。
    drawAnswerGrid(doc, problems, startNumber, showAnswers);

    doc.setFontSize(6.5);
    doc.setTextColor(130, 139, 146);
    doc.text("算数プリント作成ツール", PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 8, { align: "right" });
  }

  // 問題配列と作成日から、問題用紙・解答用紙を含むjsPDF文書を作って返す。
  async function createDocument(problems, date) {
    if (!global.jspdf || typeof global.jspdf.jsPDF !== "function") {
      throw new Error("jsPDF is not available.");
    }
    if (!Array.isArray(problems) || problems.length === 0) {
      throw new Error("No problems were supplied.");
    }

    const fontBinary = await loadFontBinary();
    const { jsPDF } = global.jspdf;
    // PDF作成の開始：A4縦向きの文書を用意する。
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      putOnlyUsedFonts: true,
    });

    // 取得したフォントを登録して選択し、日本語をPDFに描けるようにする。
    doc.addFileToVFS(FONT_FILE_NAME, fontBinary);
    doc.addFont(FONT_FILE_NAME, FONT_FAMILY, "normal");
    doc.setFont(FONT_FAMILY, "normal");

    // 各問題ページに対応する解答ページを作るため、PDFのページ数は分割数の2倍になる。
    const pages = splitIntoPages(problems, PROBLEMS_PER_PAGE);
    const dateText = formatLocalDate(date);
    const totalPdfPages = pages.length * 2;
    let currentPdfPage = 0;

    // 必要なら新しいページを追加し、文書全体のページ番号と問題の開始番号を渡して描く。
    const drawPage = (pageProblems, problemPageIndex, showAnswers) => {
      if (currentPdfPage > 0) {
        doc.addPage("a4", "portrait");
        doc.setFont(FONT_FAMILY, "normal");
      }

      currentPdfPage += 1;
      // ページ作成：見出し・問題・解答欄を現在のPDFページへ描く。
      drawWorksheetPage(doc, {
        problems: pageProblems,
        startNumber: problemPageIndex * PROBLEMS_PER_PAGE + 1,
        dateText,
        showAnswers,
        pageNumber: currentPdfPage,
        totalPages: totalPdfPages,
      });
    };

    // 先に問題用紙をすべて描き、その後で同じ順番の解答用紙を追加する。
    pages.forEach((pageProblems, pageIndex) => {
      // 問題用紙の作成：答えが空欄のページを追加する。
      drawPage(pageProblems, pageIndex, false);
    });
    pages.forEach((pageProblems, pageIndex) => {
      // 解答用紙の作成：正解を記入したページを追加する。
      drawPage(pageProblems, pageIndex, true);
    });

    return doc;
  }

  // 完成した文書をArrayBufferに変換し、画面側で再利用できるPDFデータとして返す。
  async function createWorksheetData({ problems, date }) {
    // 問題用紙と解答用紙を組み立て、PDF文書を完成させる。
    const doc = await createDocument(problems, date);
    // 完成したPDF文書を、保存できるバイナリデータへ変換する。
    return doc.output("arraybuffer");
  }

  // 生成済みPDFの一時URLを作り、指定したファイル名でブラウザの保存を開始する。
  function downloadPdfData({ data, filename = "math-worksheet.pdf" }) {
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      throw new Error("PDF data is not available.");
    }

    const blob = new Blob([data], { type: "application/pdf" });
    const objectUrl = global.URL.createObjectURL(blob);
    const link = global.document.createElement("a");

    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    global.document.body.append(link);
    // PDF保存：一時リンクを使ってブラウザのダウンロードを開始する。
    link.click();
    link.remove();

    // クリック直後の読み込みを妨げないよう少し待ってから、一時URLを解放する。
    global.setTimeout(() => {
      global.URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  // PDFの作成とダウンロードを続けて行う呼び出し口。
  async function downloadWorksheet({ problems, date, filename = "math-worksheet.pdf" }) {
    // PDF作成：問題と日付をもとに保存用データを作る。
    const data = await createWorksheetData({ problems, date });
    // PDF保存：作成したデータを指定のファイル名でダウンロードする。
    downloadPdfData({ data, filename });
  }

  global.WorksheetPdf = Object.freeze({
    createDocument,
    createWorksheetData,
    downloadPdfData,
    downloadWorksheet,
    prepare: loadFontBinary,
  });
})(window);
