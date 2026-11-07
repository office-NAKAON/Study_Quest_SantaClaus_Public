function loginTeacher(password) {
  try {
    if (requireText_(password, '教師用パスワード') !== getSetting_(CONFIG.TEACHER_PASSWORD_KEY)) {
      throw new Error('教師用パスワードが正しくありません。');
    }
    const token = createToken_();
    CacheService.getScriptCache().put(CONFIG.TEACHER_CACHE_PREFIX + token, 'valid', CONFIG.SESSION_MINUTES * 60);
    return { success: true, token };
  } catch (error) { return publicError_(error); }
}

function logoutTeacher(token) {
  CacheService.getScriptCache().remove(CONFIG.TEACHER_CACHE_PREFIX + String(token));
  return { success: true };
}

function requireTeacherSession_(token) {
  const sessionToken = requireText_(token, '教師セッション');
  const cache = CacheService.getScriptCache();
  const key = CONFIG.TEACHER_CACHE_PREFIX + sessionToken;
  if (cache.get(key) !== 'valid') throw new Error('教師ログインの有効期限が切れました。再度ログインしてください。');
  cache.put(key, 'valid', CONFIG.SESSION_MINUTES * 60);
}

function getTeacherDashboard(token) {
  try {
    requireTeacherSession_(token);
    removeExpiredSessions_();
    const validation = validateQuestions_();
    const activeIds = new Set(getDataObjects_(getSheet_(CONFIG.SHEETS.SESSIONS)).map((row) => String(row['生徒ID'])));
    const students = getDataObjects_(getSheet_(CONFIG.SHEETS.STUDENTS)).map((student) => {
      const id = String(student['生徒ID']);
      const progress = getProgress_(id);
      return {
        id,
        password: String(student['パスワード']),
        name: String(student['氏名']),
        className: String(student['クラス']),
        number: String(student['出席番号']),
        googleAccount: String(student['Googleアカウント']),
        nickname: String(student['ニックネーム'] || ''),
        completedStages: progress.completedStages,
        currentStage: progress.currentStage,
        correctCount: progress.totalCorrect,
        percentage: progress.percentage,
        completed: progress.completed,
        loggedIn: activeIds.has(id)
      };
    }).sort((a, b) => a.className.localeCompare(b.className, 'ja') || Number(a.number) - Number(b.number));
    return {
      success: true,
      students,
      questions: validation.questions,
      questionStatus: { valid: validation.valid, errors: validation.errors, stages: validation.stages }
    };
  } catch (error) { return publicError_(error); }
}

function saveStudent(token, studentData) {
  try {
    requireTeacherSession_(token);
    const data = studentData || {};
    const id = requireText_(data.id, '生徒ID');
    const password = requireText_(data.password, 'パスワード');
    const name = requireText_(data.name, '氏名');
    const sheet = getSheet_(CONFIG.SHEETS.STUDENTS);
    const existing = getStudentById_(id);
    const row = [id, password, name, String(data.className || '').trim(), String(data.number || '').trim(), String(data.googleAccount || '').trim(), String(data.nickname || '').trim()];
    if (data.isNew) {
      if (existing) throw new Error('この生徒IDはすでに登録されています。');
      sheet.appendRow(row);
    } else {
      if (!existing) throw new Error('生徒情報が見つかりません。');
      sheet.getRange(existing._row, 1, 1, row.length).setValues([row]);
    }
    return { success: true };
  } catch (error) { return publicError_(error); }
}

function importStudents(token, pastedText) {
  try {
    requireTeacherSession_(token);
    const text = requireText_(pastedText, '生徒情報');
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rows = lines.map((line) => line.split('\t'));
    if (rows[0] && String(rows[0][0]).trim() === '生徒ID') rows.shift();
    if (!rows.length) throw new Error('登録する生徒情報がありません。');
    const sheet = getSheet_(CONFIG.SHEETS.STUDENTS);
    let added = 0;
    let updated = 0;
    rows.forEach((columns, index) => {
      const id = String(columns[0] || '').trim();
      const password = String(columns[1] || '').trim();
      const name = String(columns[2] || '').trim();
      if (!id || !password || !name) throw new Error((index + 1) + '行目の生徒ID、パスワード、氏名を確認してください。');
      const values = [id, password, name, String(columns[3] || '').trim(), String(columns[4] || '').trim(), String(columns[5] || '').trim(), String(columns[6] || '').trim()];
      const existing = getStudentById_(id);
      if (existing) { sheet.getRange(existing._row, 1, 1, values.length).setValues([values]); updated += 1; }
      else { sheet.appendRow(values); added += 1; }
    });
    return { success: true, added, updated };
  } catch (error) { return publicError_(error); }
}

