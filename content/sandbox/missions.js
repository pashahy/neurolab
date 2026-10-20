// Мини-миссии терминала (песочница, без очков). Формат: docs/superpowers/specs/2026-10-16-sandbox-v1-1-design.md § 4.
// setup/goals — как у задания terminal (GOAL_KINDS из js/sim/shell.js); solution — команды, которые проверяет tests/missions.test.js.
// Файл публичный: очков за миссии нет, поэтому решения можно хранить рядом.
const GIT = { 'user.name': 'Студент', 'user.email': 'student@neurolab.example' };

export default [
  {
    id: 'm01-find-report',
    title: 'Где отчёт?',
    story: [
      { who: 'anna', text: 'Привет! Мне срочно нужен отчёт за 2024 год. Он где-то в папке office, но я забыла где.' },
      { who: 'anna', text: 'Найди его: заходи в папки через cd, смотри содержимое через ls и прочитай файл командой cat.' },
    ],
    setup: {
      files: {
        'office/readme.txt': 'Архив компании НейроЛаб.\n',
        'office/archive/2023/report.txt': 'Отчёт за 2023 год.\n',
        'office/archive/2024/report.txt': 'Отчёт за 2024 год: проектов стало вдвое больше.\n',
      },
    },
    goals: [
      { text: 'Зайти в папку office/archive/2024', kind: 'cwd', path: '~/office/archive/2024' },
      { text: 'Прочитать файл report.txt (cat)', kind: 'used', cmd: 'cat report.txt' },
    ],
    hint: 'Начни с ls, чтобы увидеть папки. Потом cd office, cd archive, cd 2024. Файл читается командой cat report.txt.',
    solution: ['ls', 'cd office', 'ls', 'cd archive', 'cd 2024', 'ls', 'cat report.txt'],
  },
  {
    id: 'm02-files',
    title: 'Файлы: создать, перенести, удалить',
    story: [
      { who: 'max', text: 'В папке work бардак. Черновик лежит где попало, а старый журнал только мешает.' },
      { who: 'max', text: 'Сделай папку docs, убери туда draft.txt, удали old.log и заведи пустой notes.txt.' },
    ],
    setup: {
      cwd: '~/work',
      files: { 'work/draft.txt': 'Черновик договора.\n', 'work/old.log': 'старый журнал\n' },
    },
    goals: [
      { text: 'Создать папку docs', kind: 'dir', path: '~/work/docs' },
      { text: 'Перенести draft.txt в docs', kind: 'file', path: '~/work/docs/draft.txt' },
      { text: 'Удалить old.log', kind: 'noFile', path: '~/work/old.log' },
      { text: 'Создать пустой файл notes.txt', kind: 'file', path: '~/work/notes.txt' },
    ],
    hint: 'mkdir создаёт папку, mv файл куда — переносит, rm удаляет, touch создаёт пустой файл.',
    solution: ['mkdir docs', 'mv draft.txt docs', 'rm old.log', 'touch notes.txt'],
  },
  {
    id: 'm03-sort-downloads',
    title: 'Разбор загрузок',
    story: [
      { who: 'lena', text: 'Папка downloads превратилась в свалку: фото, документы и музыка вперемешку.' },
      { who: 'lena', text: 'Разложи всё по трём папкам: photos, docs и music.' },
    ],
    setup: {
      cwd: '~/downloads',
      files: {
        'downloads/photo1.jpg': 'jpg1',
        'downloads/photo2.jpg': 'jpg2',
        'downloads/report.txt': 'Отчёт.\n',
        'downloads/notes.txt': 'Заметки.\n',
        'downloads/song.mp3': 'mp3',
      },
    },
    goals: [
      { text: 'photo1.jpg лежит в photos', kind: 'file', path: '~/downloads/photos/photo1.jpg' },
      { text: 'photo2.jpg лежит в photos', kind: 'file', path: '~/downloads/photos/photo2.jpg' },
      { text: 'report.txt лежит в docs', kind: 'file', path: '~/downloads/docs/report.txt' },
      { text: 'notes.txt лежит в docs', kind: 'file', path: '~/downloads/docs/notes.txt' },
      { text: 'song.mp3 лежит в music', kind: 'file', path: '~/downloads/music/song.mp3' },
    ],
    hint: 'Сначала mkdir photos docs music (можно сразу три). Потом mv по одному файлу: mv photo1.jpg photos.',
    solution: ['mkdir photos docs music', 'mv photo1.jpg photos', 'mv photo2.jpg photos', 'mv report.txt docs', 'mv notes.txt docs', 'mv song.mp3 music'],
  },
  {
    id: 'm04-git-init',
    title: 'Первый репозиторий',
    story: [
      { who: 'dima', text: 'У нас новый сайт, а истории изменений нет. Исправим: подключим git.' },
      { who: 'dima', text: 'Сначала представься git: имя и почта. Потом создай репозиторий в папке site.' },
    ],
    setup: {
      cwd: '~/site',
      files: { 'site/index.html': '<h1>Сайт НейроЛаб</h1>\n', 'site/style.css': 'h1 { color: navy; }\n' },
    },
    goals: [
      { text: 'Указать имя: git config --global user.name', kind: 'config', key: 'user.name' },
      { text: 'Указать почту: git config --global user.email', kind: 'config', key: 'user.email' },
      { text: 'Создать репозиторий в папке site', kind: 'gitInit', path: '~/site' },
    ],
    hint: 'git config --global user.name "Твоё Имя", затем то же для user.email, и git init.',
    solution: ['git config --global user.name "Студент"', 'git config --global user.email "student@example.com"', 'git init'],
  },
  {
    id: 'm05-first-commit',
    title: 'Первый коммит',
    story: [
      { who: 'dima', text: 'Репозиторий готов, но он пока пустой. Сохраним первую версию сайта.' },
      { who: 'dima', text: 'Добавь файлы в индекс (git add) и сделай коммит с понятным сообщением.' },
    ],
    setup: {
      cwd: '~/site',
      gitConfig: GIT,
      files: { 'site/index.html': '<h1>Сайт НейроЛаб</h1>\n', 'site/style.css': 'h1 { color: navy; }\n' },
      commands: ['git init'],
    },
    goals: [
      { text: 'index.html под контролем git', kind: 'tracked', path: 'index.html' },
      { text: 'style.css под контролем git', kind: 'tracked', path: 'style.css' },
      { text: 'Сделать первый коммит', kind: 'commits', min: 1 },
      { text: 'Не оставить несохранённых изменений', kind: 'clean' },
    ],
    hint: 'git add . добавляет всё сразу. Потом git commit -m "Первый коммит". Проверь результат через git status.',
    solution: ['git status', 'git add .', 'git commit -m "Первый коммит"'],
  },
  {
    id: 'm06-second-commit',
    title: 'Правка и второй коммит',
    story: [
      { who: 'max', text: 'В списке дел не хватает одного пункта. Допиши его и сохрани новую версию.' },
      { who: 'max', text: 'Добавь в todo.txt строку «сделать ПЗ», сделай коммит и посмотри историю через git log.' },
    ],
    setup: {
      cwd: '~/notes',
      gitConfig: GIT,
      files: { 'notes/todo.txt': 'купить молоко\n' },
      commands: ['git init', 'git add .', 'git commit -m "Первый коммит"'],
    },
    goals: [
      { text: 'В todo.txt появилась строка «сделать ПЗ»', kind: 'file', path: '~/notes/todo.txt', contains: 'сделать ПЗ' },
      { text: 'Сделать второй коммит', kind: 'commits', min: 2 },
      { text: 'Посмотреть историю: git log', kind: 'used', cmd: 'git log' },
      { text: 'Не оставить несохранённых изменений', kind: 'clean' },
    ],
    hint: 'echo "сделать ПЗ" >> todo.txt дописывает строку в конец файла. Потом git add todo.txt, git commit -m "..." и git log --oneline.',
    solution: ['echo "сделать ПЗ" >> todo.txt', 'git add todo.txt', 'git commit -m "Дополнил список дел"', 'git log --oneline'],
  },
  {
    id: 'm07-unstage',
    title: 'Лишний файл в индексе',
    story: [
      { who: 'olga', text: 'Коллега по привычке сделал git add . Вместе с заметками в индекс попал secrets.txt с паролем.' },
      { who: 'olga', text: 'Убери secrets.txt из индекса командой git restore --staged, а остальное закоммить. Пароль в историю попадать не должен.' },
      { who: 'olga', text: 'В настоящем git для таких файлов есть .gitignore.' },
    ],
    setup: {
      cwd: '~/app',
      gitConfig: GIT,
      files: { 'app/app.py': 'print("привет")\n' },
      commands: ['git init', 'git add app.py', 'git commit -m "Первый коммит"', 'echo "план на неделю" > notes.txt', 'echo PASSWORD=12345 > secrets.txt', 'git add .'],
    },
    goals: [
      { text: 'Убрать secrets.txt из индекса', kind: 'used', cmd: 'git restore --staged secrets.txt' },
      { text: 'notes.txt под контролем git', kind: 'tracked', path: 'notes.txt' },
      { text: 'Сделать второй коммит', kind: 'commits', min: 2 },
    ],
    hint: 'Посмотри git status. Затем git restore --staged secrets.txt и git commit -m "Добавил заметки".',
    solution: ['git status', 'git restore --staged secrets.txt', 'git commit -m "Добавил заметки"', 'git status'],
  },
  {
    id: 'm08-branch',
    title: 'Ветка для новой функции',
    story: [
      { who: 'dima', text: 'Мы делаем корзину для магазина. Пробовать новое прямо в main опасно.' },
      { who: 'dima', text: 'Создай ветку feature-cart и перейди на неё.' },
    ],
    setup: {
      cwd: '~/shop',
      gitConfig: GIT,
      files: { 'shop/index.html': '<h1>Магазин</h1>\n' },
      commands: ['git init', 'git add .', 'git commit -m "Первый коммит"'],
    },
    goals: [
      { text: 'Создать ветку feature-cart', kind: 'branch', name: 'feature-cart' },
      { text: 'Перейти на неё', kind: 'onBranch', name: 'feature-cart' },
    ],
    hint: 'git branch feature-cart создаёт ветку, git switch feature-cart переходит. Или одной командой: git switch -c feature-cart.',
    solution: ['git branch', 'git branch feature-cart', 'git switch feature-cart'],
  },
  {
    id: 'm09-branch-commit',
    title: 'Коммит в своей ветке',
    story: [
      { who: 'anna', text: 'Нужен поиск по магазину. Делаем в отдельной ветке feature-search, а main пока не трогаем.' },
      { who: 'anna', text: 'Создай ветку, добавь файл search.html и закоммить его.' },
    ],
    setup: {
      cwd: '~/shop',
      gitConfig: GIT,
      files: { 'shop/index.html': '<h1>Магазин</h1>\n' },
      commands: ['git init', 'git add .', 'git commit -m "Первый коммит"'],
    },
    goals: [
      { text: 'Перейти на новую ветку feature-search', kind: 'onBranch', name: 'feature-search' },
      { text: 'Создать файл search.html', kind: 'file', path: '~/shop/search.html' },
      { text: 'Сделать коммит в этой ветке', kind: 'commits', min: 2 },
      { text: 'Не оставить несохранённых изменений', kind: 'clean' },
    ],
    hint: 'git switch -c feature-search создаст ветку и сразу перейдёт на неё. Потом файл, git add, git commit.',
    solution: ['git switch -c feature-search', 'echo "<h2>Поиск</h2>" > search.html', 'git add search.html', 'git commit -m "Добавил поиск"', 'git log --oneline'],
  },
  {
    id: 'm10-env',
    title: 'Переменные окружения',
    story: [
      { who: 'viktor', text: 'Перед запуском сервиса нужно задать окружение: режим работы и порт.' },
      { who: 'viktor', text: 'Посмотри, что уже есть (env), включи режим production и порт 8080. Потом проверь результат.' },
    ],
    setup: { env: { APP_ENV: 'development' } },
    goals: [
      { text: 'Посмотреть переменные: env', kind: 'used', cmd: 'env' },
      { text: 'APP_ENV равна production', kind: 'env', name: 'APP_ENV', value: 'production' },
      { text: 'PORT равна 8080', kind: 'env', name: 'PORT', value: '8080' },
    ],
    hint: 'export APP_ENV=production и export PORT=8080 — без пробелов вокруг знака «=». Проверь через env.',
    solution: ['env', 'export APP_ENV=production', 'export PORT=8080', 'env'],
  },
];
