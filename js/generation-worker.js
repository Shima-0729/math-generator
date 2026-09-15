// 重い問題生成を画面から切り離して実行するWorker。DOMを操作せず、進捗と結果をメッセージで返す。
"use strict";

// 整数・有理数の生成器を、Worker自身と同じディレクトリーから読み込む。
importScripts("generator.js", "rational.js");

// 設定とseedを受け取り、整数→有理数の順に生成して、必要なら全体を並べ替える。
self.onmessage = function (event) {
  const { settings, seed } = event.data;
  try {
    // 両生成器で乱数列を共有する。生成順と乱数を使う順序がseedによる再現結果に関わる。
    const rng = self.MathGenerator.createSeededRandom(seed);
    // 数の種類に応じて整数・有理数の件数を確定する。
    const integerCount = settings.numberType === "integer" ? settings.problemCount
      : settings.numberType === "rational" ? 0 : settings.integerCount;
    const rationalCount = settings.problemCount - integerCount;
    // 整数の結果に種類などの情報を付け、有理数の結果と共通の形式へそろえる。
    // 整数の数式生成：指定件数の式と□の答えを作る。
    const integers = integerCount ? self.MathGenerator.makeProblems(
      settings.termCount, settings.maxInt, integerCount, settings.problemType === "inverse",
      rng, settings.problemType === "calculation",
    ).map((item) => ({ ...item, problem: item.expression, numberType: "integer",
      problemType: item.isInverse ? "reverse" : "calculation" })) : [];
    // 有理数の進捗に完了済みの整数件数を足し、全体の進捗として画面に通知する。
    // 有理数の数式生成：分数や小数を含む式と□の答えを作る。
    const rationals = rationalCount ? self.RationalGenerator.makeProblemsRational(
      settings.termCount, settings.maxDenominator, settings.maxNum, rationalCount, settings.problemType, rng,
      (count) => self.postMessage({ kind: "progress", completed: integerCount + count, total: settings.problemCount }),
    ) : [];
    const problems = integers.concat(rationals);
    // 混合モードは配列の後ろから交換先を選び、整数だけが先頭に偏らないよう並べ替える。
    if (settings.numberType === "mixed") {
      for (let i = problems.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [problems[i], problems[j]] = [problems[j], problems[i]];
      }
    }
    // 全件の生成が終わってから、完成した問題配列をまとめて返す。
    self.postMessage({ kind: "result", problems });
  } catch (error) {
    // 生成失敗時は例外の説明文を返し、画面側のエラー表示につなぐ。
    self.postMessage({ kind: "error", message: error.message || "問題を生成できませんでした。" });
  }
};
