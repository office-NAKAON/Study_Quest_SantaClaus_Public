let spreadsheetCache_;

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('必要なシート「' + name + '」がありません。setupStudyQuestを実行してください。');
  return sheet;
}

function getSpreadsheet_() {
  if (spreadsheetCache_) return spreadsheetCache_;
  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.SPREADSHEET_ID_KEY);
  const spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('新版用スプレッドシートが設定されていません。');
  spreadsheetCache_ = spreadsheet;
  return spreadsheetCache_;
}

function getDataObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter((row) => row.some((value) => value !== '')).map((row, index) => {
    const item = { _row: index + 2 };
    headers.forEach((header, column) => { item[header] = row[column]; });
    return item;
  });
}

function requireText_(value, label) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw new Error(label + 'を入力してください。');
  return text;
}

function publicError_(error) {
  console.error(error && error.stack ? error.stack : error);
  return { success: false, message: error && error.message ? error.message : '処理に失敗しました。' };
}

function createToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

function formatDate_(date, pattern) {
  if (!date) return '';
  return Utilities.formatDate(new Date(date), 'Asia/Tokyo', pattern || 'yyyy/MM/dd HH:mm');
}

function isPublished_(value) {
  const text = String(value).trim().toLowerCase();
  return value === true || text === 'true' || text === '1' || text === '公開' || text === 'yes';
}

function clearQuestionCache_() {
  try { CacheService.getScriptCache().remove('santa-question-validation-v2'); } catch (error) { console.warn(error); }
}

function ensureQuestionHeaders_() {
  const sheet = getSheet_(CONFIG.SHEETS.QUESTIONS);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map((value) => String(value || '').trim());
  CONFIG.HEADERS.QUESTIONS.forEach((header) => {
    if (current.indexOf(header) !== -1) return;
    const column = sheet.getLastColumn() + 1;
    sheet.getRange(1, column).setValue(header)
      .setBackground('#b4232f').setFontColor('#ffffff').setFontWeight('bold');
    current.push(header);
  });
  return sheet;
}

function getHeaderIndexes_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map((value) => String(value || '').trim());
  const indexes = {};
  headers.forEach((header, index) => { if (header) indexes[header] = index + 1; });
  return indexes;
}

function normalizeQuestionType_(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text === '記述' || text === '記述式' || text === 'text') return '記述';
  if (text === '〇×' || text === '○×' || text === 'ox' || text === 'OX' || text === '丸バツ') return '〇×';
  if (text === '4択' || text === '四択' || text === 'choice' || text === '選択') return '4択';
  return '';
}

function parseChoices_(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item == null ? '' : item).trim()).filter(Boolean);
  }
  return String(value == null ? '' : value).split(/[\n\r|｜]+/)
    .map((item) => item.trim()).filter(Boolean);
}

function normalizeOxAnswer_(value) {
  const text = String(value == null ? '' : value).trim();
  if (text === '〇' || text === '○' || text === 'まる' || text === 'マル' || text === '正' || text === '正しい') return '〇';
  if (text === '×' || text === '✕' || text === '✗' || text === 'x' || text === 'X' || text === 'ばつ' || text === 'バツ' || text === '誤' || text === '正しくない') return '×';
  return text;
}

function normalizeAnswerForType_(type, value) {
  if (type === '〇×') return normalizeOxAnswer_(value);
  return String(value == null ? '' : value).trim();
}

function mapQuestionRow_(row) {
  const type = normalizeQuestionType_(row['形式']) || '記述';
  const choices = type === '4択' ? parseChoices_(row['選択肢']) : (type === '〇×' ? ['〇', '×'] : []);
  return {
    _row: row._row,
    id: String(row['問題ID'] || '').trim(),
    stage: Number(row['ステージ']),
    number: Number(row['問題番号']),
    text: String(row['問題文'] || '').trim(),
    answer: String(row['正解'] || '').trim(),
    alternatives: String(row['別解'] || '').trim(),
    explanation: String(row['解説'] || '').trim(),
    published: isPublished_(row['公開']),
    type: type,
    choices: choices
  };
}

