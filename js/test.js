// テスト画面の制御。問題候補の生成、15問の出題、採点と所要時間の集計を担当する。
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

  // 候補全体、今回の出題、各問の記録と回答受付状態をまとめて保持する。
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

  // 設定画面にエラーメッセージを表示する。
  function showSettingsError(message) {
    settingsError.textContent = message;
    settingsError.hidden = false;
  }

  // 前回のエラーを消し、表示領域を隠す。
  function clearSettingsError() {
    settingsError.textContent = "";
    settingsError.hidden = true;
  }

  // seedの入力例に使う日付をyyyyMMdd形式にする。
  function formatSeedDate(date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  // 準備中の開始ボタンを無効にし、処理中の表示へ切り替える。
  function setStartBusy(isBusy) {
    startButton.disabled = isBusy;
    startButton.textContent = isBusy ? "問題を準備中…" : "テストを始める";
  }

  // フォームの値を数値とモード指定へ変換する。数値範囲は生成処理で検証する。
  function readSettings() {
    const selectedType = settingsForm.querySelector('input[name="problem-type"]:checked');

    if (!selectedType) {
      throw new window.MathGenerator.GeneratorError("問題タイプを選択してください。");
    }

    return {
      termCount: Number(termCountInput.value),
      maxInt: Number(maxIntInput.value),
      inverseOnly: selectedType.value === "inverse",
      calculationOnly: selectedType.value === "calculation",
    };
  }

  // 元の問題配列を変更せず、コピーを乱数で並べ替える。
  function shuffle(items, rng) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const selectedIndex = Math.floor(rng() * (index + 1));
      [shuffled[index], shuffled[selectedIndex]] = [shuffled[selectedIndex], shuffled[index]];
    }
    return shuffled;
  }

  // 式の重複を除いた候補から、今回出題する15問を選ぶ。
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

    // 入力seedは候補生成に使う。15問の抽出には現在時刻由来の別seedを使う。
    const selectionSeed = `${Date.now()}-${performance.now()}`;
    const selectionRng = window.MathGenerator.createSeededRandom(selectionSeed);
    return shuffle(uniquePool, selectionRng).slice(0, TEST_SIZE);
  }

  // 回答欄と送信ボタンの有効・無効をまとめて切り替える。
  function setAnswerControlsEnabled(enabled) {
    answerInput.disabled = !enabled;
    answerButton.disabled = !enabled;
  }

  // 現在の問題を表示し、回答回数と計測開始時刻をリセットする。
  function showQuestion() {
    const question = state.questions[state.currentIndex];
    state.attempts = 0;
    state.acceptingAnswer = true;
    questionProgress.textContent = `問題 ${state.currentIndex + 1} / ${TEST_SIZE}`;
    progressBar.style.width = `${((state.currentIndex + 1) / TEST_SIZE) * 100}%`;
    // 問題表示：現在の問題の数式を画面へ反映する。
    questionExpression.textContent = question.expression;
    answerInput.value = "";
    answerFeedback.textContent = "";
    answerFeedback.className = "answer-feedback";
    setAnswerControlsEnabled(true);
    state.questionStartedAt = performance.now();
    answerInput.focus();
  }

  // 候補から問題を選び直し、記録を初期化して新しいテストを開始する。
  function beginRound() {
    // 出題の準備：候補から重複のない15問を選び、今回のテスト問題にする。
    state.questions = selectQuestions();
    state.results = [];
    state.currentIndex = 0;
    settingsSection.hidden = true;
    resultsSection.hidden = true;
    questionSection.hidden = false;
    testSeedOutput.textContent = state.seed;
    // テスト開始：1問目を表示し、回答の受付と時間の計測を始める。
    showQuestion();
    questionSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 設定に従って問題候補を生成し、最初のテストを開始する。
  async function handleStart(event) {
    event.preventDefault();
    clearSettingsError();
    setStartBusy(true);

    // ボタンの準備中表示を描画する機会を与えてから、問題生成へ進む。
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      const settings = readSettings();
      const requestedSeed = seedInput.value.trim();
      state.seed = requestedSeed || window.MathGenerator.createRandomSeed();
      const poolRng = window.MathGenerator.createSeededRandom(state.seed);
      // 数式生成：指定条件とseedで、テストの候補となる1000問を作る。
      state.pool = window.MathGenerator.makeProblems(
        settings.termCount,
        settings.maxInt,
        POOL_SIZE,
        settings.inverseOnly,
        poolRng,
        settings.calculationOnly,
      );
      // テスト開始：生成した候補から15問を選び、出題画面へ切り替える。
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

  // 秒数を小数第1位までの表示へ整える。
  function formatSeconds(seconds) {
    return `${seconds.toFixed(1)}秒`;
  }

  // 1問の式・答え・所要時間・回答回数を結果表に追加する。
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

  // 全問の記録から時間や回答回数を集計し、結果画面へ切り替える。
  function showResults() {
    const elapsedTimes = state.results.map((result) => result.elapsedTime);
    const totalTime = elapsedTimes.reduce((sum, time) => sum + time, 0);
    const shortestTime = Math.min(...elapsedTimes);
    const longestTime = Math.max(...elapsedTimes);
    const totalAttempts = state.results.reduce((sum, result) => sum + result.attempts, 0);
    // 最長時間の問題を選ぶ。同じ時間の場合は先に記録された問題を残す。
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

    // 前回の結果行を消して、今回の記録だけで表を組み直す。
    resultListBody.replaceChildren();
    state.results.forEach(appendResultRow);
    questionSection.hidden = true;
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 次の問題へ進み、全15問が終了した場合は結果を表示する。
  function moveToNextQuestion() {
    state.currentIndex += 1;
    if (state.currentIndex >= TEST_SIZE) {
      // 結果表示：全問終了後の時間・回答回数と各問の記録を画面に表示する。
      showResults();
      return;
    }
    // 次問の表示：次の数式へ切り替え、その問題の時間計測を始める。
    showQuestion();
  }

  // 入力を検証して採点し、正解時に記録を保存して次問を予約する。
  function handleAnswer(event) {
    event.preventDefault();
    // 正解後の待機中などに二重送信されても、同じ結果を重複記録しない。
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

    // 整数として有効な回答だけを数える。不正解でも計測は止めず再回答を受け付ける。
    state.attempts += 1;
    const question = state.questions[state.currentIndex];
    // 採点：入力した整数と正解を比較し、不正解なら同じ問題で再回答を受け付ける。
    if (submittedAnswer !== question.answer) {
      answerFeedback.textContent = "不正解です。もう一度入力してください。";
      answerFeedback.className = "answer-feedback is-incorrect";
      answerInput.select();
      return;
    }

    // 問題表示から正解までの時間を秒に直す。不正解後の再回答時間も含む。
    const elapsedTime = (performance.now() - state.questionStartedAt) / 1000;
    // 結果の記録：正解した問題の答え、所要時間、回答回数を保存する。
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
    // 正解表示を短時間見せてから次問へ進む。待機時間は回答時間に含めない。
    window.setTimeout(moveToNextQuestion, CORRECT_DELAY_MS);
  }

  // 同じ問題候補を使って15問を選び直し、再挑戦を始める。
  function handleRetry() {
    try {
      // 再挑戦：同じ候補から15問を選び直し、新しいテストを開始する。
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

  // 回答受付を止め、設定画面へ戻る。
  function handleBack() {
    state.acceptingAnswer = false;
    questionSection.hidden = true;
    resultsSection.hidden = true;
    settingsSection.hidden = false;
    clearSettingsError();
    settingsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  seedInput.placeholder = `例：${formatSeedDate(new Date())}`;

  // フォーム送信と結果画面の操作を、それぞれの処理に接続する。
  settingsForm.addEventListener("submit", handleStart);
  answerForm.addEventListener("submit", handleAnswer);
  retryButton.addEventListener("click", handleRetry);
  backButton.addEventListener("click", handleBack);
})();
