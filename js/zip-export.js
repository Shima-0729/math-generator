(function (global) {
  "use strict";

  const PIXEL_RATIO = 2;
  const IMAGE_TIMEOUT_MS = 30000;

  function abortError() {
    return new DOMException("ZIP作成をキャンセルしました。", "AbortError");
  }

  function checkAbort(signal) {
    if (signal?.aborted) throw abortError();
  }

  // 画像デコードが完了しない場合も、キャンセル・タイムアウトでUIを復帰させる。
  function waitFor(promise, signal, message, timeout = IMAGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      };
      const onAbort = () => finish(reject, abortError());
      const timer = setTimeout(() => finish(reject, new Error(message)), timeout);
      signal?.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(promise).then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error),
      );
      if (signal?.aborted) onAbort();
    });
  }

  function asDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("画像用フォントを読み込めませんでした。"));
      reader.onabort = () => reject(abortError());
      reader.readAsDataURL(blob);
    });
  }

  function familyName(value) {
    return value.trim().replace(/["']/g, "");
  }

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
      const loaded = await waitFor(document.fonts.load(`${style} ${weight} 24px "${family}"`), signal,
        "フォントの読み込みがタイムアウトしました。");
      if (!loaded.length || loaded.some((font) => font.status !== "loaded")) {
        throw new Error("数式用フォントを読み込めませんでした。");
      }
    }
    return fonts;
  }

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
    const key = [...families].sort().join(",");
    if (!key) throw new Error("数式のフォントを確認できませんでした。");
    if (!cache.has(key)) cache.set(key, [...families].sort().map((family) => fonts.get(family)).join("\n"));
    return cache.get(key);
  }

  async function renderPng(node, latex, fonts, fontCssCache, signal) {
    checkAbort(signal);
    global.katex.render(latex.replace(/\\frac(?=\{)/g, "\\dfrac"), node, {
      throwOnError: true, trust: false, strict: "error", output: "html", displayMode: false,
    });
    const fontEmbedCSS = fontsForNode(node, fonts, fontCssCache);
    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (width <= 0 || height <= 0 || width * PIXEL_RATIO > 16384 || height * PIXEL_RATIO > 16384) {
      throw new Error("数式の画像サイズが保存可能な範囲を超えています。");
    }
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
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hasInk = false;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) { hasInk = true; break; }
      }
      if (!hasInk) throw new Error("数式が画像に描画されませんでした。ブラウザを更新して再試行してください。");
      const blob = await waitFor(new Promise((resolve) => canvas.toBlob(resolve, "image/png")), signal,
        "PNGの保存処理がタイムアウトしました。");
      if (!blob || !blob.size) throw new Error("PNG画像を作成できませんでした。");
      return new Uint8Array(await waitFor(blob.arrayBuffer(), signal, "PNGの読み込みがタイムアウトしました。"));
    } finally {
      abandoned = true;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

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
    const zip = new global.fflate.Zip((error, data, final) => {
      if (error) { zipError = error; return; }
      if (data.length) chunks.push(new Blob([data]));
      if (final) zipFinished = true;
    });
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
      const fonts = await prepareFonts(signal);
      const fontCssCache = new Map();
      addFile("data.csv", new TextEncoder().encode(csvText));
      let completed = 0;
      for (const item of items) {
        for (const [name, latex] of [
          [`questions/q${item.id}.png`, item.questionLatex],
          [`answers/a${item.id}.png`, item.answerLatex],
        ]) {
          checkAbort(signal);
          try {
            const png = await renderPng(node, latex, fonts, fontCssCache, signal);
            addFile(name, png);
          } catch (error) {
            if (error.name === "AbortError") throw error;
            throw new Error(`${name} の作成に失敗しました。${error.message || "もう一度お試しください。"}`);
          }
          completed += 1;
          onProgress({ phase: "images", completed, total: items.length * 2 });
          await waitFor(new Promise((resolve) => setTimeout(resolve, 0)), signal, "画像作成を続行できませんでした。");
        }
      }
      checkAbort(signal);
      onProgress({ phase: "zip", completed, total: items.length * 2 });
      zip.end();
      if (zipError) throw zipError;
      if (!zipFinished) throw new Error("ZIPの作成を完了できませんでした。");
      return new Blob(chunks, { type: "application/zip" });
    } finally {
      zip.terminate();
      chunks.length = 0;
      workspace.remove();
    }
  }

  global.MathZipExporter = Object.freeze({ create });
})(window);
