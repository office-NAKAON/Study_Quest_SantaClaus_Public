function loginStudent(studentId, password) {
  try {
    const id = requireText_(studentId, '生徒ID');
    const inputPassword = requireText_(password, 'パスワード');
    const validation = validateQuestions_();
    if (!validation.valid) throw new Error('問題の準備が完了していません。先生に連絡してください。');

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let student;
    let token;
    try {
      removeExpiredSessions_();
      student = getStudentById_(id);
      if (!student || String(student['パスワード']) !== inputPassword) {
        throw new Error('生徒IDまたはパスワードが正しくありません。');
      }
      const sheet = getSheet_(CONFIG.SHEETS.SESSIONS);
      const oldSessions = getDataObjects_(sheet).filter((session) => String(session['生徒ID']) === id);
      oldSessions.forEach((session) => {
        const oldToken = String(session['セッションID']);
        CacheService.getScriptCache().put('replaced-session-' + oldToken, '1', CONFIG.SESSION_MINUTES * 60);
        forgetStudentSession_(oldToken);
      });
      oldSessions.map((session) => session._row).sort((a, b) => b - a).forEach((row) => sheet.deleteRow(row));
      token = createToken_();
      const now = new Date();
      sheet.appendRow([id, token, now, now]);
      rememberStudentSession_(token, id);
    } finally { lock.releaseLock(); }
    return { success: true, token, ...buildStudentHome_(student) };
  } catch (error) { return publicError_(error); }
}

function resumeStudentSession(token) {
  try {
    const session = requireStudentSession_(token);
    const student = getStudentById_(session.studentId);
    if (!student) throw new Error('生徒情報が見つかりません。');
    return { success: true, ...buildStudentHome_(student) };
  } catch (error) { return publicError_(error); }
}

function buildStudentHome_(student) {
  const id = String(student['生徒ID']);
  return {
    student: {
      id,
      name: String(student['氏名']),
      className: String(student['クラス']),
      number: String(student['出席番号']),
      nickname: String(student['ニックネーム'] || '')
    },
    progress: getProgress_(id),
    ranking: getRanking_(id)
  };
}

function getStudentHome(token) {
  try {
    const session = requireStudentSession_(token);
    const student = getStudentById_(session.studentId);
    if (!student) throw new Error('生徒情報が見つかりません。');
    return { success: true, ...buildStudentHome_(student) };
  } catch (error) { return publicError_(error); }
}

function getStageQuestion(token, stageNumber, excludeQuestionId, reviewCorrectIds, reviewMode) {
  try {
    const session = requireStudentSession_(token);
    const stage = Number(stageNumber);
    const progress = getProgress_(session.studentId);
    const reviewing = Boolean(reviewMode);
    if (!Number.isInteger(stage) || stage < 1 || stage > CONFIG.STAGE_COUNT) throw new Error('ステージが正しくありません。');
    if (reviewing && !progress.stageStates[stage - 1].completed) throw new Error('クリア済みステージだけ復習できます。');
    if (!reviewing && stage !== progress.currentStage) throw new Error('現在挑戦できるステージではありません。');

    const questions = getPublishedStageQuestions_(stage);
    if (questions.length !== CONFIG.QUESTIONS_PER_STAGE) throw new Error('このステージの問題は準備中です。');
    let completedIds;
    if (reviewing) {
      completedIds = new Set(Array.isArray(reviewCorrectIds) ? reviewCorrectIds.map(String) : []);
    } else {
      completedIds = new Set(getStudentRecords_(session.studentId).map((record) => String(record['問題ID'])));
    }
    let candidates = questions.filter((question) => !completedIds.has(question.id));
    if (!candidates.length) {
      return { success: true, stageFinished: true, review: reviewing, progress };
    }
    const alternatives = candidates.filter((question) => question.id !== String(excludeQuestionId || ''));
    if (alternatives.length) candidates = alternatives;
    const question = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      success: true,
      stageFinished: false,
      review: reviewing,
      question: {
        id: question.id,
        number: question.number,
        stage: question.stage,
        text: question.text,
        type: question.type || '記述',
        choices: question.type === '4択' ? question.choices : (question.type === '〇×' ? ['〇', '×'] : [])
      },
      stageAnswered: CONFIG.QUESTIONS_PER_STAGE - candidates.length,
      progress
    };
  } catch (error) { return publicError_(error); }
}

