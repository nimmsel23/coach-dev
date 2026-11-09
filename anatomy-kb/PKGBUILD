# Maintainer: Alpha <alpha@alphaos.local>

pkgname=anatomy-kb
pkgver=0.1.0
pkgrel=1
pkgdesc="Anatomy Intelligence Layer KB"
arch=('any')
license=('private')
depends=(
  'python'
  'python-typer'
  'python-rich'
  'python-yaml'
  'python-loguru'
  'python-aiohttp'
  'python-httpx'
)
makedepends=(
  'python-build'
  'python-installer'
  'python-setuptools'
  'python-wheel'
)

build() {
  cd "$startdir"
  python -m build --wheel --no-isolation
}

package() {
  cd "$startdir"
  python -m installer --destdir="$pkgdir" dist/*.whl
}
