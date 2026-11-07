const CONFIG = Object.freeze({
  APP_NAME: 'Study Quest with Santa Claus',
  STAGE_COUNT: 8,
  QUESTIONS_PER_STAGE: 10,
  QUESTION_COUNT: 80,
  SESSION_MINUTES: 30,
  SHEETS: Object.freeze({
    QUESTIONS: '問題マスター',
    STUDENTS: '生徒マスター',
    RECORDS: '学習記録',
    SETTINGS: '設定',
    SESSIONS: 'ログインセッション'
  }),
  HEADERS: Object.freeze({
    QUESTIONS: ['問題ID', 'ステージ', '問題番号', '問題文', '正解', '別解', '解説', '公開', '形式', '選択肢'],
    STUDENTS: ['生徒ID', 'パスワード', '氏名', 'クラス', '出席番号', 'Googleアカウント', 'ニックネーム'],
    RECORDS: ['生徒ID', '問題ID', 'ステージ', '問題番号', '正解日時'],
    SETTINGS: ['設定項目', '設定値'],
    SESSIONS: ['生徒ID', 'セッションID', 'ログイン日時', '最終操作日時']
  }),
  QUESTION_TYPES: Object.freeze(['記述', '〇×', '4択']),
  STAGE_ITEMS: Object.freeze(['ブーツ', '赤いズボン', '赤いコート', 'ベルト', '手袋', 'サンタ帽', 'プレゼント袋', 'プレゼント']),
  TEACHER_PASSWORD_KEY: '教師用パスワード',
  SPREADSHEET_ID_KEY: 'STUDY_QUEST_SANTA_SPREADSHEET_ID',
  DEFAULT_TEACHER_PASSWORD: 'change-me',
  TEACHER_CACHE_PREFIX: 'santa-teacher-session-'
});

function onOpen() {
  SpreadsheetApp.getUi().createMenu(CONFIG.APP_NAME)
    .addItem('新版の初期シートを作成', 'setupStudyQuest').addToUi();
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CONFIG.APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupStudyQuest() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('新版用スプレッドシートに紐付いたApps Scriptから実行してください。');
  PropertiesService.getScriptProperties().setProperty(CONFIG.SPREADSHEET_ID_KEY, spreadsheet.getId());
  spreadsheet.setSpreadsheetTimeZone('Asia/Tokyo');
  Object.keys(CONFIG.SHEETS).forEach((key) => {
    createOrPrepareSheet_(spreadsheet, CONFIG.SHEETS[key], CONFIG.HEADERS[key]);
  });
  const settingsSheet = spreadsheet.getSheetByName(CONFIG.SHEETS.SETTINGS);
  const settings = getDataObjects_(settingsSheet);
  if (!settings.some((row) => row['設定項目'] === CONFIG.TEACHER_PASSWORD_KEY)) {
    settingsSheet.appendRow([CONFIG.TEACHER_PASSWORD_KEY, CONFIG.DEFAULT_TEACHER_PASSWORD]);
  }
  clearQuestionCache_();
  SpreadsheetApp.flush();
  return { success: true, message: '新版用シートを作成しました。教師用初期パスワードは change-me です。' };
}

function createOrPrepareSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const lastColumn = sheet.getLastColumn();
  const currentHeaders = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map((value) => String(value || '').trim())
    : [];
  const hasData = sheet.getLastRow() > 1;
  const unexpected = currentHeaders.filter((header) => header && headers.indexOf(header) === -1);
  if (hasData && unexpected.length) {
    throw new Error('シート「' + name + '」の列構成が新版と異なります。空の新版用スプレッドシートを使用してください。');
  }
  if (!hasData) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    headers.forEach((header) => {
      if (currentHeaders.indexOf(header) !== -1) return;
      const column = sheet.getLastColumn() + 1;
      sheet.getRange(1, column).setValue(header);
      currentHeaders.push(header);
    });
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
    .setBackground('#b4232f').setFontColor('#ffffff').setFontWeight('bold');
  sheet.autoResizeColumns(1, Math.max(sheet.getLastColumn(), headers.length));
  return sheet;
}