function deleteStudent(token, studentId) {
  try {
    requireTeacherSession_(token);
    const id = requireText_(studentId, '生徒ID');
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const student = getStudentById_(id);
      if (!student) throw new Error('生徒情報が見つかりません。');
      getSheet_(CONFIG.SHEETS.STUDENTS).deleteRow(student._row);
      deleteRecordsByStudent_(id);
      releaseStudentSession_(id);
    } finally { lock.releaseLock(); }
    return { success: true };
  } catch (error) { return publicError_(error); }
}

function resetStudentProgress(token, studentId) {
  try {
    requireTeacherSession_(token);
    deleteRecordsByStudent_(requireText_(studentId, '生徒ID'));
    return { success: true };
  } catch (error) { return publicError_(error); }
}

function releaseStudentSession(token, studentId) {
  try {
    requireTeacherSession_(token);
    releaseStudentSession_(requireText_(studentId, '生徒ID'));
    return { success: true };
  } catch (error) { return publicError_(error); }
}

function reissueStudentPassword(token, studentId) {
  try {
    requireTeacherSession_(token);
    const student = getStudentById_(requireText_(studentId, '生徒ID'));
    if (!student) throw new Error('生徒情報が見つかりません。');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let password = '';
    for (let index = 0; index < 10; index += 1) password += chars.charAt(Math.floor(Math.random() * chars.length));
    getSheet_(CONFIG.SHEETS.STUDENTS).getRange(student._row, 2).setValue(password);
    return { success: true, password };
  } catch (error) { return publicError_(error); }
}

function getUnansweredQuestions(token, studentId) {
  try {
    requireTeacherSession_(token);
    const id = requireText_(studentId, '生徒ID');
    const correctIds = new Set(getStudentRecords_(id).map((record) => String(record['問題ID'])));
    return {
      success: true,
      questions: validateQuestions_().questions.filter((question) => question.published && !correctIds.has(question.id))
        .map((question) => ({ id: question.id, stage: question.stage, number: question.number, text: question.text }))
    };
  } catch (error) { return publicError_(error); }
}

