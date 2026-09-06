(function (global) {
  "use strict";

  const PDF_FRACTION_FONT_SCALE = 0.78 * 1.4;

  function render(element, value, numberType) {
    if (numberType !== "rational") { element.textContent = String(value); return; }
    if (!global.katex) throw new Error("KaTeXが読み込まれていません。");
    // 入力は生成器が作る数式だけ。任意のHTMLや外部URLは許可しない。
    const formula = document.createElement("span");
    formula.className = "math-formula";
    // 分子・分母だけを通常サイズへ戻す（従来の約1.43倍）。
    // 保存用のLaTeX文字列や、整数・小数の文字サイズは変更しない。
    const displayValue = String(value).replace(/□/g, "\\square").replace(/\\frac(?=\{)/g, "\\dfrac");
    global.katex.render(displayValue, formula, {
      throwOnError: true, trust: false, strict: "error", output: "htmlAndMathml",
    });
    element.replaceChildren(formula);
  }

  // 生成器の出力は整数・帯分数・真分数・小数と四則演算・括弧のみ。
  // PDFには文字と分数線を直接描き、拡大しても数式がぼやけないようにする。
  function pdfPieces(expression) {
    const source = String(expression).replace(/\\left\s*\(/g, "(").replace(/\\right\s*\)/g, ")");
    const fraction = /\\frac\{(\d+)\}\{(\d+)\}/g;
    const pieces = [];
    let start = 0;
    for (const match of source.matchAll(fraction)) {
      if (match.index > start) pieces.push({ text: source.slice(start, match.index) });
      pieces.push({ numerator: match[1], denominator: match[2] });
      start = match.index + match[0].length;
    }
    if (start < source.length) pieces.push({ text: source.slice(start) });
    if (pieces.some((piece) => piece.text?.includes("\\"))) throw new Error("未対応のPDF数式表記です。");
    // 括弧は別の部品にし、分数があるときは高さを合わせる。
    return pieces.flatMap((piece) => piece.text === undefined ? [piece]
      : piece.text.split(/([()])/).filter(Boolean).map((text) => ({ text, bracket: text === "(" || text === ")" })));
  }
  function measure(doc, pieces, size) {
    const mm = size * 25.4 / 72;
    let width = 0;
    let height = mm * 1.15;
    const hasFraction = pieces.some((piece) => piece.numerator !== undefined);
    const measured = pieces.map((piece) => {
      if (piece.text !== undefined) {
        const scale = piece.bracket && hasFraction ? 1.9 : 1;
        doc.setFontSize(size * scale);
        const w = doc.getTextWidth(piece.text);
        width += w;
        height = Math.max(height, mm * scale * 1.15);
        return { ...piece, width: w, scale };
      }
      doc.setFontSize(size * PDF_FRACTION_FONT_SCALE);
      const w = Math.max(doc.getTextWidth(piece.numerator), doc.getTextWidth(piece.denominator)) + mm * 0.36;
      width += w;
      height = Math.max(height, mm * 2.2);
      return { ...piece, width: w };
    });
    return { pieces: measured, width, height, mm };
  }
  function drawPdf(doc, value, x, centerY, maxWidth, maxHeight, preferredSize = 11.5, centered = false) {
    const pieces = pdfPieces(value);
    const preferred = measure(doc, pieces, preferredSize);
    const size = preferredSize * Math.min(1, maxWidth / Math.max(preferred.width, 0.01), maxHeight / preferred.height);
    const layout = measure(doc, pieces, size);
    let cursor = centered ? x + (maxWidth - layout.width) / 2 : x;
    for (const piece of layout.pieces) {
      if (piece.text !== undefined) {
        doc.setFontSize(size * piece.scale);
        doc.text(piece.text, cursor, centerY + layout.mm * piece.scale * 0.3);
      } else {
        doc.setFontSize(size * PDF_FRACTION_FONT_SCALE);
        const centerX = cursor + piece.width / 2;
        doc.text(piece.numerator, centerX, centerY - layout.mm * 0.16, { align: "center" });
        doc.text(piece.denominator, centerX, centerY + layout.mm * 0.98, { align: "center" });
        doc.setLineWidth(Math.max(0.12, layout.mm * 0.035));
        doc.line(cursor + layout.mm * 0.08, centerY, cursor + piece.width - layout.mm * 0.08, centerY);
      }
      cursor += piece.width;
    }
  }
  global.MathDisplay = Object.freeze({ render, drawPdf });
})(window);
