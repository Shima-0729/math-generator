// KaTeXの数式を透明PNGへ変換し、CSVとともにZIPへ格納する。画像は1枚ずつ処理する。
(function (global) {
  "use strict";

  // CSS上のサイズの2倍の画素数で出力し、画像変換の待ち時間は30秒を上限にする。
  const PIXEL_RATIO = 2;
  const IMAGE_TIMEOUT_MS = 30000;

  // 中止を通常の失敗と区別できるよう、共通のAbortErrorを作る。
  function abortError() {
    return new DOMException("ZIP作成をキャンセルしました。", "AbortError");
  }

  // 中止要求が届いていたら例外で以降の処理を止める。
  function checkAbort(signal) {
    if (signal?.aborted) throw abortError();
  }

  // 画像デコードが完了しない場合も、キャンセル・タイムアウトでUIを復帰させる。
  // 非同期処理を待ち、完了・失敗・中止・時間切れのいずれかで結果を確定する。
  function waitFor(promise, signal, message, timeout = IMAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let settled = false;
      // 最初の終了通知だけを採用し、タイマーと中止リスナーを片付ける。
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      };
      // AbortSignalからの通知を、この待機処理の失敗として伝える。
      const onAbort = () => finish(reject, abortError());
      const timer = setTimeout(() => finish(reject, new Error(message)), timeout);
      signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(promise).then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
      // リスナー登録前に中止済みだった場合も、待機を継続しない。
      if (signal?.aborted) onAbort();
    });
  }

  // フォントのBlobをData URLへ変換し、画像化用CSSへ埋め込めるようにする。
  function asDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("画像用フォントを読み込めませんでした。"));
      reader.onabort = () => reject(abortError());
      reader.readAsDataURL(blob);
    });
  }

  // CSSのフォント名から前後の空白と引用符を除き、比較用の名前にする。
  function familyName(value) {
    return value.trim().replace(/["']/g, "");
  }

  // KaTeXのフォント定義から同じサイトのWOFF2を取得し、埋め込み用CSSを用意する。
  async function prepareFonts(signal) {
    const sheet = document.querySelector("#katex-stylesheet")?.sheet;
    if (!sheet || !document.fonts) throw new Error("数式用フォントを利用できません。");
    const rules = Array.from(sheet.cssRules).filter((rule) => rule.type === CSSRule.FONT_FACE_RULE);
    if (!rules.length) throw new Error("KaTeXのフォント定義が見つかりません。");
    const fonts = new Map();

    // 配布済みWOFF2をそのまま埋め込む。失敗を空フォントで代替せず、書き出しを止める。
    for (const rule of rules) {
      checkAbort(signal);
      const source = rule.style.getPropertyValue("src").match(/url\(["']?([^"')]+\.woff2)["']?\)/);
      if (!source) throw new Error("画像用のWOFF2フォントが見つかりません。");
      const url = new URL(source[1], sheet.href);
      if (url.origin !== location.origin) throw new Error("画像用フォントは同じサイトから読み込みます。");
      const response = await waitFor(fetch(url, { signal }), signal, "フォントの取得がタイムアウトしました。");
      if (!response.ok) throw new Error("画像用フォントを取得できませんでした。");
      const buffer = await waitFor(response.arrayBuffer(), signal, "フォントの取得がタイムアウトしました。");
      if (!buffer.byteLength) throw new Error("画像用フォントが空です。");
      const dataUrl = await waitFor(asDataUrl(new Blob([buffer], { type: "font/woff2" })), signal,
        "フォントの変換がタイムアウトしました。");
      const family = familyName(rule.style.fontFamily);
      const weight = rule.style.fontWeight || "normal";
      const style = rule.style.fontStyle || "normal";
      const css = `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};src:url("${dataUrl}") format("woff2");}`;
      fonts.set(family, (fonts.get(family) || "") + css);
      // 数式の寸法を測る前に、ブラウザ側でもフォントが読み込まれたことを確認する。
      const loaded = await waitFor(document.fonts.load(`${style} ${weight} 24px "${family}"`), signal,
        "フォントの読み込みがタイムアウトしました。");
      if (!loaded.length || loaded.some((font) => font.status !== "loaded")) {
        throw new Error("数式用フォントを読み込めませんでした。");
      }
    }
    return fonts;
  }

  // 数式の各要素が使うKaTeXフォントを調べ、必要な定義だけを結合して返す。
  function fontsForNode(node, fonts, cache) {
    const families = new Set();
    for (const element of [node, ...node.querySelectorAll("*")]) {
      for (const family of getComputedStyle(element).fontFamily.split(",").map(familyName)) {
        if (family.startsWith("KaTeX_")) {
          if (!fonts.has(family)) throw new Error("数式に必要なフォントが見つかりません。");
          families.add(family);
        }
      }
    }
    // 使うフォント群が同じ数式ではCSSを再利用し、結合処理の重複を避ける。
    const key = [...families].sort().join(",");
    if (!key) throw new Error("数式のフォントを確認できませんでした。");
    if (!cache.has(key)) cache.set(key, [...families].sort().map((family) => fonts.get(family)).join("\n"));
    return cache.get(key);
  }

  // 数式をKaTeXで描画し、実寸に合わせた透明PNGのバイト列を返す。
  async function renderPng(node, latex, fonts, fontCssCache, signal) {
    checkAbort(signal);
    // 分数を大きく描くdfracへ変換し、不正な数式や信頼が必要なコマンドはエラーにする。
    global.katex.render(latex.replace(/\\frac(?=\{)/g, "\\dfrac"), node, {
      throwOnError: true, trust: false, strict: "error", output: "html", displayMode: false,
    });
    const fontEmbedCSS = fontsForNode(node, fonts, fontCssCache);
    // 式ごとの幅と高さを測り、画素数が大きすぎる画像は作成前に止める。
    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (width <= 0 || height <= 0 || width * PIXEL_RATIO > 16384 || height * PIXEL_RATIO > 16384) {
      throw new Error("数式の画像サイズが保存可能な範囲を超えています。");
    }
    // 画像生成：KaTeXで描いた数式を、透明背景のCanvas画像へ変換する。
    const canvasPromise = global.htmlToImage.toCanvas(node, {
      width, height, pixelRatio: PIXEL_RATIO, fontEmbedCSS,
      backgroundColor: "transparent", skipAutoScale: true,
    });
    // キャンセル後にライブラリの処理が完了した場合もCanvasのメモリを解放する。
    let abandoned = false;
    canvasPromise.then((canvas) => {
      if (abandoned) { canvas.width = 0; canvas.height = 0; }
    }, () => {});
    let canvas;
    try {
      canvas = await waitFor(canvasPromise, signal, "PNG作成がタイムアウトしました。ページを開いた状態で再試行してください。");
      checkAbort(signal);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("このブラウザではPNG画像を作成できません。");
      // 透明度の成分を調べ、何も描画されていないPNGが保存されるのを防ぐ。
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hasInk = false;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) { hasInk = true; break; }
      }
      if (!hasInk) throw new Error("数式が画像に描画されませんでした。ブラウザを更新して再試行してください。");
      // CanvasをPNGへエンコードし、ZIPへ渡せるバイト列へ変換する。
      const blob = await waitFor(new Promise((resolve) => canvas.toBlob(resolve, "image/png")), signal,
        "PNGの保存処理がタイムアウトしました。");
      if (!blob || !blob.size) throw new Error("PNG画像を作成できませんでした。");
      return new Uint8Array(await waitFor(blob.arrayBuffer(), signal, "PNGの読み込みがタイムアウトしました。"));
    } finally {
      abandoned = true;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

  // 入力とライブラリを確認し、data.csvと各問の問題・解答画像をZIPにまとめる。
  async function create(items, csvText, { signal, onProgress = () => {} } = {}) {
    if (!global.katex || !global.htmlToImage?.toCanvas || !global.fflate?.Zip || !global.fflate?.ZipPassThrough) {
      throw new Error("ZIP作成に必要なライブラリを読み込めませんでした。ページを再読み込みしてください。");
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 1000
      || items.some((item, index) => item.id !== String(index + 1).padStart(4, "0")
        || typeof item.questionLatex !== "string" || typeof item.answerLatex !== "string")) {
      throw new Error("ZIPに保存する問題データが正しくありません。");
    }
    checkAbort(signal);
    // 描画用要素を画面外に置く。表示寸法の計測に必要なためDOMには追加する。
    const workspace = document.createElement("div");
    workspace.className = "math-image-workspace";
    workspace.setAttribute("aria-hidden", "true");
    const node = document.createElement("div");
    node.className = "math-image-export";
    workspace.append(node);
    document.body.append(workspace);
    const chunks = [];
    let zipError = null;
    let zipFinished = false;
    // ZIPが出力する断片をBlobとして収集し、エラーと最終断片の到着を記録する。
    const zip = new global.fflate.Zip((error, data, final) => {
      if (error) { zipError = error; return; }
      if (data.length) chunks.push(new Blob([data]));
      if (final) zipFinished = true;
    });
    // 1ファイルのデータをZIPへ追加し、その時点で発生したエラーを呼び出し元へ返す。
    const addFile = (name, bytes) => {
      checkAbort(signal);
      // PNGは圧縮済み。再圧縮せず順に格納し、全画像の展開データを保持しない。
      const file = new global.fflate.ZipPassThrough(name);
      zip.add(file);
      file.push(bytes, true);
      if (zipError) throw zipError;
    };
    try {
      onProgress({ phase: "fonts", completed: 0, total: items.length * 2 });
      // 画像生成の準備：数式に使うフォントを取得し、画像へ埋め込める状態にする。
      const fonts = await prepareFonts(signal);
      const fontCssCache = new Map();
      // CSVをUTF-8のバイト列として先に格納する。
      addFile("data.csv", new TextEncoder().encode(csvText));
      let completed = 0;
      for (const item of items) {
        // 各IDについて問題画像と答えだけの画像を作り、別フォルダへ保存する。
        for (const [name, latex] of [
          [`questions/q${item.id}.png`, item.questionLatex],
          [`answers/a${item.id}.png`, item.answerLatex],
        ]) {
          checkAbort(signal);
          try {
            // PNG作成：この問題または答えの数式を、1枚の透明PNGに変換する。
            const png = await renderPng(node, latex, fonts, fontCssCache, signal);
            // 画像格納：作成したPNGを、対応するquestionsまたはanswersフォルダへ入れる。
            addFile(name, png);
          } catch (error) {
            if (error.name === "AbortError") throw error;
            throw new Error(`${name} の作成に失敗しました。${error.message || "もう一度お試しください。"}`);
          }
          completed += 1;
          onProgress({ phase: "images", completed, total: items.length * 2 });
          // 画像ごとにイベント処理へ制御を返し、進捗表示や中止操作を受け付けられるようにする。
          await waitFor(new Promise((resolve) => setTimeout(resolve, 0)), signal, "画像作成を続行できませんでした。");
        }
      }
      checkAbort(signal);
      onProgress({ phase: "zip", completed, total: items.length * 2 });
      // ZIPの終端を書き込み、最終断片まで受け取ったことを確認してBlobを返す。
      zip.end();
      if (zipError) throw zipError;
      if (!zipFinished) throw new Error("ZIPの作成を完了できませんでした。");
      // ZIPデータの完成：保存用の1つのファイルとして呼び出し元へ返す。
      return new Blob(chunks, { type: "application/zip" });
    } finally {
      // 成功・失敗・中止のいずれでも、ZIP処理と描画用DOMの後片付けを行う。
      zip.terminate();
      chunks.length = 0;
      workspace.remove();
    }
  }

  global.MathZipExporter = Object.freeze({ create });
})(window);
