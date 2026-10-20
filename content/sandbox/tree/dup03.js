// Дерево навыков: публичная структура (узлы = темы РП, условия челленджей). Охватывает все темы РП ДУП.03 (31 тема, один узел на тему). Формат и проверка: tools/sandbox-tree.js, apps-script/sandbox/README.md.
export default {
  "nodes": [
    {
      "id": "py-basics",
      "topic": "2.1",
      "title": "Синтаксис, типы, ввод-вывод",
      "icon": "🐍",
      "after": [],
      "challenges": [
        {
          "id": "t-py-sum",
          "kind": "python",
          "star": false,
          "title": "Сумма двух",
          "text": "Вводятся два целых числа, каждое на своей строке. Выведи их сумму.",
          "starter": "a = int(input())\n"
        },
        {
          "id": "t-py-hello",
          "kind": "python",
          "star": false,
          "title": "Приветствие",
          "text": "Вводится имя. Выведи `Привет, <имя>!`."
        },
        {
          "id": "t-py-rect",
          "kind": "python",
          "star": true,
          "title": "Прямоугольник",
          "text": "Вводятся длина и ширина прямоугольника (целые числа, по одному на строке). Выведи через пробел площадь и периметр."
        }
      ]
    },
    {
      "id": "hist-ai",
      "topic": "1.1",
      "title": "История и иерархия ИИ",
      "icon": "🧠",
      "after": [
        "py-basics"
      ],
      "challenges": [
        {
          "id": "t-dup03-hier-level",
          "kind": "python",
          "star": false,
          "title": "Матрёшка технологий",
          "text": "Вводится сокращение: `ИИ`, `МО` (машинное обучение) или `ГО` (глубокое обучение). Выведи, в какую область оно входит: для `ГО` это `МО`, для `МО` это `ИИ`, а для `ИИ` — слово `нет`. Регистр и пробелы по краям не важны."
        },
        {
          "id": "t-dup03-era",
          "kind": "python",
          "star": false,
          "title": "Эпоха глубокого обучения",
          "text": "Первая строка — число `N`, дальше `N` строк с годами событий в истории ИИ. Выведи через пробел: сколько событий произошло в 2012 году или позже и самый ранний год из списка."
        }
      ]
    },
    {
      "id": "industry",
      "topic": "1.2",
      "title": "Отрасли и применение ИИ",
      "icon": "🏭",
      "after": [
        "hist-ai"
      ],
      "challenges": [
        {
          "id": "t-dup03-sector-count",
          "kind": "python",
          "star": false,
          "title": "Сколько раз медицина",
          "text": "Вводится строка с отраслями через запятую, например `медицина, банки, медицина`. Выведи, сколько раз в ней встречается отрасль `медицина` (регистр и пробелы вокруг названий не важны)."
        },
        {
          "id": "t-dup03-sector-top",
          "kind": "python",
          "star": true,
          "title": "Самая популярная отрасль",
          "text": "Первая строка — число `N`, дальше `N` строк с названиями отраслей. Выведи отрасль, которая встречается чаще всех. При равенстве выведи ту, что встретилась раньше."
        }
      ]
    },
    {
      "id": "ethics",
      "topic": "1.3",
      "title": "Этика и право",
      "icon": "🛡️",
      "after": [
        "industry"
      ],
      "challenges": [
        {
          "id": "t-dup03-mask-digits",
          "kind": "python",
          "star": false,
          "title": "Скрыть номер",
          "text": "Вводится строка из цифр, например номер карты. Выведи её, заменив все цифры, кроме последних четырёх, на `*`. Если в строке не больше четырёх символов, выведи её без изменений."
        },
        {
          "id": "t-dup03-gitignore-data",
          "kind": "terminal",
          "star": true,
          "title": "Спрятать данные от Git",
          "text": "В папке `data` лежит файл `users.csv` с данными, которые нельзя публиковать. Создай в `data` файл `.gitignore`, в котором есть строка `users.csv`.",
          "setup": {
            "dirs": [
              "data"
            ],
            "files": {
              "data/users.csv": "id,age\n1,15"
            }
          },
          "goals": [
            {
              "text": "В ~/data есть .gitignore со строкой users.csv",
              "kind": "file",
              "path": "~/data/.gitignore",
              "contains": "users.csv"
            }
          ]
        }
      ]
    },
    {
      "id": "git-basics",
      "topic": "2.2",
      "title": "Git: версионирование кода",
      "icon": "🌿",
      "after": [],
      "challenges": [
        {
          "id": "t-git-init",
          "kind": "terminal",
          "star": false,
          "title": "Первый репозиторий",
          "text": "Создай папку `project`, перейди в неё и инициализируй в ней репозиторий Git.",
          "setup": {},
          "goals": [
            {
              "text": "В ~/project есть репозиторий",
              "kind": "gitInit",
              "path": "~/project"
            }
          ]
        },
        {
          "id": "t-git-commit",
          "kind": "terminal",
          "star": false,
          "title": "Первый коммит",
          "text": "В папке `project` уже есть репозиторий, а в нём файл `notes.txt`. Добавь файл в индекс и сделай коммит с сообщением, где есть слово `first`.",
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
              "project/notes.txt": "заметки"
            },
            "commands": [
              "git init"
            ]
          },
          "goals": [
            {
              "text": "Файл notes.txt под контролем Git",
              "kind": "tracked",
              "path": "notes.txt"
            },
            {
              "text": "Есть коммит со словом first",
              "kind": "commitMessage",
              "contains": "first"
            }
          ]
        }
      ]
    },
    {
      "id": "py-flow",
      "topic": "2.3",
      "title": "Условия, циклы, функции",
      "icon": "🔁",
      "after": [
        "py-basics"
      ],
      "challenges": [
        {
          "id": "t-py-max3",
          "kind": "python",
          "star": false,
          "title": "Наибольшее из трёх",
          "text": "Вводятся три целых числа, каждое на своей строке. Выведи наибольшее."
        },
        {
          "id": "t-py-mult3",
          "kind": "python",
          "star": false,
          "title": "Кратные трём",
          "text": "Вводится число `N`. Выведи, сколько чисел от 1 до `N` делятся на 3 без остатка (если `N` меньше 1, выведи 0)."
        },
        {
          "id": "t-py-fact",
          "kind": "python",
          "star": true,
          "title": "Факториал",
          "text": "Вводится целое `N` от 0 до 10. Выведи `N!` (произведение чисел от 1 до N; `0! = 1`). Напиши для этого функцию."
        }
      ]
    },
    {
      "id": "py-data",
      "topic": "2.4",
      "title": "Коллекции и файлы",
      "icon": "📚",
      "after": [
        "py-flow"
      ],
      "challenges": [
        {
          "id": "t-py-count-words",
          "kind": "python",
          "star": false,
          "title": "Сколько слов",
          "text": "Вводится строка. Выведи количество слов в ней."
        },
        {
          "id": "t-py-uniq",
          "kind": "python",
          "star": true,
          "title": "Уникальные слова",
          "text": "Вводится строка слов через пробел. Выведи, сколько в ней различных слов; регистр букв не важен."
        }
      ]
    },
    {
      "id": "git-team",
      "topic": "2.5",
      "title": "Командная работа с Git",
      "icon": "🤝",
      "after": [
        "git-basics"
      ],
      "challenges": [
        {
          "id": "t-git-branch",
          "kind": "terminal",
          "star": false,
          "title": "Ветка для фичи",
          "text": "В папке `project` есть репозиторий с одним коммитом. Создай ветку `feature` и перейди на неё.",
          "setup": {
            "gitConfig": {
              "user.name": "Student",
              "user.email": "student@example.ru"
            },
            "dirs": [
              "project"
            ],
            "cwd": "project",
            "commands": [
              "git init",
              "echo hello > a.txt",
              "git add a.txt",
              "git commit -m \"init\""
            ]
          },
          "goals": [
            {
              "text": "Есть ветка feature",
              "kind": "branch",
              "name": "feature"
            },
            {
              "text": "Ты находишься на ветке feature",
              "kind": "onBranch",
              "name": "feature"
            }
          ]
        },
        {
          "id": "t-git-second",
          "kind": "terminal",
          "star": true,
          "title": "Второй коммит",
          "text": "В репозитории один коммит. Добавь новый файл `fix.txt` с любым текстом и закоммить его с сообщением, где есть слово `fix`. Рабочая папка должна остаться чистой.",
          "setup": {
            "gitConfig": {
              "user.name": "Student",
              "user.email": "student@example.ru"
            },
            "dirs": [
              "project"
            ],
            "cwd": "project",
            "commands": [
              "git init",
              "echo hello > a.txt",
              "git add a.txt",
              "git commit -m \"init\""
            ]
          },
          "goals": [
            {
              "text": "Коммитов не меньше двух",
              "kind": "commits",
              "min": 2
            },
            {
              "text": "Есть коммит со словом fix",
              "kind": "commitMessage",
              "contains": "fix"
            },
            {
              "text": "Файл fix.txt создан и под контролем git",
              "kind": "tracked",
              "path": "fix.txt"
            },
            {
              "text": "Изменений вне коммита нет",
              "kind": "clean"
            }
          ]
        }
      ]
    },
    {
      "id": "numpy-vec",
      "topic": "2.6",
      "title": "NumPy: векторы и статистика (на обычном Python)",
      "icon": "🔢",
      "after": [
        "py-data"
      ],
      "challenges": [
        {
          "id": "t-dup03-vec-add",
          "kind": "python",
          "star": false,
          "title": "Сложить векторы",
          "text": "Даны две строки с одинаковым количеством чисел через пробел. Выведи через пробел их поэлементную сумму: первое с первым, второе со вторым и так далее (как `a + b` у массивов NumPy)."
        },
        {
          "id": "t-dup03-vec-stat",
          "kind": "python",
          "star": true,
          "title": "Среднее, минимум, максимум",
          "text": "Вводится строка целых чисел через пробел. Выведи через пробел: среднее арифметическое с двумя знаками после запятой, минимум и максимум."
        }
      ]
    },
    {
      "id": "pandas-table",
      "topic": "2.7",
      "title": "Pandas: таблицы и агрегация (на обычном Python)",
      "icon": "🐼",
      "after": [
        "numpy-vec"
      ],
      "challenges": [
        {
          "id": "t-dup03-table-filter",
          "kind": "python",
          "star": false,
          "title": "Фильтр по цене",
          "text": "Первая строка — число `N`, затем `N` строк вида `товар,цена` (цена целая). Выведи через пробел названия товаров с ценой больше 100 в исходном порядке. Если таких нет, выведи `нет`."
        },
        {
          "id": "t-dup03-table-group",
          "kind": "python",
          "star": true,
          "title": "Сумма по категориям",
          "text": "Первая строка — число `N`, затем `N` строк вида `категория,число`. Сложи числа внутри каждой категории и выведи строки `категория: сумма` в алфавитном порядке категорий."
        }
      ]
    },
    {
      "id": "viz",
      "topic": "2.8",
      "title": "Визуализация данных",
      "icon": "📊",
      "after": [
        "pandas-table"
      ],
      "challenges": [
        {
          "id": "t-dup03-bar",
          "kind": "python",
          "star": false,
          "title": "Столбики из решёток",
          "text": "Вводятся целые числа от 1 до 20 через пробел. Для каждого числа выведи отдельную строку из стольких символов `#`. Это простая текстовая диаграмма."
        },
        {
          "id": "t-dup03-hist",
          "kind": "python",
          "star": true,
          "title": "Гистограмма по корзинам",
          "text": "Вводятся целые числа от 0 до 99 через пробел. Раздели их на корзины по десять: `0-9`, `10-19` и так далее. Для каждой непустой корзины в порядке возрастания выведи строку вида `10-19: ###`, где решёток столько, сколько чисел в корзине."
        }
      ]
    },
    {
      "id": "data-collect",
      "topic": "3.1",
      "title": "Сбор и хранение данных",
      "icon": "🗄️",
      "after": [
        "py-data"
      ],
      "challenges": [
        {
          "id": "t-dup03-data-dirs",
          "kind": "terminal",
          "star": false,
          "title": "Каркас датасета",
          "text": "Подготовь структуру для данных: папки `dataset/raw` и `dataset/clean`, а в `dataset/raw` — пустой файл `notes.txt`.",
          "setup": {},
          "goals": [
            {
              "text": "Есть папка ~/dataset/raw",
              "kind": "dir",
              "path": "~/dataset/raw"
            },
            {
              "text": "Есть папка ~/dataset/clean",
              "kind": "dir",
              "path": "~/dataset/clean"
            },
            {
              "text": "Есть файл ~/dataset/raw/notes.txt",
              "kind": "file",
              "path": "~/dataset/raw/notes.txt"
            }
          ]
        },
        {
          "id": "t-dup03-ext-count",
          "kind": "python",
          "star": false,
          "title": "Сколько таблиц",
          "text": "Первая строка — число `N`, затем `N` имён файлов. Выведи, сколько из них имеют расширение `.csv` (регистр не важен)."
        }
      ]
    },
    {
      "id": "data-clean",
      "topic": "3.2",
      "title": "Очистка и подготовка данных",
      "icon": "🧹",
      "after": [
        "data-collect"
      ],
      "challenges": [
        {
          "id": "t-dup03-dedup",
          "kind": "python",
          "star": false,
          "title": "Убрать дубли",
          "text": "Вводится строка слов через пробел. Выведи слова без повторов в том порядке, в котором они впервые встретились. Регистр различается."
        },
        {
          "id": "t-dup03-fill-mean",
          "kind": "python",
          "star": true,
          "title": "Заполнить пропуски",
          "text": "Вводится строка целых чисел через пробел, где пропуски записаны как `?`. Замени каждый пропуск средним арифметическим известных чисел, округлённым вниз до целого (`//`), и выведи всю строку через пробел. Известное число есть всегда."
        }
      ]
    },
    {
      "id": "data-label",
      "topic": "3.3",
      "title": "Разметка и контроль качества",
      "icon": "🏷️",
      "after": [
        "data-clean"
      ],
      "challenges": [
        {
          "id": "t-dup03-agree",
          "kind": "python",
          "star": false,
          "title": "Согласие разметчиков",
          "text": "Даны две строки с метками двух разметчиков через пробел (меток поровну). Выведи, какой процент меток совпал, отбросив дробную часть, и знак `%`. Например, `75%`."
        },
        {
          "id": "t-dup03-majority",
          "kind": "python",
          "star": true,
          "title": "Решение большинства",
          "text": "Первая строка — число `N` объектов. Затем `N` строк: метки трёх разметчиков через пробел. Для каждого объекта выведи метку, которую поставили минимум двое. Если все три метки разные, выведи `спор`."
        }
      ]
    },
    {
      "id": "ml-basic",
      "topic": "4.1",
      "title": "Регрессия, дерево, kNN",
      "icon": "📈",
      "after": [
        "data-label"
      ],
      "challenges": [
        {
          "id": "t-dup03-line-predict",
          "kind": "python",
          "star": false,
          "title": "Предсказание прямой",
          "text": "Модель линейной регрессии: y = k·x + b. В первой строке даны целые `k` и `b` через пробел, во второй — `x`. Выведи предсказание `y`."
        },
        {
          "id": "t-dup03-tree-weather",
          "kind": "python",
          "star": false,
          "title": "Дерево решений",
          "text": "Дерево из двух вопросов. Вводятся температура `t` и влажность `h` (целые, по строке). Если `t` меньше 5, выведи `холодно`. Иначе, если `h` больше 70, выведи `сыро`. Иначе — `хорошо`."
        },
        {
          "id": "t-dup03-knn1",
          "kind": "python",
          "star": true,
          "title": "Ближайший сосед",
          "text": "Первая строка — число `N` обучающих точек. Затем `N` строк вида `число метка`. Последняя строка — новая точка (число). Выведи метку ближайшей обучающей точки (kNN при k=1). Если расстояния равны, выбери ту, что стояла раньше."
        }
      ]
    },
    {
      "id": "ml-ensemble",
      "topic": "4.2",
      "title": "Ансамбли и случайный лес",
      "icon": "🌲",
      "after": [
        "ml-basic"
      ],
      "challenges": [
        {
          "id": "t-dup03-forest-vote",
          "kind": "python",
          "star": false,
          "title": "Голосование деревьев",
          "text": "Вводятся предсказания нечётного числа деревьев леса — метки `0` или `1` через пробел. Выведи метку, за которую проголосовало больше деревьев."
        },
        {
          "id": "t-dup03-avg-models",
          "kind": "python",
          "star": true,
          "title": "Среднее трёх моделей",
          "text": "В строке три вещественных предсказания моделей через пробел. Выведи их среднее с двумя знаками после запятой. Если разница между наибольшим и наименьшим предсказаниями больше 10, выведи второй строкой `большой разброс`."
        }
      ]
    },
    {
      "id": "nn-arch",
      "topic": "5.1",
      "title": "Основы нейросетей",
      "icon": "🕸️",
      "after": [
        "ml-ensemble"
      ],
      "challenges": [
        {
          "id": "t-dup03-neuron",
          "kind": "python",
          "star": false,
          "title": "Один нейрон",
          "text": "Нейрон получает три числа `x`, три веса `w` и смещение `b` (три строки: `x`, `w`, затем `b`; числа целые). Выведи выход нейрона с функцией ReLU: сумму `x·w + b`, если она положительная, иначе 0."
        },
        {
          "id": "t-dup03-params",
          "kind": "python",
          "star": true,
          "title": "Сколько параметров",
          "text": "Вводятся размеры слоёв полносвязной сети через пробел (вход, скрытые, выход), например `4 8 3`. Выведи число обучаемых параметров: между соседними слоями у каждой связи есть вес, а у каждого нейрона следующего слоя — ещё и смещение."
        }
      ]
    },
    {
      "id": "nn-train",
      "topic": "5.2",
      "title": "Обучение и оптимизация",
      "icon": "🎯",
      "after": [
        "nn-arch"
      ],
      "challenges": [
        {
          "id": "t-dup03-mse",
          "kind": "python",
          "star": false,
          "title": "Ошибка MSE",
          "text": "Две строки целых чисел через пробел: истинные значения и предсказания (поровну). Выведи среднюю квадратичную ошибку (MSE) с двумя знаками после запятой."
        },
        {
          "id": "t-dup03-gd-step",
          "kind": "python",
          "star": false,
          "title": "Шаг спуска",
          "text": "Градиентный спуск делает шаг: новый вес = вес − скорость·градиент. Вводятся вес `w`, градиент `g` и скорость обучения `lr` (вещественные, по строке). Выведи новый вес с тремя знаками после запятой."
        },
        {
          "id": "t-dup03-epochs",
          "kind": "python",
          "star": true,
          "title": "Несколько эпох",
          "text": "Вес `w` стартует с 0. На каждой эпохе он сдвигается к цели `t` по правилу `w = w + lr·(t − w)`. Вводятся `t`, `lr` (вещественные) и число эпох `E` (по строке). Выведи `w` после `E` эпох с тремя знаками после запятой."
        }
      ]
    },
    {
      "id": "nn-vision",
      "topic": "5.3",
      "title": "Компьютерное зрение",
      "icon": "👁️",
      "after": [
        "nn-train"
      ],
      "challenges": [
        {
          "id": "t-dup03-negative",
          "kind": "python",
          "star": false,
          "title": "Негатив",
          "text": "Серая картинка. Первая строка — число строк `H`, затем `H` строк с яркостью пикселей (числа от 0 до 255 через пробел). Выведи негатив: каждое значение `v` замени на `255 − v`. Формат вывода такой же."
        },
        {
          "id": "t-dup03-mirror",
          "kind": "python",
          "star": false,
          "title": "Зеркало",
          "text": "Серая картинка в том же формате: `H`, затем `H` строк пикселей через пробел. Выведи её, отразив по горизонтали: в каждой строке порядок значений должен стать обратным."
        }
      ]
    },
    {
      "id": "nn-nlp",
      "topic": "5.4",
      "title": "NLP и трансформеры",
      "icon": "💬",
      "after": [
        "nn-train"
      ],
      "challenges": [
        {
          "id": "t-dup03-tokens",
          "kind": "python",
          "star": false,
          "title": "Разбить на токены",
          "text": "Вводится предложение. Приведи его к нижнему регистру, убери знаки `.`, `,`, `!`, `?` и раздели на слова. Выведи через пробел количество слов и самое длинное слово (если таких несколько, первое)."
        },
        {
          "id": "t-dup03-bow",
          "kind": "python",
          "star": false,
          "title": "Общие слова",
          "text": "Даны две строки текста (слова строчными, без знаков препинания). Выведи через пробел слова первой строки, которые встречаются и во второй, без повторов и по алфавиту. Если общих слов нет, выведи `нет`."
        }
      ]
    },
    {
      "id": "train-own",
      "topic": "6.1",
      "title": "Обучение на своих данных",
      "icon": "🏋️",
      "after": [
        "nn-vision",
        "nn-nlp"
      ],
      "challenges": [
        {
          "id": "t-dup03-split",
          "kind": "python",
          "star": false,
          "title": "Деление выборки",
          "text": "Вводятся число объектов `N` и доля обучающей выборки `P` в процентах (по строке). Выведи через пробел размер обучающей части (`N·P // 100`) и размер тестовой (остальное)."
        },
        {
          "id": "t-dup03-accuracy",
          "kind": "python",
          "star": false,
          "title": "Точность модели",
          "text": "Две строки меток через пробел: истинные и предсказанные (поровну). Выведи accuracy — долю верных предсказаний — с двумя знаками после запятой."
        }
      ]
    },
    {
      "id": "fine-tune",
      "topic": "6.2",
      "title": "Дообучение и перенос знаний",
      "icon": "🔧",
      "after": [
        "train-own"
      ],
      "challenges": [
        {
          "id": "t-dup03-trainable",
          "kind": "python",
          "star": false,
          "title": "Что будем учить",
          "text": "Первая строка — число слоёв `N`. Затем `N` строк вида `параметры статус`, где статус `frozen` (заморожен) или `train` (обучается). Выведи, сколько параметров будет обучаться при дообучении."
        },
        {
          "id": "t-dup03-ft-branch",
          "kind": "terminal",
          "star": true,
          "title": "Ветка для дообучения",
          "text": "В репозитории `project` один коммит. Заведи ветку `finetune` и перейди на неё, создай файл `config.txt` с любым текстом и закоммить его с сообщением, где есть слово `tune`. Рабочая папка должна быть чистой.",
          "setup": {
            "gitConfig": {
              "user.name": "Student",
              "user.email": "student@example.ru"
            },
            "dirs": [
              "project"
            ],
            "cwd": "project",
            "commands": [
              "git init",
              "echo hello > a.txt",
              "git add a.txt",
              "git commit -m \"init\""
            ]
          },
          "goals": [
            {
              "text": "Есть ветка finetune",
              "kind": "branch",
              "name": "finetune"
            },
            {
              "text": "Ты на ветке finetune",
              "kind": "onBranch",
              "name": "finetune"
            },
            {
              "text": "Есть коммит со словом tune",
              "kind": "commitMessage",
              "contains": "tune"
            },
            {
              "text": "Изменений вне коммита нет",
              "kind": "clean"
            }
          ]
        }
      ]
    },
    {
      "id": "llm-api",
      "topic": "7.1",
      "title": "Интеграция LLM через API",
      "icon": "🔌",
      "after": [
        "fine-tune"
      ],
      "challenges": [
        {
          "id": "t-dup03-api-models",
          "kind": "api",
          "star": false,
          "title": "Запрос модели",
          "text": "Учебный сервер хранит список моделей по адресу `/models`. Запроси модель с номером 2 и введи в поле ответа её название.",
          "setup": {},
          "goals": [
            {
              "text": "Выполнен запрос GET /models/2",
              "kind": "used",
              "cmd": "GET /models/2"
            }
          ],
          "hasAnswer": true
        },
        {
          "id": "t-dup03-api-post",
          "kind": "api",
          "star": false,
          "title": "Добавить задачу",
          "text": "Создай на сервере новую задачу с заголовком `Проверить модель`. Задачи хранятся по адресу `/tasks`, данные отправляются в теле запроса в формате JSON.",
          "setup": {},
          "goals": [
            {
              "text": "В /tasks появилась задача «Проверить модель»",
              "kind": "resourceExists",
              "path": "/tasks",
              "where": {
                "title": "Проверить модель"
              }
            }
          ]
        },
        {
          "id": "t-dup03-api-weather",
          "kind": "api",
          "star": true,
          "title": "Погода в Казани",
          "text": "Сервис погоды отвечает по адресу `/weather`. Узнай погоду в городе Казань и введи в поле ответа температуру в градусах (только число).",
          "setup": {},
          "goals": [
            {
              "text": "Выполнен запрос GET /weather",
              "kind": "used",
              "cmd": "GET /weather"
            }
          ],
          "hasAnswer": true
        }
      ]
    },
    {
      "id": "llm-local",
      "topic": "7.2",
      "title": "Локальные LLM (Ollama, llama.cpp)",
      "icon": "🖥️",
      "after": [
        "llm-api"
      ],
      "challenges": [
        {
          "id": "t-dup03-ram",
          "kind": "python",
          "star": false,
          "title": "Память под модель",
          "text": "Вводятся размер модели в миллиардах параметров `B` и число бит на параметр (4, 8 или 16) — по строке. Выведи, сколько гигабайт памяти нужно под веса: `B·бит/8`, с одним знаком после запятой."
        },
        {
          "id": "t-dup03-ollama-env",
          "kind": "terminal",
          "star": false,
          "title": "Окружение для Ollama",
          "text": "Подготовь окружение для локальной модели: создай папку `models` и задай переменную окружения `OLLAMA_MODELS` со значением `models`.",
          "setup": {},
          "goals": [
            {
              "text": "Есть папка ~/models",
              "kind": "dir",
              "path": "~/models"
            },
            {
              "text": "Переменная OLLAMA_MODELS равна models",
              "kind": "env",
              "name": "OLLAMA_MODELS",
              "value": "models"
            }
          ]
        }
      ]
    },
    {
      "id": "rag",
      "topic": "7.3",
      "title": "Архитектура RAG",
      "icon": "🔎",
      "after": [
        "llm-api"
      ],
      "challenges": [
        {
          "id": "t-dup03-chunks",
          "kind": "python",
          "star": false,
          "title": "Нарезка на куски",
          "text": "Первая строка — текст из слов, вторая — число `K`. Раздели текст на куски по `K` слов (последний может быть короче) и выведи каждый на своей строке."
        },
        {
          "id": "t-dup03-retrieve",
          "kind": "python",
          "star": true,
          "title": "Найти документ",
          "text": "Первая строка — вопрос из слов, вторая — число `N`, затем `N` документов (по строке). Выведи номер (с 1) документа с наибольшим числом общих с вопросом слов (слова считаются без повторов). При равенстве выбери меньший номер."
        }
      ]
    },
    {
      "id": "agent",
      "topic": "7.4",
      "title": "Простые агенты",
      "icon": "🤖",
      "after": [
        "rag"
      ],
      "challenges": [
        {
          "id": "t-dup03-agent-loop",
          "kind": "python",
          "star": false,
          "title": "Цикл агента",
          "text": "Агент хранит число, которое сначала равно 1. Он читает команды по одной в строке: `add N` прибавляет `N`, `mul N` умножает на `N`. Команда `stop` завершает работу. Выведи итоговое число."
        },
        {
          "id": "t-dup03-agent-api",
          "kind": "api",
          "star": true,
          "title": "Агент с инструментом",
          "text": "Агент решает задачу сам. Сначала получи список невыполненных задач (в `/tasks` есть параметр `done`), а затем отметь задачу 3 как выполненную.",
          "setup": {},
          "goals": [
            {
              "text": "Запрошены только невыполненные задачи",
              "kind": "used",
              "cmd": "GET /tasks?done=false"
            },
            {
              "text": "Задача 3 отмечена выполненной",
              "kind": "fieldEquals",
              "path": "/tasks/3",
              "field": "done",
              "value": true
            }
          ]
        }
      ]
    },
    {
      "id": "multi-agent",
      "topic": "7.5",
      "title": "Мультиагентные среды",
      "icon": "👥",
      "after": [
        "agent"
      ],
      "challenges": [
        {
          "id": "t-dup03-pipeline",
          "kind": "python",
          "star": false,
          "title": "Конвейер агентов",
          "text": "Три агента передают текст по цепочке. Первый убирает пробелы по краям, второй переводит в верхний регистр, третий заменяет пробелы между словами на `_`. Вводится строка; выведи результат."
        },
        {
          "id": "t-dup03-round-robin",
          "kind": "python",
          "star": false,
          "title": "Раздать задачи",
          "text": "В одной строке даны число агентов `N` и число задач `M`. Задачи раздаются по кругу: первая — первому агенту, вторая — второму и так далее, после последнего снова первый. Выведи через пробел, сколько задач получил каждый агент."
        }
      ]
    },
    {
      "id": "os-cli",
      "topic": "8.1",
      "title": "ОС, командная строка, окружение",
      "icon": "⌨️",
      "after": [
        "git-team"
      ],
      "challenges": [
        {
          "id": "t-dup03-cli-move",
          "kind": "terminal",
          "star": false,
          "title": "Переезд файла",
          "text": "В папке `work` лежит файл `a.txt`. Создай рядом с ней папку `archive` и перенеси файл туда.",
          "setup": {
            "dirs": [
              "work"
            ],
            "files": {
              "work/a.txt": "отчёт"
            }
          },
          "goals": [
            {
              "text": "Есть папка ~/archive",
              "kind": "dir",
              "path": "~/archive"
            },
            {
              "text": "Файл лежит в ~/archive/a.txt",
              "kind": "file",
              "path": "~/archive/a.txt"
            },
            {
              "text": "В ~/work файла a.txt больше нет",
              "kind": "noFile",
              "path": "~/work/a.txt"
            }
          ]
        },
        {
          "id": "t-dup03-cli-env",
          "kind": "terminal",
          "star": false,
          "title": "Переменная режима",
          "text": "Задай переменную окружения `API_MODE` со значением `test`.",
          "setup": {},
          "goals": [
            {
              "text": "Переменная API_MODE равна test",
              "kind": "env",
              "name": "API_MODE",
              "value": "test"
            }
          ]
        },
        {
          "id": "t-dup03-cli-copy",
          "kind": "terminal",
          "star": true,
          "title": "Резервная копия",
          "text": "В папке `proj` лежит файл `config.txt`. Сделай его копию `config.bak` в той же папке, а затем допиши в исходный файл строку `debug=1`.",
          "setup": {
            "dirs": [
              "proj"
            ],
            "cwd": "proj",
            "files": {
              "proj/config.txt": "mode=prod"
            }
          },
          "goals": [
            {
              "text": "Есть копия config.bak со старым содержимым",
              "kind": "file",
              "path": "~/proj/config.bak",
              "contains": "mode=prod"
            },
            {
              "text": "В config.txt есть строка debug=1",
              "kind": "file",
              "path": "~/proj/config.txt",
              "contains": "debug=1"
            }
          ]
        }
      ]
    },
    {
      "id": "docker-run",
      "topic": "8.2",
      "title": "Docker: запуск контейнера",
      "icon": "🐳",
      "after": [
        "os-cli"
      ],
      "challenges": [
        {
          "id": "t-dk-hello",
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
          "id": "t-dk-nginx",
          "kind": "docker",
          "star": true,
          "title": "Сайт на nginx",
          "text": "Запусти в фоне контейнер `site` из образа `nginx` и открой его порт `80` на порту `8081` своего компьютера.",
          "setup": {},
          "goals": [
            {
              "text": "Контейнер site запущен из образа nginx",
              "kind": "containerRunning",
              "name": "site",
              "image": "nginx"
            },
            {
              "text": "Порт 8081 проброшен на порт 80",
              "kind": "containerPort",
              "name": "site",
              "host": 8081,
              "container": 80
            }
          ]
        }
      ]
    },
    {
      "id": "devops",
      "topic": "8.3",
      "title": "DevOps и MLOps",
      "icon": "🔄",
      "after": [
        "docker-run"
      ],
      "challenges": [
        {
          "id": "t-dup03-deploy",
          "kind": "python",
          "star": false,
          "title": "Выкатывать или нет",
          "text": "Вводятся метрика новой модели и метрика текущей, в процентах (целые, по строке). Если новая лучше хотя бы на 2 пункта, выведи `deploy`, иначе `keep`."
        },
        {
          "id": "t-dup03-dk-stop",
          "kind": "docker",
          "star": false,
          "title": "Остановить сервис",
          "text": "В фоне работает контейнер `api` из образа `nginx`. Останови его.",
          "setup": {
            "commands": [
              "docker run -d --name api nginx"
            ]
          },
          "goals": [
            {
              "text": "Контейнер api остановлен",
              "kind": "containerExited",
              "name": "api"
            }
          ]
        },
        {
          "id": "t-dup03-dk-echo",
          "kind": "docker",
          "star": true,
          "title": "Одноразовая задача",
          "text": "Запусти из образа `python:3.12-slim` контейнер с именем `greeter`, который выполнит команду `echo ready` и завершится без ошибок.",
          "setup": {},
          "goals": [
            {
              "text": "Контейнер greeter из python:3.12-slim завершился с кодом 0",
              "kind": "containerExited",
              "name": "greeter",
              "image": "python:3.12-slim",
              "code": 0
            }
          ]
        }
      ]
    },
    {
      "id": "security",
      "topic": "8.4",
      "title": "Безопасность ИИ-систем",
      "icon": "🔐",
      "after": [
        "devops"
      ],
      "challenges": [
        {
          "id": "t-dup03-mask-key",
          "kind": "python",
          "star": false,
          "title": "Спрятать ключ",
          "text": "Вводится ключ доступа к API. Выведи его первые 4 символа и три звёздочки `***`. Если в ключе меньше 5 символов, выведи только `***`."
        },
        {
          "id": "t-dup03-gitignore-env",
          "kind": "terminal",
          "star": true,
          "title": "Не коммить секреты",
          "text": "В репозитории лежит файл `.env` с секретным ключом (он ещё не в Git). Создай `.gitignore` со строкой `.env` и закоммить только его с сообщением, где есть слово `ignore`.",
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
              "project/.env": "KEY=demo"
            },
            "commands": [
              "git init"
            ]
          },
          "goals": [
            {
              "text": "Файл .gitignore под контролем Git",
              "kind": "tracked",
              "path": ".gitignore"
            },
            {
              "text": "В .gitignore есть строка .env",
              "kind": "file",
              "path": "~/project/.gitignore",
              "contains": ".env"
            },
            {
              "text": "Есть коммит со словом ignore",
              "kind": "commitMessage",
              "contains": "ignore"
            }
          ]
        }
      ]
    }
  ]
};