function saveQuestion(token, questionData) {
  try {
    requireTeacherSession_(token);
    ensureQuestionHeaders_();
    const data = questionData || {};
    const stage = Number(data.stage);
    const number = Number(data.number);
    if (!Number.isInteger(stage) || stage < 1 || stage > CONFIG.STAGE_COUNT) throw new Error('ステージは1～8で指定してください。');
    if (!Number.isInteger(number) || number < 1 || number > CONFIG.QUESTIONS_PER_STAGE) throw new Error('問題番号は1～10で指定してください。');
    const type = normalizeQuestionType_(data.type);
    if (CONFIG.QUESTION_TYPES.indexOf(type) === -1) throw new Error('問題形式は記述・〇×・4択のいずれかを選んでください。');
    const text = requireText_(data.text, '問題文');
    let answer = requireText_(data.answer, '正解');
    let alternatives = String(data.alternatives || '').trim();
    let choicesText = '';
    if (type === '〇×') {
      answer = normalizeOxAnswer_(answer);
      if (answer !== '〇' && answer !== '×') throw new Error('〇×問題の正解は〇または×にしてください。');
    } else if (type === '4択') {
      const choices = parseChoices_(data.choices != null ? data.choices : [data.choice1, data.choice2, data.choice3, data.choice4]);
      if (choices.length !== 4) throw new Error('4択問題は選択肢を4つ入力してください。');
      if (choices.indexOf(answer) === -1) throw new Error('正解は4つの選択肢のいずれかと一致させてください。');
      choicesText = choices.join('\n');
    }
    const sheet = getSheet_(CONFIG.SHEETS.QUESTIONS);
    const rows = getDataObjects_(sheet);
    const id = String(data.id || '').trim() || Utilities.getUuid();
    const existing = rows.find((row) => String(row['問題ID']) === id);
    const duplicate = rows.find((row) => row._row !== (existing && existing._row) && Number(row['ステージ']) === stage && Number(row['問題番号']) === number && isPublished_(row['公開']) && Boolean(data.published));
    if (duplicate) throw new Error('同じステージ・問題番号の公開問題がすでにあります。');
    const affected = getDataObjects_(getSheet_(CONFIG.SHEETS.RECORDS)).filter((record) => String(record['問題ID']) === id);
    const stageChanged = existing && Number(existing['ステージ']) !== stage;
    if (stageChanged && affected.length && !data.confirmImpact) {
      return { success: false, requiresConfirmation: true, affectedRecords: affected.length, message: 'ステージを変更すると、この問題の正解記録' + affected.length + '件を削除します。' };
    }
    if (stageChanged && affected.length) deleteRecordsByQuestion_(id);
    const valuesByHeader = {
      '問題ID': id,
      'ステージ': stage,
      '問題番号': number,
      '問題文': text,
      '正解': answer,
      '別解': alternatives,
      '解説': String(data.explanation || '').trim(),
      '公開': Boolean(data.published),
      '形式': type,
      '選択肢': choicesText
    };
    const indexes = getHeaderIndexes_(sheet);
    if (existing) {
      Object.keys(valuesByHeader).forEach((header) => {
        if (indexes[header]) sheet.getRange(existing._row, indexes[header]).setValue(valuesByHeader[header]);
      });
    } else {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((value) => String(value || '').trim());
      sheet.appendRow(headers.map((header) => valuesByHeader[header] != null ? valuesByHeader[header] : ''));
    }
    clearQuestionCache_();
    return { success: true, id };
  } catch (error) { return publicError_(error); }
}

function deleteQuestion(token, questionId, confirmImpact) {
  try {
    requireTeacherSession_(token);
    const id = requireText_(questionId, '問題ID');
    const sheet = getSheet_(CONFIG.SHEETS.QUESTIONS);
    const question = getDataObjects_(sheet).find((row) => String(row['問題ID']) === id);
    if (!question) throw new Error('問題が見つかりません。');
    const affected = getDataObjects_(getSheet_(CONFIG.SHEETS.RECORDS)).filter((record) => String(record['問題ID']) === id);
    if (affected.length && !confirmImpact) {
      return { success: false, requiresConfirmation: true, affectedRecords: affected.length, message: 'この問題の正解記録' + affected.length + '件も削除されます。' };
    }
    if (affected.length) deleteRecordsByQuestion_(id);
    sheet.deleteRow(question._row);
    clearQuestionCache_();
    return { success: true };
  } catch (error) { return publicError_(error); }
}

function changeTeacherPassword(token, currentPassword, newPassword) {
  try {
    requireTeacherSession_(token);
    if (requireText_(currentPassword, '現在のパスワード') !== getSetting_(CONFIG.TEACHER_PASSWORD_KEY)) throw new Error('現在の教師用パスワードが正しくありません。');
    const next = requireText_(newPassword, '新しいパスワード');
    if (next.length < 8) throw new Error('新しいパスワードは8文字以上にしてください。');
    setSetting_(CONFIG.TEACHER_PASSWORD_KEY, next);
    return { success: true };
  } catch (error) { return publicError_(error); }
}

function deleteRecordsByStudent_(studentId) {
  const sheet = getSheet_(CONFIG.SHEETS.RECORDS);
  getDataObjects_(sheet).filter((row) => String(row['生徒ID']) === String(studentId))
    .map((row) => row._row).sort((a, b) => b - a).forEach((row) => sheet.deleteRow(row));
  forgetProgress_(studentId);
}

function deleteRecordsByQuestion_(questionId) {
  const sheet = getSheet_(CONFIG.SHEETS.RECORDS);
  const rows = getDataObjects_(sheet).filter((row) => String(row['問題ID']) === String(questionId));
  rows.forEach((row) => forgetProgress_(row['生徒ID']));
  rows.map((row) => row._row).sort((a, b) => b - a).forEach((row) => sheet.deleteRow(row));
}
