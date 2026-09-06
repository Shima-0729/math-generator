(function (global) {
  "use strict";

  const FONT_URL = "fonts/MPLUS1p-Regular.ttf";
  const FONT_FILE_NAME = "MPLUS1p-Regular.ttf";
  const FONT_FAMILY = "MPLUS1p";
  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;
  const MARGIN_X = 15;
  const PROBLEMS_PER_PAGE = 30;

  let fontBinaryPromise = null;

  function arrayBufferToBinaryString(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return binary;
  }

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
          fontBinaryPromise = null;
          throw error;
        });
    }

    return fontBinaryPromise;
  }

  function splitIntoPages(items, pageSize) {
    const pages = [];
    for (let index = 0; index < items.length; index += pageSize) {
      pages.push(items.slice(index, index + pageSize));
    }
    return pages;
  }

  function formatLocalDate(date) {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  function setFontSizeToFit(doc, text, maximumWidth, preferredSize, minimumSize) {
    let fontSize = preferredSize;
    doc.setFontSize(fontSize);

    while (fontSize > minimumSize && doc.getTextWidth(text) > maximumWidth) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
    }
  }

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
      const columnIndex = Math.floor(index / rowsPerColumn);
      const rowIndex = index % rowsPerColumn;
      const x = MARGIN_X + columnIndex * columnWidth;
      const y = problemTop + rowIndex * rowGap;
      const numberText = `${startNumber + index}.`;

      doc.setFontSize(10.5);
      doc.text(numberText, x, y);
      if (problem.numberType === "rational") {
        global.MathDisplay.drawPdf(doc, problem.expression, x + 11, y - 1, columnWidth - 14, rowGap - 1.5);
      } else {
        setFontSizeToFit(doc, problem.expression, columnWidth - 14, 11.5, 7.5);
        doc.text(problem.expression, x + 11, y);
      }
    });
  }

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
      const columnIndex = Math.floor(index / rowsPerColumn);
      const rowIndex = index % rowsPerColumn;
      const x = MARGIN_X + columnIndex * columnWidth + boxGap / 2;
      const y = gridTop + rowIndex * rowGap;

      doc.setLineWidth(0.3);
      doc.rect(x, y, boxWidth, boxHeight);

      doc.setFontSize(10);
      doc.text(`${startNumber + index}.`, x + 2, y + 6.2);

      if (showAnswers) {
        const answerAreaStart = x + 12;
        const answerAreaEnd = x + boxWidth - 2;
        const centerX = (answerAreaStart + answerAreaEnd) / 2;
        if (problem.numberType === "rational") {
          global.MathDisplay.drawPdf(doc, problem.answer, answerAreaStart, y + boxHeight / 2,
            answerAreaEnd - answerAreaStart, boxHeight - 0.5, 11.5, true);
        } else {
          setFontSizeToFit(doc, String(problem.answer), answerAreaEnd - answerAreaStart, 11.5, 8);
          doc.text(String(problem.answer), centerX, y + 6.3, { align: "center" });
        }
      }
    });
  }

  function drawWorksheetPage(doc, options) {
    const {
      problems,
      startNumber,
      dateText,
      showAnswers,
      pageNumber,
      totalPages,
    } = options;

    drawHeader(doc, showAnswers ? "解答" : "算数プリント", dateText, pageNumber, totalPages);
    drawProblems(doc, problems, startNumber);
    drawAnswerGrid(doc, problems, startNumber, showAnswers);

    doc.setFontSize(6.5);
    doc.setTextColor(130, 139, 146);
    doc.text("算数プリント作成ツール", PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 8, { align: "right" });
  }

  async function createDocument(problems, date) {
    if (!global.jspdf || typeof global.jspdf.jsPDF !== "function") {
      throw new Error("jsPDF is not available.");
    }
    if (!Array.isArray(problems) || problems.length === 0) {
      throw new Error("No problems were supplied.");
    }

    const fontBinary = await loadFontBinary();
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
      putOnlyUsedFonts: true,
    });

    doc.addFileToVFS(FONT_FILE_NAME, fontBinary);
    doc.addFont(FONT_FILE_NAME, FONT_FAMILY, "normal");
    doc.setFont(FONT_FAMILY, "normal");

    const pages = splitIntoPages(problems, PROBLEMS_PER_PAGE);
    const dateText = formatLocalDate(date);
    const totalPdfPages = pages.length * 2;
    let currentPdfPage = 0;

    const drawPage = (pageProblems, problemPageIndex, showAnswers) => {
      if (currentPdfPage > 0) {
        doc.addPage("a4", "portrait");
        doc.setFont(FONT_FAMILY, "normal");
      }

      currentPdfPage += 1;
      drawWorksheetPage(doc, {
        problems: pageProblems,
        startNumber: problemPageIndex * PROBLEMS_PER_PAGE + 1,
        dateText,
        showAnswers,
        pageNumber: currentPdfPage,
        totalPages: totalPdfPages,
      });
    };

    pages.forEach((pageProblems, pageIndex) => {
      drawPage(pageProblems, pageIndex, false);
    });
    pages.forEach((pageProblems, pageIndex) => {
      drawPage(pageProblems, pageIndex, true);
    });

    return doc;
  }

  async function createWorksheetData({ problems, date }) {
    const doc = await createDocument(problems, date);
    return doc.output("arraybuffer");
  }

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
    link.click();
    link.remove();

    global.setTimeout(() => {
      global.URL.revokeObjectURL(objectUrl);
    }, 1000);
  }

  async function downloadWorksheet({ problems, date, filename = "math-worksheet.pdf" }) {
    const data = await createWorksheetData({ problems, date });
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
