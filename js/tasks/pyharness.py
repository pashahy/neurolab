"""Запуск кода студента и тестов. Общий для браузера (Pyodide) и валидатора (CPython)."""
import hashlib
import io
import json
import sys
import traceback


class CappedStringIO(io.StringIO):
    """StringIO that caps output at 20000 chars and appends truncation message."""
    def __init__(self):
        super().__init__()
        self.capped = False

    def write(self, s):
        if self.capped:
            return len(s)
        val = self.getvalue()
        if len(val) + len(s) > 20000:
            chars_left = 20000 - len(val)
            if chars_left > 0:
                super().write(s[:chars_left])
            super().write('\n…(вывод обрезан)')
            self.capped = True
            return len(s)
        return super().write(s)


def _nlc(v):
    """Каноническое значение для __nlh__: bool -> int, целое float -> int, кортеж -> {"t": [...]} (см. tools/seal-py.js)."""
    if v is None or isinstance(v, str):
        return v
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        try:
            if v == int(v):
                return int(v)
        except (ValueError, OverflowError):
            pass
        return {'f': repr(v)}
    if isinstance(v, list):
        return [_nlc(x) for x in v]
    if isinstance(v, tuple):
        return {'t': [_nlc(x) for x in v]}
    return {'o': type(v).__name__}


def __nlh__(v):
    """Хэш ожидаемого значения: первые 16 hex sha256 от JSON-записи (эталон в тесте не хранится открыто)."""
    s = json.dumps(_nlc(v), ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(s.encode('utf-8', 'surrogatepass')).hexdigest()[:16]


def format_error(e, is_test_error=False):
    if isinstance(e, SyntaxError):
        loc = ''
        if e.lineno is not None:
            loc = f' (строка {e.lineno}{", тест" if is_test_error else ""})'
        msg = e.msg
        return f'SyntaxError{loc}: {msg}' if msg else f'SyntaxError{loc}'
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename in ('<код>', '<тест>')]
    loc = ''
    if frames:
        last = frames[-1]
        loc = f' (строка {last.lineno}{", тест" if last.filename == "<тест>" else ""})'
    msg = str(e)
    return f'{type(e).__name__}{loc}: {msg}' if msg else f'{type(e).__name__}{loc}'


def run_one(code, stdin_lines, test):
    lines = list(stdin_lines or [])
    out = CappedStringIO()

    def fake_input(prompt=''):
        out.write(str(prompt))
        if not lines:
            raise EOFError('ввод закончился: программа ждёт больше данных, чем задано')
        return str(lines.pop(0))

    ns = {'__name__': '__main__', 'input': fake_input}
    old = sys.stdout
    sys.stdout = out
    ok, err = True, None
    try:
        exec(compile(code, '<код>', 'exec'), ns)
        if test:
            ns['__out__'] = out.getvalue()
            ns['__nlh__'] = __nlh__
            try:
                exec(compile(test, '<тест>', 'exec'), ns)
            except SyntaxError as e:
                ok, err = False, format_error(e, is_test_error=True)
            except BaseException as e:
                ok, err = False, format_error(e, is_test_error=True)
                if isinstance(e, AssertionError) and not str(e) and '__nlh__' in test:
                    err += ': вывод не совпал с ожидаемым'
    except SyntaxError as e:
        ok, err = False, format_error(e, is_test_error=False)
    except BaseException as e:  # ловим и SystemExit: студент может вызвать exit()
        ok, err = False, format_error(e, is_test_error=False)
    finally:
        sys.stdout = old
    return {'ok': ok, 'error': err, 'output': out.getvalue()}


def run_all(data):
    return [run_one(data['code'], r.get('stdin'), r.get('test')) for r in data['runs']]


def run_all_json(s):
    return json.dumps(run_all(json.loads(s)), ensure_ascii=False)


if __name__ == '__main__' and sys.platform != 'emscripten':
    payload = sys.stdin.buffer.read().decode('utf-8')
    sys.stdout.buffer.write(run_all_json(payload).encode('utf-8'))
