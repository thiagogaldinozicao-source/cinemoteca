#!/bin/sh
# Sobe a versão do app em todos os lugares de uma vez (senão o iPhone fica com arquivo velho).
# Uso: ./versao.sh 22        (ícones têm versão própria, ?v=N nos links de ícone, não mexe aqui)
set -e
N="$1"
[ -n "$N" ] || { echo "Uso: ./versao.sh NUMERO   (atual: $(grep -o 'cinemoteca-v[0-9]*' sw.js))"; exit 1; }
cd "$(dirname "$0")"
sed -i.bak -E "s/(\.(js|css))\?v=[0-9]+/\1?v=$N/g" index.html *.js
sed -i.bak -E "s/const V = \"\?v=[0-9]+\"/const V = \"?v=$N\"/; s/cinemoteca-v[0-9]+/cinemoteca-v$N/" sw.js
rm -f *.bak
for f in *.js; do node --check "$f"; done
echo "Versão $N em tudo. Agora: git commit e git push."
