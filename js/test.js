(function () {
  "use strict";

  const POOL_SIZE = 1000;
  const TEST_SIZE = 15;
  const CORRECT_DELAY_MS = 700;
  const settingsSection = document.querySelector("#test-settings");
  const settingsForm = document.querySelector("#test-settings-form");
  const startButton = settingsForm.querySelector('button[type="submit"]');
  const termCountInput = document.querySelector("#term-count");
  const maxIntInput = document.querySelector("#max-int");
  const seedInput = document.querySelector("#seed");
  const settingsError = document.querySelector("#settings-error");
  const questionSection = document.querySelector("#test-question");
  const questionProgress = document.querySelector("#question-progress");
  const progressBar = document.querySelector("#progress-bar");
  const testSeedOutput = document.querySelector("#test-seed-output");
  const questionExpression = document.querySelector("#question-expression");
  const answerForm = document.querySelector("#answer-form");
  const answerInput = document.querySelector("#answer-input");
  const answerButton = document.querySelector("#answer-button");
  const answerFeedback = document.querySelector("#answer-feedback");
  const resultsSection = document.querySelector("#test-results");
  const resultListBody = document.querySelector("#result-list-body");
  const retryButton = document.querySelector("#retry-button");
  const backButton = document.querySelector("#back-button");

  const state = {
    pool: [],
    questions: [],
    results: [],
    currentIndex: 0,
    attempts: 0,
    questionStartedAt: 0,
    seed: null,
    acceptingAnswer: false,
  };

  function showSettingsError(message) {
    settingsError.textContent = message;
    settingsError.hidden = false;
  }

  function clearSettingsError() {
    settingsError.textContent = "";
    settingsError.hidden = true;
  }

  function setStartBusy(isBusy) {
    startButton.disabled = isBusy;
    startButton.textContent = isBusy ? "問題を準備中…" : "テストを始める";
  }

  function readSettings() {
    const selectedType = settingsForm.querySelector('input[name="problem-type"]:checked');

    if (!selectedType) {
      throw new window.MathGenerator.GeneratorError("問題タイプを選択してください。");
    }

    return {
      termCount: Number(termCountInput.value),
      maxInt: Number(maxIntInput.value),
      inverseOnly: selectedType.value === "inverse",
    };
  }

  function shuffle(items, rng) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const selectedIndex = Math.floor(rng() * (index + 1));
      [shuffled[index], shuffled[selectedIndex]] = [shuffled[selectedIndex], shuffled[index]];
    }
    return shuffled;
  }

  function selectQuestions() {
    const expressions = new Set();
    const uniquePool = state.pool.filter((problem) => {
      if (expressions.has(problem.expression)) {
        return false;
      }
      expressions.add(problem.expression);
      return true;
    });

    if (uniquePool.length < TEST_SIZE) {
      throw new window.MathGenerator.GeneratorError(
        "異なる問題を15問用意できませんでした。条件またはseedを変更してください。",
      );
    }

    const selectionSeed = `${Date.now()}-${performance.now()}`;
    const selectionRng = window.MathGenerator.createSeededRandom(selectionSeed);
    return shuffle(uniquePool, selectionRng).slice(0, TEST_SIZE);
  }

  function setAnswerControlsEnabled(enabled) {
    answerInput.disabled = !enabled;
    answerButton.disabled = !enabled;
  }

  function showQuestion() {
    const question = state.questions[state.currentIndex];
    state.attempts = 0;
    state.acceptingAnswer = true;
    questionProgress.textContent = `問題 ${state.currentIndex + 1} / ${TEST_SIZE}`;
    progressBar.style.width = `${((state.currentIndex + 1) / TEST_SIZE) * 100}%`;
    questionExpression.textContent = question.expression;
    answerInput.value = "";
    answerFeedback.textContent = "";
    answerFeedback.className = "answer-feedback";
    setAnswerControlsEnabled(true);
    state.questionStartedAt = performance.now();
    answerInput.focus();
  }

  function beginRound() {
    state.questions = selectQuestions();
    state.results = [];
    state.currentIndex = 0;
    settingsSection.hidden = true;
    resultsSection.hidden = true;
    questionSection.hidden = false;
    testSeedOutput.textContent = state.seed;
    showQuestion();
    questionSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleStart(event) {
    event.preventDefault();
    clearSettingsError();
    setStartBusy(true);

    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const settings = readSettings();
      const requestedSeed = seedInput.value.trim();
      state.seed = requestedSeed || window.MathGenerator.createRandomSeed();
      const poolRng = window.MathGenerator.createSeededRandom(state.seed);
      state.pool = window.MathGenerator.makeProblems(
        settings.termCount,
        settings.maxInt,
        POOL_SIZE,
        settings.inverseOnly,
        poolRng,
      );
      beginRound();
    } catch (error) {
      console.error("Test preparation failed:", error);
      showSettingsError(
        error instanceof window.MathGenerator.GeneratorError
          ? error.message
          : "テストを準備できませんでした。設定条件を確認してください。",
      );
    } finally {
      setStartBusy(false);
    }
  }

  function formatSeconds(seconds) {
    return `${seconds.toFixed(1)}秒`;
  }

  function appendResultRow(result, index) {
    const row = document.createElement("tr");
    const questionCell = document.createElement("td");
    const answerCell = document.createElement("td");
    const timeCell = document.createElement("td");
    const attemptsCell = document.createElement("td");

    questionCell.textContent = `${index + 1}. ${result.question}`;
    answerCell.textContent = String(result.answer);
    timeCell.textContent = formatSeconds(result.elapsedTime);
    attemptsCell.textContent = `${result.attempts}回`;
    row.append(questionCell, answerCell, timeCell, attemptsCell);
    resultListBody.append(row);
  }

  function showResults() {
    const elapsedTimes = state.results.map((result) => result.elapsedTime);
    const totalTime = elapsedTimes.reduce((sum, time) => sum + time, 0);
    const shortestTime = Math.min(...elapsedTimes);
    const longestTime = Math.max(...elapsedTimes);
    const totalAttempts = state.results.reduce((sum, result) => sum + result.attempts, 0);
    const slowestResult = state.results.reduce((slowest, result) =>
      result.elapsedTime > slowest.elapsedTime ? result : slowest,
    );

    document.querySelector("#total-time").textContent = formatSeconds(totalTime);
    document.querySelector("#average-time").textContent = formatSeconds(totalTime / TEST_SIZE);
    document.querySelector("#shortest-time").textContent = formatSeconds(shortestTime);
    document.querySelector("#longest-time").textContent = formatSeconds(longestTime);
    document.querySelector("#total-attempts").textContent = `${totalAttempts}回`;
    document.querySelector("#slowest-expression").textContent = slowestResult.question;
    document.querySelector("#slowest-answer").textContent = `（答え：${slowestResult.answer}）`;
    document.querySelector("#slowest-detail").textContent =
      `解答時間：${formatSeconds(slowestResult.elapsedTime)}／回答回数：${slowestResult.attempts}回`;

    resultListBody.replaceChildren();
    state.results.forEach(appendResultRow);
    questionSection.hidden = true;
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function moveToNextQuestion() {
    state.currentIndex += 1;
    if (state.currentIndex >= TEST_SIZE) {
      showResults();
      return;
    }
    showQuestion();
  }

  function handleAnswer(event) {
    event.preventDefault();
    if (!state.acceptingAnswer) {
      return;
    }

    const rawAnswer = answerInput.value.trim();
    const submittedAnswer = Number(rawAnswer);
    if (rawAnswer === "" || !Number.isInteger(submittedAnswer)) {
      answerFeedback.textContent = "整数を入力してください。";
      answerFeedback.className = "answer-feedback is-incorrect";
      answerInput.focus();
      return;
    }

    state.attempts += 1;
    const question = state.questions[state.currentIndex];
    if (submittedAnswer !== question.answer) {
      answerFeedback.textContent = "不正解です。もう一度入力してください。";
      answerFeedback.className = "answer-feedback is-incorrect";
      answerInput.select();
      return;
    }

    const elapsedTime = (performance.now() - state.questionStartedAt) / 1000;
    state.results.push({
      question: question.expression,
      answer: question.answer,
      elapsedTime,
      attempts: state.attempts,
    });
    state.acceptingAnswer = false;
    setAnswerControlsEnabled(false);
    answerFeedback.textContent = "正解！";
    answerFeedback.className = "answer-feedback is-correct";
    window.setTimeout(moveToNextQuestion, CORRECT_DELAY_MS);
  }

  function handleRetry() {
    try {
      beginRound();
    } catch (error) {
      console.error("Test restart failed:", error);
      resultsSection.hidden = true;
      settingsSection.hidden = false;
      showSettingsError(
        error instanceof window.MathGenerator.GeneratorError
          ? error.message
          : "新しい問題を準備できませんでした。もう一度お試しください。",
      );
    }
  }

  function handleBack() {
    state.acceptingAnswer = false;
    questionSection.hidden = true;
    resultsSection.hidden = true;
    settingsSection.hidden = false;
    clearSettingsError();
    settingsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  settingsForm.addEventListener("submit", handleStart);
  answerForm.addEventListener("submit", handleAnswer);
  retryButton.addEventListener("click", handleRetry);
  backButton.addEventListener("click", handleBack);
})();
