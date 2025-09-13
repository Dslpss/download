import os
import sys

try:
    import pytest  # type: ignore
except ImportError:  # pytest não instalado: cria stub mínimo
    class _MarkStub:
        def skip(self, *a, **k):  # pragma: no cover
            def _decorator(func):
                return func
            return _decorator

        def parametrize(self, *a, **k):  # pragma: no cover
            def _decorator(func):
                return func
            return _decorator

    class _PytestStub:  # pragma: no cover
        mark = _MarkStub()

    pytest = _PytestStub()  # type: ignore

# Ajusta path para importar o pacote
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
SRC_DIR = os.path.join(BASE_DIR, 'src')
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

from videodl.downloader import VideoDownloader


def test_sanitize_replaces_forbidden_chars():
    vd = VideoDownloader()
    # acessa método protegido por fins de teste
    original = 'my:video*name?|<test>"'
    sanitized = vd._sanitize(original)
    assert all(c not in sanitized for c in ':*?|<>"'), sanitized


def test_sanitize_idempotent():
    vd = VideoDownloader()
    name = 'normal_name'
    assert vd._sanitize(name) == name


@pytest.mark.skip(reason="Teste de rede / integração depende de URL externa")
@pytest.mark.parametrize("url", [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
])
def test_list_formats_network(url):
    vd = VideoDownloader()
    fmts = vd.list_formats(url)
    assert len(fmts) > 0
    # Cada formato deve ter itag e ext
    assert all(f.itag for f in fmts)
    assert any(f.ext for f in fmts)