function submitAnswer(token, questionId, answer, reviewMode) {
  try {
    const session = requireStudentSession_(token, { touch: false });
    const id = requireText_(questionId, '問題');
    const input = requireText_(answer, '答え').trim();
    const validation = validateQuestions_();
    if (!validation.valid) throw new Error('問題の準備が完了していません。先生に連絡してください。');
    const question = validation.questions.find((item) => item.id === id && item.published);
    if (!question) throw new Error('問題が見つかりません。');
    const type = question.type || '記述';
    const normalizedInput = normalizeAnswerForType_(type, input);
    const accepted = [question.answer].concat(question.alternatives.split(/[\n\r|｜]+/))
      .map((value) => normalizeAnswerForType_(type, value)).filter(Boolean);
    const correct = accepted.some((value) => value === normalizedInput);
    const reviewing = Boolean(reviewMode);
    if (!correct || reviewing) {
      return {
        success: true,
        correct,
        questionId: id,
        correctAnswer: question.answer,
        explanation: question.explanation,
        review: reviewing,
        progress: readRememberedProgress_(session.studentId) || getProgress_(session.studentId),
        stageCleared: false,
        unlockedItem: '',
        completion: null
      };
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    let progress;
    let stageCleared;
    try {
      const records = getStudentRecords_(session.studentId);
      const before = progressFromRecords_(records, validation);
      if (question.stage !== before.currentStage) throw new Error('現在のステージと問題が一致しません。画面を更新してください。');
      const exists = records.some((record) => String(record['問題ID']) === id);
      if (!exists) {
        const now = new Date();
        const sheet = getSheet_(CONFIG.SHEETS.RECORDS);
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, 5).setValues([[session.studentId, id, question.stage, question.number, now]]);
        records.push({ '生徒ID': session.studentId, '問題ID': id, 'ステージ': question.stage, '問題番号': question.number, '正解日時': now });
      }
      progress = progressFromRecords_(records, validation);
      rememberProgress_(session.studentId, progress);
      stageCleared = progress.completedStages > before.completedStages;
    } finally { lock.releaseLock(); }
    return {
      success: true,
      correct,
      questionId: id,
      correctAnswer: question.answer,
      explanation: question.explanation,
      review: false,
      progress,
      stageCleared,
      unlockedItem: stageCleared ? CONFIG.STAGE_ITEMS[question.stage - 1] : '',
      completion: progress.completed ? getCompletionDetails_(session.studentId) : null
    };
  } catch (error) { return publicError_(error); }
}

function saveStudentNickname(token, nickname) {
  try {
    const session = requireStudentSession_(token);
    const value = requireText_(nickname, 'ニックネーム');
    if (value.length > 20) throw new Error('ニックネームは20文字以内にしてください。');
    if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('ニックネームに使用できない文字が含まれています。');
    const student = getStudentById_(session.studentId);
    if (!student) throw new Error('生徒情報が見つかりません。');
    getSheet_(CONFIG.SHEETS.STUDENTS).getRange(student._row, 7).setValue(value);
    return { success: true, nickname: value, ranking: getRanking_(session.studentId) };
  } catch (error) { return publicError_(error); }
}

function logoutStudent(token) {
  try {
    forgetStudentSession_(token);
    removeSessionByToken_(token);
    return { success: true };
  } catch (error) { return publicError_(error); }
}

function sessionCacheKey_(token) {
  return 'santa-session-' + token;
}

