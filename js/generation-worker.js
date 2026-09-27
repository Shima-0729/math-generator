// 重い問題生成を画面から切り離して実行するWorker。DOMを操作せず、進捗と結果をメッセージで返す。
"use strict";

// 設定・生成器・検証付きのサイト用窓口を、この順序で読み込む。
importScripts("site-config.js", "../algorithm/int_problem_generator.js", "../algorithm/rational_problem_generator.js", "problem-service.js");

// 設定とseedを受け取り、整数→有理数の順に生成して、必要なら全体を並べ替える。
self.onmessage = function (event) {
  const { settings, seed } = event.data;
  try {
    // 両生成器で乱数列を共有する。生成順と乱数を使う順序がseedによる再現結果に関わる。
    const rng = self.MathGenerator.createSeededRandom(seed);
    // 検証→数式生成→表示用オブジェクトへの整形を共通窓口に任せる。
    const problems = self.SiteProblemGenerator.generateWorksheet(settings, rng,
      (completed, total) => self.postMessage({ kind: "progress", completed, total }));
    // 全件の生成が終わってから、完成した問題配列をまとめて返す。
    self.postMessage({ kind: "result", problems });
  } catch (error) {
    // 生成失敗時は例外の説明文を返し、画面側のエラー表示につなぐ。
    self.postMessage({ kind: "error", message: error.message || "問題を生成できませんでした。" });
  }
};
