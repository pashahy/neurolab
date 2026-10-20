// Квест НейроЛаба, глава 3: публичная часть. Секреты — apps-script/sandbox/quest/3.js.
export default {
  id: 3,
  title: 'Запуск в продакшен',
  points: 50,
  story: [
    { who: 'viktor', text: 'Заказчик доволен прототипом. Завтра запускаем сервис для всех — проверим всё по списку.' },
    { who: 'neuron', text: 'Сначала лимиты. Если запросов больше сотни, сервис должен ответить `limit`, иначе `ok`. Это на тебе.' },
    { who: 'dima', text: 'Я Дима, DevOps. Настрой конфиг и переменную окружения, а потом подними веб-сервер в контейнере.' },
    { who: 'anna', text: 'После тестов в трекере остался мусор. Уберём старую задачу и пришлём заказчику итоговый отчёт.' },
    { who: 'client', text: 'Жду отчёт: сколько всего запросов и сколько в среднем за день.' },
  ],
  steps: [
    {
      id: 'q3-py-limit',
      kind: 'python',
      star: false,
      title: 'Лимит запросов',
      text: 'Вводится целое число — количество запросов за минуту. Если оно больше `100`, выведи `limit`, иначе выведи `ok`.',
    },
    {
      id: 'q3-term-config',
      kind: 'terminal',
      star: false,
      title: 'Конфиг и окружение',
      text: 'Заведи папку `deploy`, а в ней файл `config.txt` со строкой `MODEL=prod`. Затем задай переменную окружения `APP_ENV` со значением `prod`.',
      setup: {},
      goals: [
        { text: 'Есть папка ~/deploy', kind: 'dir', path: '~/deploy' },
        { text: 'В ~/deploy/config.txt есть строка MODEL=prod', kind: 'file', path: '~/deploy/config.txt', contains: 'MODEL=prod' },
        { text: 'Переменная APP_ENV равна prod', kind: 'env', name: 'APP_ENV', value: 'prod' },
      ],
    },
    {
      id: 'q3-docker-web',
      kind: 'docker',
      star: false,
      title: 'Веб-сервер',
      text: 'Запусти в фоне контейнер `web` из образа `nginx` и открой его порт `80` на порту `8080` своего компьютера.',
      setup: {},
      goals: [
        { text: 'Контейнер web запущен из образа nginx', kind: 'containerRunning', name: 'web', image: 'nginx' },
        { text: 'Порт 8080 проброшен на порт 80', kind: 'containerPort', name: 'web', host: 8080, container: 80 },
      ],
    },
    {
      id: 'q3-api-cleanup',
      kind: 'api',
      star: false,
      title: 'Убрать лишнее',
      text: 'В списке задач учебного API осталась тестовая задача с номером `4`. Удали её и убедись, что её больше нет.',
      goals: [
        { text: 'Отправлен DELETE /tasks/4', kind: 'used', cmd: 'DELETE /tasks/4' },
        { text: 'Задачи 4 больше нет', kind: 'resourceMissing', path: '/tasks/4' },
      ],
    },
    {
      id: 'q3-py-report',
      kind: 'python',
      star: true,
      title: 'Итоговый отчёт',
      text: 'Сначала вводится число N — сколько дней, затем N целых неотрицательных чисел — запросов за каждый день, по одному в строке. Выведи через пробел сумму и среднее за день, округлённое вниз до целого. Например, для `3` дней и чисел `10`, `20`, `35` получится `65 21`.',
    },
  ],
};
