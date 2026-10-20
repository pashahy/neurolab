// Квест НейроЛаба, глава 2: публичная часть. Секреты — apps-script/sandbox/quest/2.js.
export default {
  id: 2,
  title: 'Данные для заказчика',
  points: 40,
  story: [
    { who: 'client', text: 'Мы хотим научить модель предсказывать нагрузку на склад. Данные есть, но с ними нужна аккуратная работа.' },
    { who: 'lena', text: 'Я Лена, аналитик. Мне нужна максимальная нагрузка за период — посчитай, пока я готовлю отчёт.' },
    { who: 'max', text: 'Макс, ML-инженер. Заведи в нашем трекере задачу на проверку модели — через API, а не руками.' },
    { who: 'olga', text: 'Ольга, юрист. Договор с заказчиком правим только через Git — чтобы осталась история всех изменений.' },
    { who: 'viktor', text: 'И последнее: модель должна где-то жить. Остался сервис: запусти его в контейнере.' },
  ],
  steps: [
    {
      id: 'q2-py-peak',
      kind: 'python',
      star: false,
      title: 'Пик нагрузки',
      text: 'Сначала вводится число N — сколько замеров, затем N целых чисел, каждое с новой строки. Выведи самое большое.',
    },
    {
      id: 'q2-api-task',
      kind: 'api',
      star: false,
      title: 'Задача в трекере',
      text: 'Добавь в учебный список задач новую: отправь `POST /tasks` с названием `Проверить модель`.',
      goals: [
        { text: 'Отправлен POST /tasks', kind: 'used', cmd: 'POST /tasks' },
        { text: 'Задача «Проверить модель» появилась в списке', kind: 'resourceExists', path: '/tasks', where: { title: 'Проверить модель' } },
      ],
    },
    {
      id: 'q2-term-deal',
      kind: 'terminal',
      star: false,
      title: 'Правка договора',
      text: 'В папке `contracts` уже есть репозиторий с файлом `deal.txt` и одним коммитом. Допиши в `deal.txt` новую строку и закоммить изменение с сообщением, где есть слово `update`. Рабочая папка должна остаться чистой.',
      setup: {
        gitConfig: { 'user.name': 'Student', 'user.email': 'student@example.ru' },
        dirs: ['contracts'],
        cwd: 'contracts',
        commands: ['git init', 'echo "Пункт 1" > deal.txt', 'git add deal.txt', 'git commit -m "init"'],
      },
      goals: [
        { text: 'Коммитов не меньше двух', kind: 'commits', min: 2 },
        { text: 'Есть коммит со словом update', kind: 'commitMessage', contains: 'update' },
        { text: 'Изменений вне коммита нет', kind: 'clean' },
      ],
    },
    {
      id: 'q2-docker-api',
      kind: 'docker',
      star: false,
      title: 'Сервис в контейнере',
      text: 'Запусти в фоне контейнер `api` из образа `neurolab/api` и открой его порт `8000` на порту `8000` своего компьютера.',
      setup: {},
      goals: [
        { text: 'Контейнер api запущен из образа neurolab/api', kind: 'containerRunning', name: 'api', image: 'neurolab/api' },
        { text: 'Порт 8000 проброшен на порт 8000', kind: 'containerPort', name: 'api', host: 8000, container: 8000 },
      ],
    },
  ],
};
