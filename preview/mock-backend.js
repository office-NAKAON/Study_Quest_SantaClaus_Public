(function () {
  const stageItems = ['ブーツ','赤いズボン','赤いコート','ベルト','手袋','サンタ帽','プレゼント袋','プレゼント'];
  function demoQuestion(index) {
    const stage = Math.floor(index / 10) + 1;
    const number = (index % 10) + 1;
    const kind = index % 3;
    if (kind === 1) {
      return {
        id: 'demo-' + (index + 1),
        stage: stage,
        number: number,
        type: '〇×',
        text: '【試運転】ステージ' + stage + 'の問題 ' + number + '：この文は正しい。〇か×か。',
        answer: '×',
        alternatives: 'バツ',
        explanation: '試運転用の〇×問題です。答えは×です。',
        choices: ['〇', '×'],
        published: true
      };
    }
    if (kind === 2) {
      const choices = ['りんご', 'みかん', 'ぶどう', '正解'];
      return {
        id: 'demo-' + (index + 1),
        stage: stage,
        number: number,
        type: '4択',
        text: '【試運転】ステージ' + stage + 'の問題 ' + number + '：正しいものを選んでください。',
        answer: '正解',
        alternatives: '',
        explanation: '試運転用の4択問題です。「正解」を選びます。',
        choices: choices,
        published: true
      };
    }
    return {
      id: 'demo-' + (index + 1),
      stage: stage,
      number: number,
      type: '記述',
      text: '【試運転】ステージ' + stage + 'の問題 ' + number + '：答えに「正解」と入力してください。',
      answer: '正解',
      alternatives: 'せいかい',
      explanation: '試運転用の記述問題です。',
      choices: [],
      published: true
    };
  }
  const questions = Array.from({ length: 80 }, function (_, index) { return demoQuestion(index); });
  let correctIds = new Set(JSON.parse(localStorage.getItem('demoCorrectIdsV2') || '[]'));
  let nickname = localStorage.getItem('demoNickname') || 'おためしさん';
  let studentToken = 'demo-student-token';
  let teacherToken = 'demo-teacher-token';
  let students = [{ id: 'demo', password: 'santa123', name: '体験 生徒', className: '1年A組', number: '1', googleAccount: '', nickname: nickname }];

  function progress() {
    const counts = Array.from({ length: 8 }, function (_, i) {
      return questions.filter(function (q) { return q.stage === i + 1 && correctIds.has(q.id); }).length;
    });
    let completedStages = 0;
    counts.forEach(function (count, i) { if (count === 10 && completedStages === i) completedStages = i + 1; });
    const currentStage = completedStages >= 8 ? 8 : completedStages + 1;
    return {
      completedStages: completedStages,
      currentStage: currentStage,
      currentStageCount: counts[currentStage - 1],
      totalCorrect: correctIds.size,
      totalCount: 80,
      percentage: Math.round(correctIds.size / 80 * 100),
      completed: completedStages === 8,
      stageStates: counts.map(function (count, i) {
        return {
          stage: i + 1,
          count: count,
          completed: i + 1 <= completedStages,
          unlocked: i + 1 <= currentStage,
          current: i + 1 === currentStage && completedStages < 8,
          item: stageItems[i]
        };
      })
    };
  }
  function ranking() {
    const p = progress();
    return [{ rank: 1, nickname: nickname, completedStages: p.completedStages, currentStage: p.currentStage, correctCount: p.totalCorrect, isCurrent: true }];
  }
  function home() {
    return { success: true, student: { id: 'demo', name: '体験 生徒', className: '1年A組', number: '1', nickname: nickname }, progress: progress(), ranking: ranking() };
  }
  function dashboard() {
    const p = progress();
    return {
      success: true,
      students: students.map(function (s) {
        return Object.assign({}, s, {
          completedStages: p.completedStages,
          currentStage: p.currentStage,
          correctCount: p.totalCorrect,
          percentage: p.percentage,
          completed: p.completed,
          loggedIn: true
        });
      }),
      questions: questions,
      questionStatus: {
        valid: true,
        errors: [],
        stages: Array.from({ length: 8 }, function (_, i) { return { stage: i + 1, count: 10, ready: true, errors: [] }; })
      }
    };
  }
  function acceptedAnswers(question) {
    const values = [question.answer].concat(String(question.alternatives || '').split(/[\n\r|｜]+/));
    return values.map(function (value) { return String(value).trim(); }).filter(Boolean);
  }
  const api = {
    loginStudent: function (id, password) {
      if (id !== 'demo' || password !== 'santa123') return { success: false, message: '試運転では、生徒ID demo・パスワード santa123 を入力してください。' };
      return Object.assign({ token: studentToken }, home());
    },
    resumeStudentSession: function () { return home(); },
    getStudentHome: function () { return home(); },
    logoutStudent: function () { return { success: true }; },
    getStageQuestion: function (token, stage, exclude, reviewIds, review) {
      const p = progress();
      const done = new Set(review ? reviewIds : Array.from(correctIds));
      let candidates = questions.filter(function (q) { return q.stage === Number(stage) && !done.has(q.id); });
      if (!candidates.length) return { success: true, stageFinished: true, review: Boolean(review), progress: p };
      const alternatives = candidates.filter(function (q) { return q.id !== String(exclude || ''); });
      if (alternatives.length) candidates = alternatives;
      const q = candidates[0];
      return {
        success: true,
        stageFinished: false,
        review: Boolean(review),
        question: {
          id: q.id,
          number: q.number,
          stage: q.stage,
          text: q.text,
          type: q.type,
          choices: q.type === '4択' ? q.choices : (q.type === '〇×' ? ['〇', '×'] : [])
        },
        progress: p
      };
    },
    submitAnswer: function (token, id, answer, review) {
      const q = questions.find(function (item) { return item.id === id; });
      const isCorrect = acceptedAnswers(q).indexOf(String(answer).trim()) !== -1;
      const before = progress();
      if (isCorrect && !review) {
        correctIds.add(id);
        localStorage.setItem('demoCorrectIdsV2', JSON.stringify(Array.from(correctIds)));
      }
      const after = progress();
      const stageCleared = !review && after.completedStages > before.completedStages;
      return {
        success: true,
        correct: isCorrect,
        questionId: id,
        correctAnswer: q.answer,
        explanation: q.explanation,
        review: Boolean(review),
        progress: after,
        stageCleared: stageCleared,
        unlockedItem: stageCleared ? stageItems[q.stage - 1] : '',
        completion: after.completed ? { nickname: nickname, completedDate: '試運転日', rank: 1, title: 'サンタの知識パートナー' } : null
      };
    },
    saveStudentNickname: function (token, value) {
      nickname = String(value);
      localStorage.setItem('demoNickname', nickname);
      return { success: true, nickname: nickname, ranking: ranking() };
    },
    loginTeacher: function (password) {
      return password === 'change-me' ? { success: true, token: teacherToken } : { success: false, message: '試運転の教師パスワードは change-me です。' };
    },
    logoutTeacher: function () { return { success: true }; },
    getTeacherDashboard: function () { return dashboard(); },
    saveStudent: function () { return { success: true }; },
    importStudents: function () { return { success: true, added: 2, updated: 0 }; },
    deleteStudent: function () { return { success: true }; },
    resetStudentProgress: function () {
      correctIds = new Set();
      localStorage.removeItem('demoCorrectIdsV2');
      return { success: true };
    },
    releaseStudentSession: function () { return { success: true }; },
    reissueStudentPassword: function () { return { success: true, password: 'Santa2026' }; },
    getUnansweredQuestions: function () {
      return { success: true, questions: questions.filter(function (q) { return !correctIds.has(q.id); }) };
    },
    saveQuestion: function () { return { success: true }; },
    deleteQuestion: function () { return { success: true }; },
    changeTeacherPassword: function () { return { success: true }; }
  };
  function runner(success, failure) {
    const target = {
      withSuccessHandler: function (fn) { return runner(fn, failure); },
      withFailureHandler: function (fn) { return runner(success, fn); }
    };
    return new Proxy(target, {
      get: function (object, name) {
        if (name in object) return object[name];
        return function () {
          const args = Array.prototype.slice.call(arguments);
          setTimeout(function () {
            try { success(api[name].apply(null, args)); }
            catch (error) { failure(error); }
          }, 120);
        };
      }
    });
  }
  window.google = { script: { run: runner(function () {}, function (error) { console.error(error); }) } };
  window.__consoleErrors = [];
  window.addEventListener('error', function (event) { window.__consoleErrors.push(event.message); });
})();
