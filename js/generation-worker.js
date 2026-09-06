"use strict";

importScripts("generator.js", "rational.js");

self.onmessage = function (event) {
  const { settings, seed } = event.data;
  try {
    const rng = self.MathGenerator.createSeededRandom(seed);
    const integerCount = settings.numberType === "integer" ? settings.problemCount
      : settings.numberType === "rational" ? 0 : settings.integerCount;
    const rationalCount = settings.problemCount - integerCount;
    const integers = integerCount ? self.MathGenerator.makeProblems(
      settings.termCount, settings.maxInt, integerCount, settings.problemType === "inverse",
      rng, settings.problemType === "calculation",
    ).map((item) => ({ ...item, problem: item.expression, numberType: "integer",
      problemType: item.isInverse ? "reverse" : "calculation" })) : [];
    const rationals = rationalCount ? self.RationalGenerator.makeProblemsRational(
      settings.termCount, settings.maxDenominator, settings.maxNum, rationalCount, settings.problemType, rng,
      (count) => self.postMessage({ kind: "progress", completed: integerCount + count, total: settings.problemCount }),
    ) : [];
    const problems = integers.concat(rationals);
    if (settings.numberType === "mixed") {
      for (let i = problems.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [problems[i], problems[j]] = [problems[j], problems[i]];
      }
    }
    self.postMessage({ kind: "result", problems });
  } catch (error) {
    self.postMessage({ kind: "error", message: error.message || "問題を生成できませんでした。" });
  }
};