function rememberStudentSession_(token, studentId) {
  CacheService.getScriptCache().put(sessionCacheKey_(token), String(studentId), CONFIG.SESSION_MINUTES * 60);
}

function forgetStudentSession_(token) {
  CacheService.getScriptCache().remove(sessionCacheKey_(token));
}

function requireStudentSession_(token, options) {
  const sessionToken = requireText_(token, 'セッション');
  const cache = CacheService.getScriptCache();
  if (cache.get('replaced-session-' + sessionToken)) throw new Error('別の端末でログインされたため終了しました。');
  const cachedStudentId = cache.get(sessionCacheKey_(sessionToken));
  if (cachedStudentId) {
    cache.put(sessionCacheKey_(sessionToken), cachedStudentId, CONFIG.SESSION_MINUTES * 60);
    const touch = !options || options.touch !== false;
    if (touch && !cache.get('santa-session-touch-' + sessionToken)) {
      cache.put('santa-session-touch-' + sessionToken, '1', 300);
      touchSessionTimestamp_(sessionToken);
    }
    return { studentId: String(cachedStudentId), token: sessionToken };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(CONFIG.SHEETS.SESSIONS);
    const sessions = getDataObjects_(sheet);
    const cutoff = Date.now() - CONFIG.SESSION_MINUTES * 60 * 1000;
    const expired = sessions.filter((item) => new Date(item['最終操作日時']).getTime() < cutoff);
    expired.map((item) => item._row).sort((a, b) => b - a).forEach((row) => sheet.deleteRow(row));
    const session = sessions.find((item) => String(item['セッションID']) === sessionToken && new Date(item['最終操作日時']).getTime() >= cutoff);
    if (!session) {
      if (cache.get('replaced-session-' + sessionToken)) throw new Error('別の端末でログインされたため終了しました。');
      throw new Error('ログインの有効期限が切れました。再度ログインしてください。');
    }
    sheet.getRange(session._row, 4).setValue(new Date());
    rememberStudentSession_(sessionToken, session['生徒ID']);
    cache.put('santa-session-touch-' + sessionToken, '1', 300);
    return { studentId: String(session['生徒ID']), token: sessionToken };
  } finally { lock.releaseLock(); }
}

function touchSessionTimestamp_(token) {
  try {
    const sheet = getSheet_(CONFIG.SHEETS.SESSIONS);
    const session = getDataObjects_(sheet).find((item) => String(item['セッションID']) === String(token));
    if (session) sheet.getRange(session._row, 4).setValue(new Date());
  } catch (error) { console.warn(error); }
}

function removeExpiredSessions_() {
  const sheet = getSheet_(CONFIG.SHEETS.SESSIONS);
  const cutoff = Date.now() - CONFIG.SESSION_MINUTES * 60 * 1000;
  getDataObjects_(sheet).filter((session) => new Date(session['最終操作日時']).getTime() < cutoff)
    .map((session) => session._row).sort((a, b) => b - a).forEach((row) => sheet.deleteRow(row));
}

function removeSessionByToken_(token) {
  const sheet = getSheet_(CONFIG.SHEETS.SESSIONS);
  const session = getDataObjects_(sheet).find((item) => String(item['セッションID']) === String(token));
  if (session) sheet.deleteRow(session._row);
}

function releaseStudentSession_(studentId) {
  const sheet = getSheet_(CONFIG.SHEETS.SESSIONS);
  const sessions = getDataObjects_(sheet).filter((session) => String(session['生徒ID']) === String(studentId));
  sessions.forEach((session) => {
    const oldToken = String(session['セッションID']);
    CacheService.getScriptCache().put('replaced-session-' + oldToken, '1', CONFIG.SESSION_MINUTES * 60);
    forgetStudentSession_(oldToken);
  });
  sessions.map((session) => session._row).sort((a, b) => b - a).forEach((row) => sheet.deleteRow(row));
}
