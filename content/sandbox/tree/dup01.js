// Дерево навыков: публичная структура (узлы = темы РП, условия челленджей). Правится вручную. Формат и проверка: tools/sandbox-tree.js, apps-script/sandbox/README.md.
export default {
  "nodes": [
    {
      "id": "llm-basics",
      "topic": "1.1",
      "title": "Основы взаимодействия с моделями",
      "icon": "🧭",
      "after": [],
      "challenges": [
        {
          "id": "t-llm-halluc",
          "kind": "prompt",
          "star": false,
          "title": "Что такое галлюцинация",
          "text": "Собери запрос к нейросети: она должна объяснить, что такое **галлюцинация** и как её заметить. Нужны роль, задача и формат с числом пунктов. Оценка — не ниже 70.",
          "required": [
            "role",
            "task",
            "format"
          ]
        },
        {
          "id": "t-api-weather",
          "kind": "api",
          "star": false,
          "title": "Погода в Казани",
          "text": "В учебном API есть погода по городам. Запроси `/weather?city=Казань` и впиши в ответ, какое там небо.",
          "goals": [
            {
              "text": "Сделан запрос погоды для Казани",
              "kind": "used",
              "cmd": "GET /weather?city=Казань"
            }
          ],
          "hasAnswer": true
        },
        {
          "id": "t-term-notes",
          "kind": "terminal",
          "star": false,
          "title": "Папка для заметок",
          "text": "Заведи папку `notes` и в ней пустой файл `ideas.txt`.",
          "setup": {},
          "goals": [
            {
              "text": "Есть папка ~/notes",
              "kind": "dir",
              "path": "~/notes"
            },
            {
              "text": "Есть файл ~/notes/ideas.txt",
              "kind": "file",
              "path": "~/notes/ideas.txt"
            }
          ]
        }
      ]
    },
    {
      "id": "prompt-craft",
      "topic": "2.1",
      "title": "Конструирование запросов",
      "icon": "✍️",
      "after": [
        "llm-basics"
      ],
      "challenges": [
        {
          "id": "t-prompt-reply",
          "kind": "prompt",
          "star": true,
          "title": "Ответ клиенту",
          "text": "Собери запрос, чтобы нейросеть написала вежливый ответ **клиенту** на жалобу о задержке заказа. Нужны роль, контекст, задача, формат и ограничения. Оценка — не ниже 80.",
          "required": [
            "role",
            "context",
            "task",
            "format",
            "limits"
          ]
        },
        {
          "id": "t-py-words",
          "kind": "python",
          "star": false,
          "title": "Сколько слов в запросе",
          "text": "Вводится одна строка — текст запроса. Выведи, сколько в ней слов (слова разделены пробелами)."
        },
        {
          "id": "t-term-prompts",
          "kind": "terminal",
          "star": false,
          "title": "Файлы промпта",
          "text": "Создай папку `prompts` с файлами `role.txt` и `task.txt`. В `role.txt` запиши текст `Ты — аналитик`.",
          "setup": {},
          "goals": [
            {
              "text": "Есть папка ~/prompts",
              "kind": "dir",
              "path": "~/prompts"
            },
            {
              "text": "В ~/prompts/role.txt записан нужный текст",
              "kind": "file",
              "path": "~/prompts/role.txt",
              "contains": "Ты — аналитик"
            },
            {
              "text": "Есть файл ~/prompts/task.txt",
              "kind": "file",
              "path": "~/prompts/task.txt"
            }
          ]
        }
      ]
    },
    {
      "id": "special-tasks",
      "topic": "3.1",
      "title": "Специализированные задачи",
      "icon": "🛠️",
      "after": [
        "prompt-craft"
      ],
      "challenges": [
        {
          "id": "t-api-post",
          "kind": "api",
          "star": false,
          "title": "Новая задача",
          "text": "Добавь в учебный список задач новую: `POST /tasks` с названием `Написать промпт`.",
          "goals": [
            {
              "text": "Отправлен POST /tasks",
              "kind": "used",
              "cmd": "POST /tasks"
            },
            {
              "text": "Задача «Написать промпт» появилась в списке",
              "kind": "resourceExists",
              "path": "/tasks",
              "where": {
                "title": "Написать промпт"
              }
            }
          ]
        },
        {
          "id": "t-py-upper",
          "kind": "python",
          "star": false,
          "title": "Заголовок капсом",
          "text": "Вводится строка. Выведи её заглавными буквами, а затем, через пробел, число символов в ней."
        },
        {
          "id": "t-prompt-json",
          "kind": "prompt",
          "star": false,
          "title": "Ответ в JSON",
          "text": "Собери запрос, чтобы нейросеть выдала список из 3 **навыков** аналитика данных в формате JSON. Нужны роль, задача и формат. Оценка — не ниже 70.",
          "required": [
            "role",
            "task",
            "format"
          ]
        }
      ]
    },
    {
      "id": "quality",
      "topic": "3.2",
      "title": "Метрики и оценка качества",
      "icon": "📊",
      "after": [
        "special-tasks"
      ],
      "challenges": [
        {
          "id": "t-py-accuracy",
          "kind": "python",
          "star": false,
          "title": "Точность модели",
          "text": "Сначала вводится число верных ответов модели, затем общее число ответов (оно больше нуля). Выведи точность в процентах с одним знаком после точки."
        },
        {
          "id": "t-api-models",
          "kind": "api",
          "star": true,
          "title": "Лучшая модель",
          "text": "Посмотри список моделей: `GET /models`. Какая из них самая точная? Впиши её название.",
          "goals": [
            {
              "text": "Запрошен список моделей",
              "kind": "used",
              "cmd": "GET /models"
            }
          ],
          "hasAnswer": true
        }
      ]
    },
    {
      "id": "industry",
      "topic": "4.1",
      "title": "Отраслевые сценарии",
      "icon": "🏭",
      "after": [
        "quality"
      ],
      "challenges": [
        {
          "id": "t-prompt-warehouse",
          "kind": "prompt",
          "star": true,
          "title": "Чек-лист для склада",
          "text": "Собери запрос, чтобы нейросеть составила **чек-лист** приёмки товара на **складе**. Нужны роль, контекст, задача и формат. Оценка — не ниже 80.",
          "required": [
            "role",
            "context",
            "task",
            "format"
          ]
        },
        {
          "id": "t-dup01-dk-hello",
          "kind": "docker",
          "star": false,
          "title": "Привет, контейнер",
          "text": "В терминале есть учебный Docker. Запусти контейнер из образа `hello-world`.",
          "setup": {},
          "goals": [
            {
              "text": "Контейнер из hello-world отработал",
              "kind": "containerExited",
              "image": "hello-world",
              "code": 0
            }
          ]
        },
        {
          "id": "t-term-report",
          "kind": "terminal",
          "star": false,
          "title": "Отчёт",
          "text": "Создай папку `report`, перейди в неё и создай файл `summary.txt` с текстом `Итоги недели`. В конце ты должен остаться в папке `report`.",
          "setup": {},
          "goals": [
            {
              "text": "Есть папка ~/report",
              "kind": "dir",
              "path": "~/report"
            },
            {
              "text": "В summary.txt записан нужный текст",
              "kind": "file",
              "path": "~/report/summary.txt",
              "contains": "Итоги недели"
            },
            {
              "text": "Ты находишься в ~/report",
              "kind": "cwd",
              "path": "~/report"
            }
          ]
        }
      ]
    },
    {
      "id": "study-practice",
      "topic": "4.2",
      "title": "Учебная практика",
      "icon": "📚",
      "after": [
        "industry"
      ],
      "challenges": [
        {
          "id": "t-dup01-py-best",
          "kind": "python",
          "star": false,
          "title": "Лучший вариант запроса",
          "text": "На практике ты сравниваешь варианты запроса. Сначала вводится число вариантов N, затем N оценок (целые числа от 0 до 10), по одной в строке. Выведи наибольшую оценку и номер варианта, который её получил (номера с 1). Если лучших несколько, назови первый.",
          "starter": "n = int(input())\n"
        },
        {
          "id": "t-dup01-term-diary",
          "kind": "terminal",
          "star": true,
          "title": "Дневник на отдельной ветке",
          "text": "В папке `project` уже есть репозиторий и файл `diary.md`. Создай ветку `practice`, перейди на неё и сделай коммит, в сообщении которого есть слово `diary`.",
          "setup": {
            "gitConfig": {
              "user.name": "Student",
              "user.email": "student@example.ru"
            },
            "dirs": [
              "project"
            ],
            "cwd": "project",
            "files": {
              "project/diary.md": "день 1"
            },
            "commands": [
              "git init"
            ]
          },
          "goals": [
            {
              "text": "Есть ветка practice",
              "kind": "branch",
              "name": "practice"
            },
            {
              "text": "Ты находишься на ветке practice",
              "kind": "onBranch",
              "name": "practice"
            },
            {
              "text": "Файл diary.md под контролем Git",
              "kind": "tracked",
              "path": "diary.md"
            },
            {
              "text": "Есть коммит со словом diary",
              "kind": "commitMessage",
              "contains": "diary"
            }
          ]
        },
        {
          "id": "t-dup01-pr-diary",
          "kind": "prompt",
          "star": false,
          "title": "Отчёт по практике",
          "text": "Собери запрос, чтобы нейросеть помогла составить **отчёт** об учебной практике. Нужны роль, контекст, задача и формат. Оценка — не ниже 70.",
          "required": [
            "role",
            "context",
            "task",
            "format"
          ]
        }
      ]
    },
    {
      "id": "work-practice",
      "topic": "4.3",
      "title": "Производственная практика",
      "icon": "🏢",
      "after": [
        "study-practice"
      ],
      "challenges": [
        {
          "id": "t-dup01-dk-portal",
          "kind": "docker",
          "star": false,
          "title": "Сайт компании в контейнере",
          "text": "Запусти в фоне контейнер `portal` из образа `nginx` и пробрось порт 9090 компьютера на порт 80 контейнера.",
          "setup": {},
          "goals": [
            {
              "text": "Контейнер portal запущен из образа nginx",
              "kind": "containerRunning",
              "name": "portal",
              "image": "nginx"
            },
            {
              "text": "Порт 9090 проброшен на порт 80",
              "kind": "containerPort",
              "name": "portal",
              "host": 9090,
              "container": 80
            }
          ]
        },
        {
          "id": "t-dup01-api-done",
          "kind": "api",
          "star": true,
          "title": "Закрыть задачу",
          "text": "В учебном списке задач есть «Прочитать лекцию». Отметь её выполненной: поле `done` должно стать `true`. В теле запроса достаточно передать только это поле.",
          "goals": [
            {
              "text": "Отправлен PUT /tasks/2",
              "kind": "used",
              "cmd": "PUT /tasks/2"
            },
            {
              "text": "Задача 2 отмечена выполненной",
              "kind": "fieldEquals",
              "path": "/tasks/2",
              "field": "done",
              "value": true
            }
          ]
        },
        {
          "id": "t-dup01-term-archive",
          "kind": "terminal",
          "star": false,
          "title": "Сдать в архив",
          "text": "В папке `work` лежит файл `old.txt`. Создай папку `archive` и перенеси файл `old.txt` туда. В `work` его остаться не должно.",
          "setup": {
            "dirs": [
              "work"
            ],
            "cwd": "work",
            "files": {
              "work/old.txt": "старый отчёт"
            }
          },
          "goals": [
            {
              "text": "Есть папка ~/work/archive",
              "kind": "dir",
              "path": "~/work/archive"
            },
            {
              "text": "Файл old.txt лежит в archive",
              "kind": "file",
              "path": "~/work/archive/old.txt"
            },
            {
              "text": "В work файла old.txt больше нет",
              "kind": "noFile",
              "path": "~/work/old.txt"
            }
          ]
        }
      ]
    }
  ]
};