function validateQuestions_() {
  const cacheKey = 'santa-question-validation-v2';
  try {
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (error) { console.warn(error); }
  ensureQuestionHeaders_();

  const questions = getDataObjects_(getSheet_(CONFIG.SHEETS.QUESTIONS)).map(mapQuestionRow_);
  const errors = [];
  const ids = {};
  questions.forEach((question) => {
    if (!question.id) errors.push('問題IDが未入力の問題があります。');
    if (question.id && ids[question.id]) errors.push('問題ID「' + question.id + '」が重複しています。');
    ids[question.id] = true;
    if (!Number.isInteger(question.stage) || question.stage < 1 || question.stage > CONFIG.STAGE_COUNT) {
      errors.push('ステージは1～8で登録してください。');
    }
    if (!Number.isInteger(question.number) || question.number < 1 || question.number > CONFIG.QUESTIONS_PER_STAGE) {
      errors.push('問題番号は各ステージ1～10で登録してください。');
    }
    if (!question.text || !question.answer) errors.push('問題文または正解が未入力の問題があります。');
    if (CONFIG.QUESTION_TYPES.indexOf(question.type) === -1) {
      errors.push('問題形式は記述・〇×・4択のいずれかを指定してください。');
    }
    if (question.type === '〇×') {
      const answer = normalizeOxAnswer_(question.answer);
      if (answer !== '〇' && answer !== '×') errors.push('〇×問題の正解は〇または×にしてください。');
    }
    if (question.type === '4択') {
      if (question.choices.length !== 4) errors.push('4択問題は選択肢を4つ登録してください。');
      if (question.choices.length === 4 && question.choices.indexOf(question.answer) === -1) {
        errors.push('4択問題の正解は選択肢のいずれかと一致させてください。');
      }
    }
  });
  const stages = [];
  for (let stage = 1; stage <= CONFIG.STAGE_COUNT; stage += 1) {
    const published = questions.filter((question) => question.published && question.stage === stage);
    const stageErrors = [];
    if (published.length !== CONFIG.QUESTIONS_PER_STAGE) {
      stageErrors.push('公開問題が' + published.length + '問です。10問にしてください。');
    }
    const numbers = {};
    published.forEach((question) => {
      if (numbers[question.number]) stageErrors.push('問題番号' + question.number + 'が重複しています。');
      numbers[question.number] = true;
    });
    for (let number = 1; number <= CONFIG.QUESTIONS_PER_STAGE; number += 1) {
      if (!numbers[number]) stageErrors.push('問題番号' + number + 'がありません。');
    }
    stageErrors.forEach((message) => errors.push('ステージ' + stage + '：' + message));
    stages.push({ stage, count: published.length, ready: stageErrors.length === 0, errors: stageErrors });
  }
  const result = { valid: errors.length === 0, errors: Array.from(new Set(errors)), stages, questions };
  try {
    const payload = JSON.stringify(result);
    if (payload.length < 95000) CacheService.getScriptCache().put(cacheKey, payload, 21600);
  } catch (error) { console.warn(error); }
  return result;
}

function getStudentById_(studentId) {
  return getDataObjects_(getSheet_(CONFIG.SHEETS.STUDENTS))
    .find((student) => String(student['生徒ID']) === String(studentId));
}

function getStudentRecords_(studentId) {
  return getDataObjects_(getSheet_(CONFIG.SHEETS.RECORDS))
    .filter((record) => String(record['生徒ID']) === String(studentId));
}

function getProgress_(studentId) {
  const progress = progressFromRecords_(getStudentRecords_(studentId), validateQuestions_());
  rememberProgress_(studentId, progress);
  return progress;
}

function rememberProgress_(studentId, progress) {
  try { CacheService.getScriptCache().put('santa-progress-' + studentId, JSON.stringify(progress), 21600); }
  catch (error) { console.warn(error); }
}

function readRememberedProgress_(studentId) {
  try {
    const cached = CacheService.getScriptCache().get('santa-progress-' + studentId);
    if (cached) return JSON.parse(cached);
  } catch (error) { console.warn(error); }
  return null;
}

function forgetProgress_(studentId) {
  CacheService.getScriptCache().remove('santa-progress-' + studentId);
}

function progressFromRecords_(recordRows, validation) {
  const publishedIds = new Set(validation.questions.filter((question) => question.published).map((question) => question.id));
  const unique = {};
  recordRows.forEach((record) => {
    const id = String(record['問題ID']);
    if (publishedIds.has(id) && !unique[id]) unique[id] = record;
  });
  const records = Object.keys(unique).map((id) => unique[id]);
  const counts = {};
  for (let stage = 1; stage <= CONFIG.STAGE_COUNT; stage += 1) counts[stage] = 0;
  records.forEach((record) => { counts[Number(record['ステージ'])] = (counts[Number(record['ステージ'])] || 0) + 1; });
  let completedStages = 0;
  for (let stage = 1; stage <= CONFIG.STAGE_COUNT; stage += 1) {
    if (counts[stage] === CONFIG.QUESTIONS_PER_STAGE && completedStages === stage - 1) completedStages = stage;
    else break;
  }
  const currentStage = completedStages >= CONFIG.STAGE_COUNT ? CONFIG.STAGE_COUNT : completedStages + 1;
  const totalCorrect = records.length;
  const stageStates = [];
  for (let stage = 1; stage <= CONFIG.STAGE_COUNT; stage += 1) {
    stageStates.push({
      stage,
      count: counts[stage] || 0,
      completed: stage <= completedStages,
      unlocked: stage <= currentStage,
      current: stage === currentStage && completedStages < CONFIG.STAGE_COUNT,
      item: CONFIG.STAGE_ITEMS[stage - 1]
    });
  }
  const latest = records.reduce((time, record) => Math.max(time, new Date(record['正解日時']).getTime() || 0), 0);
  return {
    completedStages,
    currentStage,
    currentStageCount: counts[currentStage] || 0,
    totalCorrect,
    totalCount: CONFIG.QUESTION_COUNT,
    percentage: Math.round(totalCorrect / CONFIG.QUESTION_COUNT * 100),
    completed: completedStages === CONFIG.STAGE_COUNT,
    stageStates,
    attainedAt: latest
  };
}

function getPublishedStageQuestions_(stage) {
  return validateQuestions_().questions
    .filter((question) => question.published && question.stage === Number(stage))
    .sort((a, b) => a.number - b.number);
}

function getRanking_(currentStudentId) {
  const validation = validateQuestions_();
  const recordsByStudent = {};
  getDataObjects_(getSheet_(CONFIG.SHEETS.RECORDS)).forEach((record) => {
    const id = String(record['生徒ID']);
    if (!recordsByStudent[id]) recordsByStudent[id] = [];
    recordsByStudent[id].push(record);
  });
  const rows = getDataObjects_(getSheet_(CONFIG.SHEETS.STUDENTS)).map((student) => {
    const id = String(student['生徒ID']);
    const progress = progressFromRecords_(recordsByStudent[id] || [], validation);
    return {
      id: String(student['生徒ID']),
      nickname: String(student['ニックネーム'] || '').trim(),
      completedStages: progress.completedStages,
      currentStage: progress.currentStage,
      correctCount: progress.totalCorrect,
      attainedAt: progress.attainedAt || Number.MAX_SAFE_INTEGER
    };
  }).filter((student) => student.nickname)
    .sort((a, b) => b.completedStages - a.completedStages || b.correctCount - a.correctCount || a.attainedAt - b.attainedAt || a.nickname.localeCompare(b.nickname, 'ja'));
  return rows.slice(0, 20).map((student, index) => ({
    rank: index + 1,
    nickname: student.nickname,
    completedStages: student.completedStages,
    currentStage: student.currentStage,
    correctCount: student.correctCount,
    isCurrent: student.id === String(currentStudentId)
  }));
}

function getCompletionDetails_(studentId) {
  const student = getStudentById_(studentId);
  const records = getStudentRecords_(studentId);
  const latest = records.reduce((time, record) => Math.max(time, new Date(record['正解日時']).getTime() || 0), 0);
  const ranking = getRanking_(studentId);
  const own = ranking.find((entry) => entry.isCurrent);
  return {
    nickname: String(student && student['ニックネーム'] || '').trim(),
    completedDate: latest ? formatDate_(latest, 'yyyy年M月d日') : '',
    rank: own ? own.rank : null,
    title: 'サンタの知識パートナー'
  };
}

function getSetting_(key) {
  const row = getDataObjects_(getSheet_(CONFIG.SHEETS.SETTINGS))
    .find((setting) => String(setting['設定項目']) === String(key));
  return row ? String(row['設定値']) : '';
}

function setSetting_(key, value) {
  const sheet = getSheet_(CONFIG.SHEETS.SETTINGS);
  const row = getDataObjects_(sheet).find((setting) => String(setting['設定項目']) === String(key));
  if (row) sheet.getRange(row._row, 2).setValue(value);
  else sheet.appendRow([key, value]);
}
