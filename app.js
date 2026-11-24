const root = document.getElementById("app");
const state = {
  me: null, adminSetupAvailable: false, view: "home", authMode: "login", setupMode: false,
  rules: [], exercises: [], leaderboard: [], users: [], definitions: [], chatMessages: [], suggestions: [], chatTab: "chat",
  selectedRule: null, selectedDefinition: null, activeQuiz: null, quizResult: null,
  adminTab: "rules", editingRule: null, ruleDraft: null, editingDefinition: null, flashWords: [], flashSession: null, flashIndex: 0, flashAnswers: [], flashResult: null, flashDragStart: null, notice: "", error: ""
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function initials(name) { return String(name || "?").slice(0, 1).toUpperCase(); }
function linkedText(value) {
  let html = esc(value);
  const definitions = [...state.definitions].sort((a, b) => b.word.length - a.word.length);
  definitions.forEach(definition => {
    const word = String(definition.word || "");
    if (!word) return;
    const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, (character) => "\\" + character);
    const pattern = new RegExp("(^|[^\\p{L}\\p{N}_])(" + escapedWord + ")(?=$|[^\\p{L}\\p{N}_])", "giu");
    html = html.replace(pattern, (match, prefix, found) =>
      prefix + '<a class="defined-word" href="#" data-action="open-definition" data-id="' + esc(definition.id) + '">' + found + '</a>'
    );
  });
  return html;
}
function say(message, isError) {
  state.notice = isError ? "" : message;
  state.error = isError ? message : "";
  render();
}
async function api(path, options) {
  const opts = options || {};
  const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
  const response = await fetch(path, {
    method: opts.method || "GET",
    headers: headers,
    credentials: "same-origin",
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}
function noticeHTML() {
  if (state.error) return '<div class="alert alert-error" role="alert">' + esc(state.error) + '</div>';
  if (state.notice) return '<div class="alert alert-success" role="status">' + esc(state.notice) + '</div>';
  return "";
}
function emptyState(title, copy, action) {
  return '<div class="empty-state"><div class="empty-icon">✦</div><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p>' + (action || "") + '</div>';
}
function logo() {
  return '<img class="logo-mark-image" src="/favicon.svg" alt=""><div class="brand-copy"><strong>OrthoLab</strong><span>Apprendre, comprendre, réussir</span></div>';
}
function renderAuth() {
  const setup = state.setupMode && state.adminSetupAvailable;
  root.innerHTML = '<div class="auth-page"><div class="auth-decoration decor-one"></div><div class="auth-decoration decor-two"></div>' +
    '<div class="auth-card"><div class="brand auth-brand">' + logo() + '</div>' +
    '<div class="auth-intro"><span class="eyebrow">TON ESPACE DE RÉVISION</span><h1>' +
    (setup ? 'Créer le compte admin' : 'Prêt à progresser ?') +
    '</h1><p>' + (setup ? 'Initialise ton compte réservé à l’administration.' : 'Révise les 60 règles à ton rythme et fais grimper ton score.') + '</p></div>' +
    noticeHTML() +
    (setup
      ? '<form id="setup-form" class="form-stack"><label>Identifiant administrateur<input name="username" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_-]+"></label><label>Mot de passe<input name="password" type="password" autocomplete="new-password" required minlength="10"></label><label>Clé d’initialisation<input name="setupKey" type="password" autocomplete="off" required></label><button class="btn btn-primary btn-wide" type="submit">Créer mon compte admin</button><button class="text-button" type="button" data-action="back-auth">Retour à la connexion</button></form>'
      : '<div class="auth-tabs"><button class="' + (state.authMode === "login" ? "active" : "") + '" data-action="auth-login">Se connecter</button><button class="' + (state.authMode === "register" ? "active" : "") + '" data-action="auth-register">Créer un compte</button></div>' +
        '<form id="auth-form" class="form-stack"><label>Identifiant<input name="username" autocomplete="username" required minlength="3" maxlength="20" placeholder="Ex. Alex_12" pattern="[A-Za-z0-9_-]+"></label><label>Mot de passe<input name="password" type="password" autocomplete="' + (state.authMode === "login" ? "current-password" : "new-password") + '" required minlength="' + (state.authMode === "login" ? "1" : "8") + '" placeholder="••••••••"></label><button class="btn btn-primary btn-wide" type="submit">' + (state.authMode === "login" ? 'Me connecter' : 'Créer mon compte') + '</button></form>' +
        (state.adminSetupAvailable ? '<button class="text-button admin-setup-link" data-action="setup-mode">Initialiser le compte administrateur</button>' : '') +
        '<p class="auth-footnote">Choisis un identifiant à utiliser en classe. Pas besoin de communiquer ton vrai nom.</p>') +
    '</div><div class="auth-bottom">Un espace de travail pour progresser ensemble.</div></div>';
}
function navButton(view, symbol, label) {
  return '<button class="nav-link ' + (state.view === view ? "active" : "") + '" data-action="navigate" data-view="' + view + '"><span class="nav-symbol">' + symbol + '</span><span>' + label + '</span></button>';
}
function renderShell(content, title, subtitle) {
  const isAdmin = state.me.role === "admin";
  root.innerHTML = '<div class="app-shell"><aside class="sidebar"><div class="brand">' + logo() + '</div>' +
    '<div class="nav-caption">ESPACE DE TRAVAIL</div><nav class="main-nav">' +
    navButton("home", "⌂", "Accueil") + navButton("rules", "▤", "Liste des règles") + navButton("flashcards", "▣", "Flashcards") + navButton("quizzes", "✎", "Quiz") + navButton("ranking", "♜", "Classement") + navButton("chat", "☷", "Tchat") + navButton("account", "⚙", "Mon compte") +
    (isAdmin ? '<div class="nav-caption admin-caption">GESTION</div>' + navButton("admin", "⚙", "Administration") : '') +
    '</nav><div class="sidebar-bottom"><div class="sidebar-tip"><span class="tip-spark">✦</span><strong>Un peu chaque jour</strong><p>La régularité fait toute la différence.</p></div><div class="profile-mini"><div class="avatar">' + initials(state.me.username) + '</div><div class="profile-copy"><strong>' + esc(state.me.username) + '</strong><span>' + (isAdmin ? "Administrateur" : "Élève") + '</span></div><button class="logout-button" title="Se déconnecter" data-action="logout">↪</button></div></div></aside>' +
    '<main class="main-area"><header class="topbar"><div><span class="topbar-kicker">ESPACE DE RÉVISION</span><h1>' + esc(title) + '</h1><p>' + esc(subtitle || "") + '</p></div><div class="topbar-score"><span>TON SCORE</span><strong>' + Number(state.me.score || 0) + '<small> pts</small></strong></div></header>' +
    '<div class="page-content">' + noticeHTML() + content + '</div><footer class="page-footer">OrthoLab <span>·</span> Chaque exercice est une occasion de progresser.</footer></main></div>';
}
function renderHome() {
  const completed = state.exercises.length;
  const top = state.leaderboard.slice(0, 5);
  let ranking = top.length ? '<div class="mini-ranking">' + top.map((item, i) =>
    '<div class="rank-row"><span class="rank-number">' + (i + 1) + '</span><span class="rank-name">' + esc(item.username) + (item.username === state.me.username ? ' <b>· toi</b>' : '') + '</span><strong>' + item.score + ' pts</strong></div>'
  ).join("") + '</div>' : '<p class="muted">Le classement apparaîtra dès que les premiers points seront gagnés.</p>';
  const content = '<section class="welcome-banner"><div class="welcome-text"><span class="eyebrow light-eyebrow">BIENVENUE DANS TON ESPACE</span><h2>Chaque règle comprise<br>te fait avancer.</h2><p>Apprends les règles, entraîne-toi avec des exercices variés et suis tes progrès.</p><button class="btn btn-light" data-action="navigate" data-view="quizzes">Commencer un quiz <span>→</span></button></div><div class="welcome-graphic"><div class="graphic-circle circle-a"></div><div class="graphic-circle circle-b"></div><div class="graphic-paper"><span>ABC</span><i>✎</i><small>Écrire juste,<br>ça s’apprend.</small></div><div class="graphic-star star-a">✦</div><div class="graphic-star star-b">✧</div></div></section>' +
    '<section class="stat-grid"><article class="stat-card"><div class="stat-icon purple">▤</div><div><span>RÈGLES DISPONIBLES</span><strong>' + state.rules.length + '<small> / 60</small></strong></div></article><article class="stat-card"><div class="stat-icon peach">✎</div><div><span>SÉRIES D’EXERCICES</span><strong>' + completed + '</strong></div></article><article class="stat-card"><div class="stat-icon mint">♜</div><div><span>TON SCORE</span><strong>' + Number(state.me.score || 0) + '<small> points</small></strong></div></article></section>' +
    '<div class="home-columns"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">POUR CONTINUER</span><h2>À découvrir</h2></div><button class="link-button" data-action="navigate" data-view="rules">Toutes les règles →</button></div>' +
    (state.rules.length ? '<div class="preview-list">' + state.rules.slice(0, 4).map((r, i) => '<button class="preview-rule" data-action="open-rule" data-id="' + esc(r.id) + '"><span class="rule-index">' + String(i + 1).padStart(2, "0") + '</span><span><strong>' + esc(r.title) + '</strong><small>' + r.sections.length + ' partie' + (r.sections.length > 1 ? 's' : '') + '</small></span><b>→</b></button>').join("") + '</div>' : emptyState("Les règles arrivent bientôt", state.me.role === "admin" ? "Ajoute tes premières règles depuis le panneau d’administration." : "Ton professeur ajoutera bientôt les règles à réviser.", state.me.role === "admin" ? '<button class="btn btn-outline" data-action="navigate" data-view="admin">Ouvrir l’administration</button>' : '')) +
    '</section><section class="panel ranking-panel"><div class="panel-heading"><div><span class="eyebrow">LA CLASSE</span><h2>Classement</h2></div><span class="panel-medal">✦</span></div>' + ranking + '<button class="link-button ranking-link" data-action="navigate" data-view="ranking">Voir tout le classement →</button></section></div>';
  renderShell(content, "Accueil", "Retrouve tes règles, tes exercices et tes progrès au même endroit.");
}
function renderRules() {
  const content = state.rules.length ? '<div class="rules-grid">' + state.rules.map((rule, i) =>
    '<article class="rule-card"><div class="rule-card-top"><span class="rule-index">' + String(i + 1).padStart(2, "0") + '</span><span class="rule-tag">' + rule.sections.length + ' partie' + (rule.sections.length > 1 ? 's' : '') + '</span></div><h2>' + esc(rule.title) + '</h2><p>' + esc(rule.sections[0]?.rule || "Découvre les différentes parties de cette règle.") + '</p><button class="card-arrow" data-action="open-rule" data-id="' + esc(rule.id) + '">Voir la règle <span>→</span></button></article>'
  ).join("") + '</div>' : emptyState("Aucune règle pour le moment", state.me.role === "admin" ? "Ajoute tes 60 règles depuis l’administration." : "Les règles seront publiées ici par ton professeur.", state.me.role === "admin" ? '<button class="btn btn-primary" data-action="navigate" data-view="admin">Ajouter une règle</button>' : '');
  renderShell(content, "Liste des règles", "Retrouve les explications et les exceptions importantes.");
}
function renderRuleDetail() {
  const rule = state.rules.find(r => r.id === state.selectedRule);
  if (!rule) { state.view = "rules"; return renderRules(); }
  const blocks = rule.sections.map((section, i) => '<article class="rule-section"><div class="section-number">' + String(i + 1).padStart(2, "0") + '</div><div class="section-body"><h3>' + esc(section.name) + '</h3><p>' + linkedText(section.rule).replace(/\n/g, "<br>") + '</p>' +
    (section.exception ? '<div class="exception-box"><strong>À retenir · Exception</strong><p>' + linkedText(section.exception).replace(/\n/g, "<br>") + '</p></div>' : '') + '</div></article>').join("");
  const related = state.exercises.filter(e => e.rule_id === rule.id);
  const content = '<button class="back-link" data-action="navigate" data-view="rules">← Retour aux règles</button><section class="detail-hero"><span class="eyebrow light-eyebrow">FICHE DE RÉVISION</span><h2>' + esc(rule.title) + '</h2><p>' + rule.sections.length + ' partie' + (rule.sections.length > 1 ? 's' : '') + ' à connaître</p></section><div class="detail-layout"><section class="panel detail-panel"><div class="panel-heading"><div><span class="eyebrow">LA LEÇON</span><h2>Comprendre la règle</h2></div></div>' + blocks + '</section><aside class="panel detail-aside"><div class="aside-icon">✎</div><h3>À toi de jouer !</h3><p>Vérifie que tu as bien compris cette règle avec les exercices associés.</p>' +
    (related.length ? related.map(e => '<button class="btn btn-primary btn-wide related-exercise" data-action="start-quiz" data-id="' + esc(e.id) + '">' + esc(e.title) + ' →</button>').join("") : '<p class="muted small">Aucun exercice associé pour le moment.</p>') + '</aside></div>';
  renderShell(content, "Détail d’une règle", "Prends le temps de lire chaque partie et ses exceptions.");
}
function renderQuizzes() {
  const content = state.exercises.length ? '<div class="quiz-intro"><div><span class="eyebrow">ENTRAÎNEMENT</span><h2>À toi de jouer !</h2><p>Chaque réponse juste rapporte 1 point. Une réponse fausse retire 1 point.</p></div><div class="quiz-doodle">✎</div></div><div class="exercise-grid">' + state.exercises.map(e =>
    '<article class="exercise-card"><div class="exercise-icon">✎</div><span class="eyebrow">' + esc(e.rule_title || "Règle") + '</span><h3>' + esc(e.title) + '</h3><p>' + esc(e.description || "Une série pour t’entraîner et vérifier tes connaissances.") + '</p><div class="exercise-card-bottom"><span>Quiz complet</span><button class="btn btn-primary" data-action="start-quiz" data-id="' + esc(e.id) + '">Démarrer →</button></div></article>'
  ).join("") + '</div>' : emptyState("Les exercices arrivent bientôt", state.me.role === "admin" ? "Crée une série d’exercices dans l’administration. Je pourrai aussi te préparer des séries à coller ici." : "Ton professeur ajoutera les séries d’entraînement ici.", state.me.role === "admin" ? '<button class="btn btn-primary" data-action="navigate" data-view="admin">Créer des exercices</button>' : '');
  renderShell(content, "Quiz", "Entraîne-toi avec des formats différents et gagne des points.");
}
function renderQuizRunner() {
  const quiz = state.activeQuiz;
  if (!quiz) { state.view = "quizzes"; return renderQuizzes(); }
  const cards = quiz.questions.map((q, i) => {
    let answer = "";
    if (q.type === "choice") {
      answer = '<div class="answer-options">' + q.options.map((option, j) =>
        '<label class="answer-option"><input type="radio" name="answer-' + i + '" value="' + j + '"><span class="option-letter">' + String.fromCharCode(65 + j) + '</span><span>' + esc(option) + '</span></label>'
      ).join("") + '</div>';
    } else if (q.type === "boolean") {
      answer = '<div class="answer-options boolean-options"><label class="answer-option"><input type="radio" name="answer-' + i + '" value="true"><span>Vrai</span></label><label class="answer-option"><input type="radio" name="answer-' + i + '" value="false"><span>Faux</span></label></div>';
    } else {
      answer = '<input class="answer-text" type="text" name="answer-' + i + '" placeholder="Écris ta réponse ici…" autocomplete="off">';
    }
    return '<article class="question-card"><div class="question-meta"><span>QUESTION ' + String(i + 1).padStart(2, "0") + '</span><span>' + (q.type === "choice" ? "Choix multiple" : q.type === "boolean" ? "Vrai ou faux" : "Réponse écrite") + '</span></div><h3>' + esc(q.prompt) + '</h3>' + answer + '</article>';
  }).join("");
  renderShell('<button class="back-link" data-action="cancel-quiz">← Quitter le quiz</button><div class="quiz-runner-heading"><div><span class="eyebrow">SÉRIE EN COURS</span><h2>Concentre-toi, tu vas y arriver.</h2></div><span class="question-count">' + quiz.questions.length + ' questions</span></div><form id="quiz-form">' + cards + '<div class="quiz-submit-row"><p>Prends le temps de relire tes réponses avant de valider.</p><button class="btn btn-primary btn-large" type="submit">Corriger mes réponses →</button></div></form>', "Entraînement", "Réponds à chaque question puis valide ta série.");
}
function renderFlashcards() {
  const ready = state.flashWords.length >= 27 && state.rules.length >= 3;
  const content = '<section class="flash-intro"><div><span class="eyebrow">MÉMORISATION ACTIVE</span><h2>Le défi des 30 cartes</h2><p>27 mots à vérifier et 3 règles à réécrire. Chaque bonne réponse rapporte 0,5 point.</p><button class="btn btn-primary btn-large" data-action="start-flashcards" ' + (ready ? '' : 'disabled') + '>Commencer une séance →</button></div><div class="flash-intro-number">30</div></section>' +
    (!ready ? '<section class="panel"><p class="muted">La séance sera disponible dès que l’administrateur aura ajouté au moins 27 mots et enregistré 3 règles.</p></section>' : '<section class="panel"><strong>Comment jouer ?</strong><p class="muted">Mot correct : glisse à gauche dans la zone verte. Mot incorrect : glisse à droite dans la zone rouge. Tu peux aussi utiliser les boutons ou les flèches du clavier.</p><p class="muted">Aux questions 10, 20 et 30, réécris la règle demandée. Les mots importants sont vérifiés dans l’ordre, sans pénaliser les mots de liaison ou une petite faute de frappe.</p></section>');
  renderShell(content, "Flashcards", "Une séance rapide pour mémoriser les bonnes orthographes.");
}
function renderFlashRunner() {
  const session = state.flashSession;
  if (!session) { state.view = "flashcards"; return renderFlashcards(); }
  const card = session.cards[state.flashIndex];
  const progress = Math.round((state.flashIndex / 30) * 100);
  let face = card.kind === "word"
    ? '<div class="flash-word">' + esc(card.word) + '</div><p class="muted">Ce mot est-il correctement orthographié ?</p><div class="flash-zones"><div class="flash-zone zone-green">← Correct</div><div class="flash-zone zone-red">Incorrect →</div></div><div class="flash-actions"><button class="btn btn-success" data-action="flash-answer" data-answer="true">← Correct</button><button class="btn btn-danger" data-action="flash-answer" data-answer="false">Incorrect →</button></div>'
    : '<div class="flash-rule-label">QUESTION ' + (state.flashIndex + 1) + ' / 30 · RÈGLE À RÉÉCRIRE</div><h2>' + esc(card.title) + '</h2><p class="muted">Réécris la règle de mémoire, le plus fidèlement possible.</p><textarea id="flash-rule-answer" class="flash-rule-answer" rows="7" placeholder="Réécris la règle ici…"></textarea><button class="btn btn-primary btn-large" data-action="flash-rule-submit">Valider la règle →</button>';
  renderShell('<div class="flash-progress"><div><strong>Question ' + (state.flashIndex + 1) + ' / 30</strong><span>' + Math.round(state.flashIndex * 100 / 30) + ' %</span></div><div class="flash-progress-track"><span style="width:' + progress + '%"></span></div></div><section class="panel flash-card" id="flash-card" data-kind="' + card.kind + '">' + face + '</section><button class="back-link" data-action="cancel-flashcards">← Quitter la séance</button>', "Séance flashcards", "Prends ton temps : chaque réponse est enregistrée pour la correction finale.");
}
function renderFlashResult() {
  const result = state.flashResult;
  const mistakes = result.results.filter(r => !r.correct);
  const rows = result.results.map(r => '<article class="flash-result-row ' + (r.correct ? 'is-correct' : 'is-wrong') + '"><span>' + (r.correct ? '✓' : '×') + '</span><div><strong>Question ' + r.position + ' · ' + (r.kind === "word" ? esc(r.word) : esc(r.title)) + '</strong>' + (!r.correct ? (r.kind === "word" ? '<p>Réponse attendue : ' + esc(r.expected) + '</p>' : '<p>Règle attendue : ' + esc(r.expectedText) + '</p><details><summary>Ta réponse</summary><p>' + esc(r.answer) + '</p></details>') : '') + (r.explanation ? '<p>' + esc(r.explanation) + '</p>' : '') + (r.ruleId ? '<button class="link-button" data-action="flash-open-rule" data-id="' + esc(r.ruleId) + '">Voir la règle et ses exercices →</button>' : '') + '</div></article>').join("");
  renderShell('<section class="result-hero"><span class="eyebrow light-eyebrow">SÉANCE TERMINÉE</span><h2>' + (mistakes.length ? 'Voici ce que tu peux encore travailler.' : 'Excellent travail !') + '</h2><div class="result-score">+' + result.points.toFixed(1) + '<small> points</small></div><p>Score total : <strong>' + result.score + ' points</strong></p><p>' + (30 - mistakes.length) + ' bonnes réponses sur 30</p></section><section class="panel result-panel"><div class="panel-heading"><div><span class="eyebrow">CORRECTION</span><h2>' + mistakes.length + ' erreur' + (mistakes.length > 1 ? 's' : '') + ' à revoir</h2></div></div>' + (rows || '<p class="muted">Aucune réponse à corriger.</p>') + '</section><div class="result-actions"><button class="btn btn-primary" data-action="navigate" data-view="flashcards">Nouvelle séance</button><button class="btn btn-outline" data-action="navigate" data-view="rules">Revoir les règles</button></div>', "Résultat des flashcards", "Retrouve tes erreurs et entraîne-toi sur les règles associées.");
}
function answerFlashcard(answer) {
  state.flashAnswers.push(answer);
  if (state.flashIndex < 29) { state.flashIndex++; render(); return; }
  (async () => { try { const result = await api("/api/flashcards/submit", { method: "POST", body: { sessionId: state.flashSession.sessionId, answers: state.flashAnswers } }); state.flashResult = result; state.me.score = result.score; state.flashSession = null; await loadData(); state.view = "flash-result"; render(); } catch (error) { say(error.message, true); } })();
}
function renderDefinitionDetail() {
  const definition = state.definitions.find(item => item.id === state.selectedDefinition);
  if (!definition) { state.view = "rules"; return renderRules(); }
  const content = '<button class="back-link" data-action="navigate" data-view="rules">← Retour aux règles</button><section class="panel definition-detail"><span class="eyebrow">DÉFINITION</span><h2>' + esc(definition.word) + '</h2><p>' + esc(definition.definition).replace(/\n/g, "<br>") + '</p></section>';
  renderShell(content, "Définition", "Retrouve l’explication de ce mot.");
}
function renderQuizResult() {
  const result = state.quizResult;
  const rows = result.results.map((r, i) => '<article class="result-row ' + (r.correct ? "is-correct" : "is-wrong") + '"><div class="result-symbol">' + (r.correct ? "✓" : "×") + '</div><div><strong>Question ' + (i + 1) + ' · ' + (r.correct ? "Bonne réponse" : "À revoir") + '</strong>' + (r.correct ? '' : '<p>Réponse attendue : <b>' + esc(r.expected) + '</b></p>') + (r.explanation ? '<p>' + esc(r.explanation) + '</p>' : '') + '</div><span class="result-points">' + (r.correct ? "+1" : "−1") + '</span></article>').join("");
  renderShell('<section class="result-hero"><div class="result-trophy">✦</div><span class="eyebrow light-eyebrow">QUIZ TERMINÉ</span><h2>' + (result.total >= 0 ? "Bien joué, continue comme ça !" : "Chaque erreur aide à progresser.") + '</h2><div class="result-score">' + (result.total > 0 ? "+" : "") + result.total + '<small> points</small></div><p>Ton nouveau score : <strong>' + result.score + ' points</strong></p></section><section class="panel result-panel"><div class="panel-heading"><div><span class="eyebrow">CORRECTION</span><h2>Revoir les réponses</h2></div></div>' + rows + '</section><div class="result-actions"><button class="btn btn-primary" data-action="navigate" data-view="quizzes">Retour aux quiz</button><button class="btn btn-outline" data-action="navigate" data-view="rules">Revoir les règles</button></div>', "Résultat du quiz", "Voici ta correction détaillée.");
}
function renderRanking() {
  const rows = state.leaderboard.map((person, i) => '<div class="leader-row ' + (person.username === state.me.username ? "you-row" : "") + '"><span class="leader-place">' + (i === 0 ? "✦" : String(i + 1).padStart(2, "0")) + '</span><span class="avatar leader-avatar">' + initials(person.username) + '</span><div class="leader-name"><strong>' + esc(person.username) + (person.username === state.me.username ? ' <small>· toi</small>' : '') + '</strong><span>' + (i === 0 ? "En tête du classement" : "Membre de la classe") + '</span></div><strong class="leader-points">' + person.score + ' pts</strong></div>').join("");
  renderShell('<section class="ranking-hero"><span class="eyebrow light-eyebrow">PROGRESSION DE LA CLASSE</span><h2>Chaque point compte.</h2><p>Le classement se met à jour après chaque quiz corrigé.</p></section><section class="panel full-ranking"><div class="panel-heading"><div><span class="eyebrow">TOP DE LA CLASSE</span><h2>Classement général</h2></div><span class="panel-medal">♜</span></div>' + (rows || '<p class="muted">Pas encore de score enregistré.</p>') + '</section>', "Classement", "Découvre la progression de tous les comptes.");
}
async function loadChat() {
  const results = await Promise.all([api("/api/chat/messages"), api("/api/suggestions")]);
  state.chatMessages = results[0].messages || [];
  state.suggestions = results[1].suggestions || [];
}
function renderChat() {
  const tabs = '<div class="admin-tabs chat-tabs"><button class="' + (state.chatTab === "chat" ? "active" : "") + '" data-action="chat-tab" data-tab="chat">Discussion</button><button class="' + (state.chatTab === "suggestions" ? "active" : "") + '" data-action="chat-tab" data-tab="suggestions">Suggestions de mots</button></div>';
  let content = "";
  if (state.chatTab === "chat") {
    const messages = state.chatMessages.map(m => '<article class="chat-message"><div class="chat-message-head"><strong>' + esc(m.username) + (m.user_id === state.me.id ? ' <small>· toi</small>' : '') + '</strong><span>' + new Date(m.created_at).toLocaleString("fr-BE") + '</span>' + (m.user_id === state.me.id || state.me.role === "admin" ? '<button class="icon-button danger-icon" data-action="delete-chat-message" data-id="' + esc(m.id) + '" title="Supprimer le message">×</button>' : '') + '</div><p>' + esc(m.message).replace(/\n/g, "<br>") + '</p></article>').join("");
    content = '<section class="panel chat-panel"><div class="panel-heading"><div><span class="eyebrow">ÉCHANGER ENSEMBLE</span><h2>Discussion générale</h2></div><button class="btn btn-small btn-outline" data-action="refresh-chat">Actualiser</button></div><div class="chat-messages">' + (messages || '<p class="muted">Aucun message pour le moment. Lance la discussion !</p>') + '</div><form id="chat-form" class="chat-compose"><textarea name="message" maxlength="1000" rows="3" required placeholder="Écris ton message…"></textarea><button class="btn btn-primary" type="submit">Envoyer →</button></form><p class="muted small">Reste respectueux : ne partage pas d’informations personnelles et signale les messages inappropriés à l’administrateur.</p></section>';
  } else {
    const cards = state.suggestions.map(s => '<article class="suggestion-row"><div class="admin-list-copy"><strong>' + esc(s.word) + '</strong><span>Proposé par ' + esc(s.username) + ' · ' + new Date(s.created_at).toLocaleDateString("fr-BE") + '</span>' + (s.definition ? '<p>' + esc(s.definition) + '</p>' : '') + '</div><span class="suggestion-status status-' + esc(s.status) + '">' + (s.status === "pending" ? "En attente" : s.status === "accepted" ? "Acceptée" : "Refusée") + '</span>' + (state.me.role === "admin" && s.status === "pending" ? '<div class="suggestion-actions"><button class="btn btn-small btn-primary" data-action="review-suggestion" data-id="' + esc(s.id) + '" data-status="accepted">Accepter</button><button class="btn btn-small btn-outline" data-action="review-suggestion" data-id="' + esc(s.id) + '" data-status="rejected">Refuser</button></div>' : '') + '</article>').join("");
    content = '<section class="panel suggestion-form-panel"><div class="panel-heading"><div><span class="eyebrow">ENRICHIR LE LEXIQUE</span><h2>Proposer un mot à définir</h2></div><span class="admin-panel-icon">✦</span></div><p class="muted">Tu as rencontré un mot difficile ? Propose-le ici. L’administrateur pourra l’ajouter au dictionnaire.</p><form id="suggestion-form" class="form-stack"><label>Mot à proposer<input name="word" maxlength="100" required placeholder="Ex. orthographe"></label><label>Définition proposée <span class="optional">(facultatif)</span><textarea name="definition" rows="3" maxlength="1000" placeholder="Si tu connais sa signification, indique-la…"></textarea></label><button class="btn btn-primary" type="submit">Envoyer ma suggestion →</button></form></section><section class="panel admin-list-panel"><div class="panel-heading"><div><span class="eyebrow">PROPOSITIONS</span><h2>' + (state.me.role === "admin" ? "Suggestions de la classe" : "Mes suggestions") + '</h2></div><button class="btn btn-small btn-outline" data-action="refresh-chat">Actualiser</button></div>' + (cards || '<p class="muted">Aucune suggestion pour le moment.</p>') + '</section>';
  }
  renderShell(tabs + content, "Tchat", "Discute avec la classe et propose de nouveaux mots pour le dictionnaire.");
}
function getAdminRuleForm() {
  const rule = state.ruleDraft || state.editingRule || { title: "", sections: [{ name: "", rule: "", exception: "" }] };
  const sections = rule.sections.map((section, i) => '<div class="section-editor"><div class="editor-heading"><strong>Partie ' + (i + 1) + '</strong>' + (rule.sections.length > 1 ? '<button class="icon-button" type="button" data-action="remove-section" data-index="' + i + '" title="Supprimer cette partie">×</button>' : '') + '</div><label>Nom de la partie<input name="section-name-' + i + '" value="' + esc(section.name) + '" required placeholder="Ex. Le pluriel des noms"></label><label>Règle<textarea name="section-rule-' + i + '" required rows="3" placeholder="Explique la règle…">' + esc(section.rule) + '</textarea></label><label>Exception <span class="optional">(facultatif)</span><textarea name="section-exception-' + i + '" rows="2" placeholder="Ajoute une exception si nécessaire…">' + esc(section.exception) + '</textarea></label></div>').join("");
  return '<section class="panel admin-form-panel"><div class="panel-heading"><div><span class="eyebrow">' + (state.editingRule ? "MODIFICATION" : "NOUVELLE FICHE") + '</span><h2>' + (state.editingRule ? "Modifier une règle" : "Ajouter une règle") + '</h2></div></div><form id="rule-form"><label>Nom de la règle<input name="rule-title" value="' + esc(rule.title) + '" required maxlength="160" placeholder="Ex. L’accord du participe passé"></label><div id="section-editors">' + sections + '</div><div class="form-actions"><button class="btn btn-outline" type="button" data-action="add-section">+ Ajouter une partie</button><button class="btn btn-primary" type="submit">' + (state.editingRule ? "Enregistrer les modifications" : "Ajouter la règle") + '</button>' + (state.editingRule ? '<button class="text-button" type="button" data-action="cancel-edit-rule">Annuler</button>' : '') + '</div></form></section>';
}
function renderAdminRules() {
  const rows = state.rules.length ? state.rules.map((r, i) => '<div class="admin-list-row"><div class="rule-index">' + String(i + 1).padStart(2, "0") + '</div><div class="admin-list-copy"><strong>' + esc(r.title) + '</strong><span>' + r.sections.length + ' partie' + (r.sections.length > 1 ? 's' : '') + '</span></div><button class="btn btn-small btn-outline" data-action="edit-rule" data-id="' + esc(r.id) + '">Modifier</button><button class="icon-button danger-icon" data-action="delete-rule" data-id="' + esc(r.id) + '" title="Supprimer">×</button></div>').join("") : '<p class="muted">Aucune règle enregistrée.</p>';
  return getAdminRuleForm() + '<section class="panel admin-list-panel"><div class="panel-heading"><div><span class="eyebrow">CONTENU PUBLIÉ</span><h2>Règles enregistrées</h2></div><span class="count-pill">' + state.rules.length + ' / 60</span></div>' + rows + '</section>';
}
function renderAdminExercises() {
  return '<section class="panel admin-form-panel"><div class="panel-heading"><div><span class="eyebrow">NOUVELLE SÉRIE</span><h2>Ajouter des exercices</h2></div><span class="admin-panel-icon">✎</span></div><p class="muted">Colle ici la série JSON que je t’aurai préparée à partir de la règle étudiée. La correction reste enregistrée côté serveur.</p><form id="exercise-form" class="form-stack"><label>Règle associée<select name="exercise-rule" required><option value="">Choisir une règle…</option>' + state.rules.map(r => '<option value="' + esc(r.id) + '">' + esc(r.title) + '</option>').join("") + '</select></label><label>Nom de la série<input name="exercise-title" required maxlength="160" placeholder="Ex. Entraînement — Les pluriels"></label><label>Petite description <span class="optional">(facultatif)</span><input name="exercise-description" maxlength="500" placeholder="QCM, vrai/faux, phrases à compléter…"></label><label>Exercices au format JSON<textarea name="exercise-json" rows="15" spellcheck="false" required placeholder="Colle ici le JSON complet préparé pour ta règle…"></textarea></label><div class="json-help"><strong>Formats acceptés</strong><p><code>choice</code> : QCM avec <code>options</code> et <code>answer</code> (numéro de la bonne option, en commençant à 0).</p><p><code>boolean</code> : vrai/faux avec <code>answer: true</code> ou <code>false</code>.</p><p><code>text</code> : réponse écrite avec <code>accepted</code> (liste des réponses acceptées).</p><p>Chaque série doit contenir entre 3 et 30 questions. Une explication par réponse est vivement conseillée.</p></div><button class="btn btn-primary" type="submit">Enregistrer la série d’exercices →</button></form></section><section class="panel admin-list-panel"><div class="panel-heading"><div><span class="eyebrow">SÉRIES PUBLIÉES</span><h2>Exercices existants</h2></div></div>' + (state.exercises.length ? state.exercises.map(e => '<div class="admin-list-row"><div class="admin-list-copy"><strong>' + esc(e.title) + '</strong><span>' + esc(e.rule_title) + '</span></div><button class="icon-button danger-icon" data-action="delete-exercise" data-id="' + esc(e.id) + '" title="Supprimer">×</button></div>').join("") : '<p class="muted">Aucune série publiée pour le moment.</p>') + '</section>';
}
function renderAdminDefinitions() {
  const current = state.editingDefinition || { word: "", definition: "" };
  const rows = state.definitions.length ? state.definitions.map(item =>
    '<div class="admin-list-row"><div class="admin-list-copy"><strong>' + esc(item.word) + '</strong><span>' + esc(item.definition) + '</span></div><button class="btn btn-small btn-outline" data-action="edit-definition" data-id="' + esc(item.id) + '">Modifier</button><button class="icon-button danger-icon" data-action="delete-definition" data-id="' + esc(item.id) + '" title="Supprimer">×</button></div>'
  ).join("") : '<p class="muted">Aucun mot défini pour le moment.</p>';
  return '<section class="panel admin-form-panel"><div class="panel-heading"><div><span class="eyebrow">' + (state.editingDefinition ? "MODIFICATION" : "NOUVEAU MOT") + '</span><h2>' + (state.editingDefinition ? "Modifier la définition" : "Ajouter un mot") + '</h2></div></div><form id="definition-form" class="form-stack"><label>Mot<input name="definition-word" required maxlength="100" value="' + esc(current.word) + '" placeholder="Ex. syllabe"></label><label>Définition<textarea name="definition-text" required maxlength="3000" rows="4" placeholder="Écris la définition du mot…">' + esc(current.definition) + '</textarea></label><div class="form-actions"><button class="btn btn-primary" type="submit">' + (state.editingDefinition ? "Enregistrer les modifications" : "Ajouter le mot") + '</button>' + (state.editingDefinition ? '<button class="text-button" type="button" data-action="cancel-edit-definition">Annuler</button>' : '') + '</div></form><p class="muted small">Chaque occurrence du mot dans les leçons sera soulignée en pointillés. Un clic ouvrira sa définition.</p></section><section class="panel admin-list-panel"><div class="panel-heading"><div><span class="eyebrow">LEXIQUE</span><h2>Mots enregistrés</h2></div><span class="count-pill">' + state.definitions.length + '</span></div>' + rows + '</section>';
}
function renderAdminFlashcards() {
  const rows = state.flashWords.map(w => '<div class="admin-list-row"><div class="admin-list-copy"><strong>' + esc(w.word) + '</strong><span>' + esc(w.rule_title) + ' · ' + (w.is_correct ? 'Orthographe correcte' : 'Orthographe incorrecte') + '</span></div><button class="icon-button danger-icon" data-action="delete-flash-word" data-id="' + esc(w.id) + '" title="Supprimer">×</button></div>').join("");
  return '<section class="panel admin-form-panel"><div class="panel-heading"><div><span class="eyebrow">NOUVELLE CARTE</span><h2>Ajouter un mot</h2></div></div><p class="muted">Ajoute les graphies correctes et incorrectes avec leur règle associée. Prévois au moins 27 mots pour permettre une séance complète.</p><form id="flashcard-word-form" class="form-stack"><label>Règle associée<select name="ruleId" required><option value="">Choisir une règle…</option>' + state.rules.map(r => '<option value="' + esc(r.id) + '">' + esc(r.title) + '</option>').join("") + '</select></label><label>Mot affiché<input name="word" required maxlength="100" placeholder="Ex. aparence"></label><label>Orthographe du mot<select name="isCorrect"><option value="true">Correctement orthographié</option><option value="false">Incorrectement orthographié</option></select></label><label>Explication de la correction <span class="optional">(facultatif)</span><input name="explanation" maxlength="500" placeholder="Ex. Il faut deux p."></label><button class="btn btn-primary" type="submit">Ajouter cette carte →</button></form></section><section class="panel admin-list-panel"><div class="panel-heading"><div><span class="eyebrow">BANQUE DE MOTS</span><h2>Mots disponibles</h2></div><span class="count-pill">' + state.flashWords.length + '</span></div>' + (rows || '<p class="muted">Aucun mot ajouté pour le moment.</p>') + '</section>';
}
function renderAdminUsers() {
  return '<section class="panel admin-list-panel"><div class="panel-heading"><div><span class="eyebrow">COMPTES INSCRITS</span><h2>Élèves et scores</h2></div><span class="count-pill">' + state.users.length + ' compte' + (state.users.length > 1 ? 's' : '') + '</span></div>' +
    (state.users.length ? state.users.map(u => '<div class="admin-list-row"><div class="avatar">' + initials(u.username) + '</div><div class="admin-list-copy"><strong>' + esc(u.username) + '</strong><span>' + (u.role === "admin" ? "Administrateur" : "Élève") + '</span></div><strong class="leader-points">' + u.score + ' pts</strong></div>').join("") : '<p class="muted">Aucun compte pour le moment.</p>') + '</section>';
}
function renderAdmin() {
  const tabs = '<div class="admin-tabs"><button class="' + (state.adminTab === "rules" ? "active" : "") + '" data-action="admin-tab" data-tab="rules">Règles</button><button class="' + (state.adminTab === "exercises" ? "active" : "") + '" data-action="admin-tab" data-tab="exercises">Exercices</button><button class="' + (state.adminTab === "flashcards" ? "active" : "") + '" data-action="admin-tab" data-tab="flashcards">Flashcards</button><button class="' + (state.adminTab === "definitions" ? "active" : "") + '" data-action="admin-tab" data-tab="definitions">Définitions</button><button class="' + (state.adminTab === "users" ? "active" : "") + '" data-action="admin-tab" data-tab="users">Comptes</button></div>';
  let content = state.adminTab === "rules" ? renderAdminRules() : state.adminTab === "exercises" ? renderAdminExercises() : state.adminTab === "flashcards" ? renderAdminFlashcards() : state.adminTab === "definitions" ? renderAdminDefinitions() : renderAdminUsers();
  renderShell('<div class="admin-welcome"><div><span class="eyebrow light-eyebrow">ESPACE PRIVÉ</span><h2>Le tableau de bord admin.</h2><p>Gère les règles, prépare les entraînements et suis les scores de la classe.</p></div><div class="admin-lock">⚙</div></div>' + tabs + content, "Administration", "Cette zone est réservée au compte administrateur.");
}
function renderAccount() {
  const content = '<section class="panel account-panel"><div class="panel-heading"><div><span class="eyebrow">PARAMÈTRES PERSONNELS</span><h2>Modifier mon compte</h2></div><div class="account-icon">⚙</div></div><p class="muted">Tu peux changer ton pseudo et ton mot de passe. Ton score et tes résultats seront conservés.</p><form id="account-form" class="form-stack"><label>Nouveau pseudo<input name="username" value="' + esc(state.me.username) + '" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_-]+"></label><label>Mot de passe actuel<input name="current-password" type="password" autocomplete="current-password" required></label><div class="account-divider"></div><label>Nouveau mot de passe <span class="optional">(facultatif)</span><input name="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="200" placeholder="8 caractères minimum"></label><label>Confirmer le nouveau mot de passe<input name="confirm-password" type="password" autocomplete="new-password" minlength="8" maxlength="200" placeholder="Retape ton nouveau mot de passe"></label><div class="form-actions"><button class="btn btn-primary" type="submit">Enregistrer les modifications</button></div></form></section>';
  renderShell(content, "Mon compte", "Gère ton pseudo et ton mot de passe.");
}
function render() {
  if (!state.me) return renderAuth();
  if (state.view === "home") return renderHome();
  if (state.view === "rules") return renderRules();
  if (state.view === "rule-detail") return renderRuleDetail();
  if (state.view === "definition-detail") return renderDefinitionDetail();
  if (state.view === "flashcards") return renderFlashcards();
  if (state.view === "flash-runner") return renderFlashRunner();
  if (state.view === "flash-result") return renderFlashResult();
  if (state.view === "quizzes") return renderQuizzes();
  if (state.view === "quiz-runner") return renderQuizRunner();
  if (state.view === "quiz-result") return renderQuizResult();
  if (state.view === "ranking") return renderRanking();
  if (state.view === "chat") return renderChat();
  if (state.view === "account") return renderAccount();
  if (state.view === "admin" && state.me.role === "admin") return renderAdmin();
  state.view = "home";
  renderHome();
}
async function loadData() {
  const results = await Promise.all([
    api("/api/rules"), api("/api/exercises"), api("/api/leaderboard"), api("/api/definitions"), api("/api/flashcards/words")
  ]);
  state.rules = results[0].rules || [];
  state.exercises = results[1].exercises || [];
  state.leaderboard = results[2].leaderboard || [];
  state.definitions = results[3].definitions || [];
  state.flashWords = results[4].words || [];
  if (state.me.role === "admin") {
    const admin = await api("/api/admin/users");
    state.users = admin.users || [];
  }
}
async function refreshMe() {
  const data = await api("/api/me");
  state.me = data.user;
  state.adminSetupAvailable = data.adminSetupAvailable;
  if (state.me) await loadData();
  render();
}
function collectRule(form) {
  const data = new FormData(form);
  const title = String(data.get("rule-title") || "").trim();
  const sections = [];
  const editors = form.querySelectorAll(".section-editor");
  editors.forEach((editor, i) => sections.push({
    name: String(data.get("section-name-" + i) || "").trim(),
    rule: String(data.get("section-rule-" + i) || "").trim(),
    exception: String(data.get("section-exception-" + i) || "").trim()
  }));
  return { title, sections };
}
async function startQuiz(id) {
  try {
    const data = await api("/api/quiz/start", { method: "POST", body: { exerciseSetId: id } });
    state.activeQuiz = data;
    state.quizResult = null;
    state.view = "quiz-runner";
    state.error = ""; state.notice = "";
    render();
  } catch (error) { say(error.message, true); }
}
root.addEventListener("click", async function (event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  state.error = ""; state.notice = "";
  if (action === "auth-login") { state.authMode = "login"; render(); }
  if (action === "auth-register") { state.authMode = "register"; render(); }
  if (action === "setup-mode") { state.setupMode = true; render(); }
  if (action === "back-auth") { state.setupMode = false; render(); }
  if (action === "navigate") {
    const view = button.dataset.view;
    if (view === "admin" && state.me.role !== "admin") return;
    state.view = view; state.activeQuiz = null; state.quizResult = null;
    if (view === "chat") { try { await loadChat(); } catch (error) { say(error.message, true); return; } }
    render();
  }
  if (action === "logout") {
    try { await api("/api/auth/logout", { method: "POST", body: {} }); } catch {}
    state.me = null; state.view = "home"; state.authMode = "login"; state.error = ""; state.notice = "";
    await refreshMe();
  }
  if (action === "open-rule") { state.selectedRule = button.dataset.id; state.view = "rule-detail"; render(); }
  if (action === "open-definition") { state.selectedDefinition = button.dataset.id; state.view = "definition-detail"; render(); }
  if (action === "start-quiz") await startQuiz(button.dataset.id);
  if (action === "start-flashcards") {
    try { const data = await api("/api/flashcards/start", { method: "POST", body: {} }); state.flashSession = data; state.flashIndex = 0; state.flashAnswers = []; state.view = "flash-runner"; render(); }
    catch (error) { say(error.message, true); }
  }
  if (action === "flash-answer") answerFlashcard(button.dataset.answer === "true");
  if (action === "flash-rule-submit") answerFlashcard(document.getElementById("flash-rule-answer")?.value || "");
  if (action === "cancel-flashcards") { state.flashSession = null; state.view = "flashcards"; render(); }
  if (action === "flash-open-rule") { state.selectedRule = button.dataset.id; state.view = "rule-detail"; state.flashResult = null; render(); }
  if (action === "cancel-quiz") { state.activeQuiz = null; state.view = "quizzes"; render(); }
  if (action === "chat-tab") { state.chatTab = button.dataset.tab; try { await loadChat(); render(); } catch (error) { say(error.message, true); } }
  if (action === "refresh-chat") { try { await loadChat(); render(); } catch (error) { say(error.message, true); } }
  if (action === "delete-chat-message") {
    if (!confirm("Supprimer ce message ?")) return;
    try { await api("/api/chat/messages/" + encodeURIComponent(button.dataset.id), { method: "DELETE" }); await loadChat(); render(); }
    catch (error) { say(error.message, true); }
  }
  if (action === "review-suggestion") {
    const label = button.dataset.status === "accepted" ? "accepter cette suggestion et l’ajouter au dictionnaire" : "refuser cette suggestion";
    if (!confirm("Confirmer : " + label + " ?")) return;
    try { await api("/api/admin/suggestions/" + encodeURIComponent(button.dataset.id), { method: "PATCH", body: { status: button.dataset.status } }); await loadData(); await loadChat(); say(button.dataset.status === "accepted" ? "Suggestion acceptée et mot ajouté au dictionnaire." : "Suggestion refusée."); }
    catch (error) { say(error.message, true); }
  }
  if (action === "admin-tab") { state.adminTab = button.dataset.tab; state.editingRule = null; state.ruleDraft = null; state.editingDefinition = null; render(); }
  if (action === "edit-definition") { state.editingDefinition = state.definitions.find(item => item.id === button.dataset.id) || null; state.adminTab = "definitions"; render(); }
  if (action === "cancel-edit-definition") { state.editingDefinition = null; render(); }
  if (action === "delete-definition") {
    if (!confirm("Supprimer cette définition ?")) return;
    try { await api("/api/admin/definitions/" + encodeURIComponent(button.dataset.id), { method: "DELETE" }); state.editingDefinition = null; await loadData(); say("Définition supprimée."); }
    catch (error) { say(error.message, true); }
  }
  if (action === "add-section") {
    const rule = collectRule(document.getElementById("rule-form"));
    rule.sections.push({ name: "", rule: "", exception: "" });
    state.ruleDraft = rule; render();
  }
  if (action === "remove-section") {
    const form = document.getElementById("rule-form");
    const rule = collectRule(form);
    rule.sections.splice(Number(button.dataset.index), 1);
    if (!rule.sections.length) rule.sections.push({ name: "", rule: "", exception: "" });
    state.ruleDraft = rule; render();
  }
  if (action === "edit-rule") {
    state.editingRule = state.rules.find(r => r.id === button.dataset.id) || null;
    state.ruleDraft = null; state.adminTab = "rules"; render();
  }
  if (action === "cancel-edit-rule") { state.editingRule = null; state.ruleDraft = null; render(); }
  if (action === "delete-rule") {
    if (!confirm("Supprimer cette règle et ses séries d’exercices associées ?")) return;
    try { await api("/api/admin/rules/" + encodeURIComponent(button.dataset.id), { method: "DELETE" }); await loadData(); say("Règle supprimée."); }
    catch (error) { say(error.message, true); }
  }
  if (action === "delete-flash-word") {
    if (!confirm("Supprimer ce mot de la banque de flashcards ?")) return;
    try { await api("/api/admin/flashcards/words/" + encodeURIComponent(button.dataset.id), { method: "DELETE" }); await loadData(); say("Mot supprimé."); } catch (error) { say(error.message, true); }
  }
  if (action === "delete-exercise") {
    if (!confirm("Supprimer cette série d’exercices ?")) return;
    try { await api("/api/admin/exercises/" + encodeURIComponent(button.dataset.id), { method: "DELETE" }); await loadData(); say("Série supprimée."); }
    catch (error) { say(error.message, true); }
  }
});
root.addEventListener("pointerdown", function(event) {
  const card = event.target.closest("#flash-card[data-kind='word']");
  if (card) state.flashDragStart = event.clientX;
});
root.addEventListener("pointerup", function(event) {
  if (state.flashDragStart === null || state.view !== "flash-runner") return;
  const delta = event.clientX - state.flashDragStart;
  state.flashDragStart = null;
  if (Math.abs(delta) < 65) return;
  answerFlashcard(delta < 0);
});
document.addEventListener("keydown", function(event) {
  if (state.view !== "flash-runner" || state.flashSession?.cards[state.flashIndex]?.kind !== "word") return;
  if (event.key === "ArrowLeft") { event.preventDefault(); answerFlashcard(true); }
  if (event.key === "ArrowRight") { event.preventDefault(); answerFlashcard(false); }
});
root.addEventListener("submit", async function (event) {
  const form = event.target;
  event.preventDefault();
  state.error = ""; state.notice = "";
  try {
    if (form.id === "flashcard-word-form") {
      const data = new FormData(form);
      await api("/api/admin/flashcards/words", { method: "POST", body: { ruleId: data.get("ruleId"), word: data.get("word"), isCorrect: data.get("isCorrect") === "true", explanation: data.get("explanation") } });
      await loadData(); say("Mot ajouté aux flashcards.");
    }
    if (form.id === "chat-form") {
      const data = new FormData(form);
      await api("/api/chat/messages", { method: "POST", body: { message: data.get("message") } });
      await loadChat(); render();
    }
    if (form.id === "suggestion-form") {
      const data = new FormData(form);
      await api("/api/suggestions", { method: "POST", body: { word: data.get("word"), definition: data.get("definition") } });
      await loadChat(); say("Ta suggestion a bien été envoyée à l’administrateur.");
    }
    if (form.id === "account-form") {
      const data = new FormData(form);
      const newPassword = String(data.get("new-password") || "");
      const confirmPassword = String(data.get("confirm-password") || "");
      if (newPassword !== confirmPassword) throw new Error("Les deux nouveaux mots de passe ne correspondent pas.");
      const result = await api("/api/account", { method: "PATCH", body: {
        username: data.get("username"),
        currentPassword: data.get("current-password"),
        newPassword
      }});
      state.me = result.user;
      await loadData();
      say("Ton compte a bien été mis à jour.");
    }
    if (form.id === "auth-form") {
      const data = new FormData(form);
      const endpoint = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      await api(endpoint, { method: "POST", body: { username: data.get("username"), password: data.get("password") } });
      await refreshMe();
    }
    if (form.id === "setup-form") {
      const data = new FormData(form);
      const result = await api("/api/admin/setup", { method: "POST", body: {
        username: data.get("username"), password: data.get("password"), setupKey: data.get("setupKey")
      }});
      state.setupMode = false; state.authMode = "login"; state.notice = result.message; render();
    }
    if (form.id === "rule-form") {
      const payload = collectRule(form);
      if (state.editingRule) {
        await api("/api/admin/rules/" + encodeURIComponent(state.editingRule.id), { method: "PUT", body: payload });
        state.editingRule = null; state.ruleDraft = null; await loadData(); say("Règle mise à jour.");
      } else {
        await api("/api/admin/rules", { method: "POST", body: payload });
        state.ruleDraft = null; state.editingRule = null; await loadData(); say("Règle ajoutée.");
      }
    }
    if (form.id === "exercise-form") {
      const data = new FormData(form);
      let questions;
      try { questions = JSON.parse(data.get("exercise-json")); }
      catch { throw new Error("Le JSON n’est pas valide. Vérifie les virgules et les guillemets."); }
      await api("/api/admin/exercises", { method: "POST", body: {
        ruleId: data.get("exercise-rule"), title: data.get("exercise-title"),
        description: data.get("exercise-description"), questions: questions
      }});
      await loadData(); say("Série d’exercices publiée avec succès.");
    }
    if (form.id === "definition-form") {
      const data = new FormData(form);
      const payload = { word: data.get("definition-word"), definition: data.get("definition-text") };
      if (state.editingDefinition) {
        await api("/api/admin/definitions/" + encodeURIComponent(state.editingDefinition.id), { method: "PUT", body: payload });
        state.editingDefinition = null;
        await loadData(); say("Définition mise à jour.");
      } else {
        await api("/api/admin/definitions", { method: "POST", body: payload });
        await loadData(); say("Mot ajouté au lexique.");
      }
    }
    if (form.id === "quiz-form") {
      const quiz = state.activeQuiz;
      const answers = quiz.questions.map((q, i) => {
        if (q.type === "text") return String(form.elements["answer-" + i].value || "").trim();
        const selected = form.querySelector('input[name="answer-' + i + '"]:checked');
        if (!selected) return null;
        if (q.type === "boolean") return selected.value === "true";
        return Number(selected.value);
      });
      if (answers.some(answer => answer === null || answer === "")) throw new Error("Réponds à toutes les questions avant de valider.");
      const result = await api("/api/quiz/submit", { method: "POST", body: { sessionId: quiz.sessionId, answers: answers } });
      state.quizResult = result;
      state.me.score = result.score;
      state.activeQuiz = null;
      await loadData();
      state.view = "quiz-result"; render();
    }
  } catch (error) { say(error.message, true); }
});
(async function init() {
  try { await refreshMe(); }
  catch (error) {
    root.innerHTML = '<div class="auth-page"><div class="auth-card"><div class="brand">' + logo() + '</div><h1>Le site n’est pas encore configuré.</h1><p>' + esc(error.message) + '</p><p class="muted">Vérifie la connexion à la base D1 en suivant le guide du dépôt.</p></div></div>';
  }
})();