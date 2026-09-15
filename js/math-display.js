// 画面のKaTeX表示と、PDFに文字・分数線を直接描く処理を共通化する。
(function (global) {
  "use strict";

  // PDFの分子・分母に適用する倍率。画面側のKaTeX表示の拡大設定とは別に管理する。
  const PDF_FRACTION_FONT_SCALE = 0.78 * 1.4;

  // 整数問題は通常テキスト、有理数問題はKaTeXとして指定されたHTML要素に表示する。
  function render(element, value, numberType) {
    if (numberType !== "rational") { element.textContent = String(value); return; }
    if (!global.katex) throw new Error("KaTeXが読み込まれていません。");
    // 入力は生成器が作る数式だけ。任意のHTMLや外部URLは許可しない。
    const formula = document.createElement("span");
    formula.className = "math-formula";
    // 分子・分母だけを通常サイズへ戻す（従来の約1.43倍）。
    // 保存用のLaTeX文字列や、整数・小数の文字サイズは変更しない。
    const displayValue = String(value).replace(/□/g, "\\square").replace(/\\frac(?=\{)/g, "\\dfrac");
    // 数式表示：LaTeXをKaTeXで描画し、分子と分母が上下に並ぶ表示を作る。
    global.katex.render(displayValue, formula, {
      throwOnError: true, trust: false, strict: "error", output: "htmlAndMathml",
    });
    // 古い数式要素を置き換え、再生成時に表示が積み重ならないようにする。
    element.replaceChildren(formula);
  }

  // 生成器の出力は整数・帯分数・真分数・小数と四則演算・括弧のみ。
  // PDFには文字と分数線を直接描き、拡大しても数式がぼやけないようにする。
  // 保存用の数式を、通常文字・分数・括弧の描画用部品に分解する。
  function pdfPieces(expression) {
    const source = String(expression).replace(/\\left\s*\(/g, "(").replace(/\\right\s*\)/g, ")");
    const fraction = /\\frac\{(\d+)\}\{(\d+)\}/g;
    const pieces = [];
    // 分数の位置を順に探し、直前の文字と分子・分母を分けて元の順番で保持する。
    let start = 0;
    for (const match of source.matchAll(fraction)) {
      if (match.index > start) pieces.push({ text: source.slice(start, match.index) });
      pieces.push({ numerator: match[1], denominator: match[2] });
      start = match.index + match[0].length;
    }
    if (start < source.length) pieces.push({ text: source.slice(start) });
    // 未対応のLaTeXコマンドが残った場合は、そのまま印刷せずエラーにする。
    if (pieces.some((piece) => piece.text?.includes("\\"))) throw new Error("未対応のPDF数式表記です。");
    // 括弧は別の部品にし、分数があるときは高さを合わせる。
    return pieces.flatMap((piece) => piece.text === undefined ? [piece]
      : piece.text.split(/([()])/).filter(Boolean).map((text) => ({ text, bracket: text === "(" || text === ")" })));
  }
  // 文字サイズを指定して各部品の幅と式全体の高さを計測する。返す寸法はmm単位。
  function measure(doc, pieces, size) {
    // 文字サイズのptをPDFの座標単位mmへ換算し、高さと余白の基準にする。
    const mm = size * 25.4 / 72;
    let width = 0;
    let height = mm * 1.15;
    const hasFraction = pieces.some((piece) => piece.numerator !== undefined);
    const measured = pieces.map((piece) => {
      if (piece.text !== undefined) {
        // 分数を含む式の括弧は、分子から分母までを囲めるように高くする。
        const scale = piece.bracket && hasFraction ? 1.9 : 1;
        doc.setFontSize(size * scale);
        const w = doc.getTextWidth(piece.text);
        width += w;
        height = Math.max(height, mm * scale * 1.15);
        return { ...piece, width: w, scale };
      }
      doc.setFontSize(size * PDF_FRACTION_FONT_SCALE);
      // 分子と分母の長い方を基準に、左右の余白を加えた分数の幅を決める。
      const w = Math.max(doc.getTextWidth(piece.numerator), doc.getTextWidth(piece.denominator)) + mm * 0.36;
      width += w;
      height = Math.max(height, mm * 2.2);
      return { ...piece, width: w };
    });
    return { pieces: measured, width, height, mm };
  }
  // 幅・高さの制限内に数式を描く。centeredがtrueなら領域内で左右中央に配置する。
  function drawPdf(doc, value, x, centerY, maxWidth, maxHeight, preferredSize = 11.5, centered = false) {
    // PDF用の準備：数式を文字と分数の部品に分け、配置を計算できる形にする。
    const pieces = pdfPieces(value);
    const preferred = measure(doc, pieces, preferredSize);
    // 希望サイズで測り、幅と高さの両方に収まる倍率まで式全体を縮小する。
    const size = preferredSize * Math.min(1, maxWidth / Math.max(preferred.width, 0.01), maxHeight / preferred.height);
    const layout = measure(doc, pieces, size);
    let cursor = centered ? x + (maxWidth - layout.width) / 2 : x;
    // 文字は基準線を調整して描き、分数は中央をそろえた分子・分母と横線で表す。
    for (const piece of layout.pieces) {
      if (piece.text !== undefined) {
        doc.setFontSize(size * piece.scale);
        // 文字描画：整数・小数・演算記号・括弧の部品をPDFへ直接描く。
        doc.text(piece.text, cursor, centerY + layout.mm * piece.scale * 0.3);
      } else {
        doc.setFontSize(size * PDF_FRACTION_FONT_SCALE);
        const centerX = cursor + piece.width / 2;
        // 分数描画：分子を上、分母を下に置き、中央に分数線を引く。
        doc.text(piece.numerator, centerX, centerY - layout.mm * 0.16, { align: "center" });
        doc.text(piece.denominator, centerX, centerY + layout.mm * 0.98, { align: "center" });
        doc.setLineWidth(Math.max(0.12, layout.mm * 0.035));
        doc.line(cursor + layout.mm * 0.08, centerY, cursor + piece.width - layout.mm * 0.08, centerY);
      }
      // 描いた部品の幅だけ次の描画位置を右へ進める。
      cursor += piece.width;
    }
  }
  global.MathDisplay = Object.freeze({ render, drawPdf });
})(window);
