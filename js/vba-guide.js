// VBA利用例ページで、配布用コードの表示・コピーを安全に行う。
(function () {
  "use strict";

  const codeElement = document.querySelector("#vba-code");
  const copyButton = document.querySelector("#copy-vba-button");
  const statusElement = document.querySelector("#copy-vba-status");
  let codePromise = null;

  // 同じサイトのテキストファイルを読み込み、表示とコピーで同じ内容を再利用する。
  function loadVbaCode() {
    if (!codePromise) {
      codePromise = fetch("vba_code.txt", { credentials: "same-origin" })
        .then((response) => {
          if (!response.ok) throw new Error(`VBAコードの取得に失敗しました（${response.status}）。`);
          return response.text();
        })
        .then((text) => {
          if (!text.trim()) throw new Error("VBAコードが空です。");
          return text;
        });
    }
    return codePromise;
  }

  // Clipboard APIが使えない環境では、一時的な入力欄を選択してコピーする。
  function copyWithFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.className = "clipboard-helper";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("クリップボードへコピーできませんでした。");
  }

  // HTTPSなどの安全な環境ではClipboard APIを使い、それ以外は互換処理へ切り替える。
  async function copyVbaCode() {
    copyButton.disabled = true;
    statusElement.textContent = "VBAコードをコピーしています…";
    try {
      const text = await loadVbaCode();
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        copyWithFallback(text);
      }
      statusElement.textContent = "VBAコードをコピーしました。Excelの標準モジュールへ貼り付けてください。";
    } catch (error) {
      console.error("VBA code copy failed:", error);
      statusElement.textContent = "コピーできませんでした。テキストをダウンロードするか、表示したコードを選択してコピーしてください。";
    } finally {
      copyButton.disabled = false;
    }
  }

  // 読み込んだコードはHTMLとして解釈せず、textContentでそのまま画面へ表示する。
  loadVbaCode()
    .then((text) => {
      codeElement.textContent = text;
      copyButton.disabled = false;
      statusElement.textContent = "コードを確認してからコピーしてください。";
    })
    .catch((error) => {
      console.error("VBA code loading failed:", error);
      codeElement.textContent = "VBAコードを読み込めませんでした。";
      statusElement.textContent = "コードを読み込めませんでした。テキストのダウンロードを利用してください。";
    });

  copyButton.addEventListener("click", copyVbaCode);
})();
