#!/usr/bin/env bash
# Instalacja / aktualizacja konfiguratora w kontenerze LXC (Debian 12), uruchamiać jako root:
#   tar -xzf konfigurator.tar.gz && bash konfigurator/deploy/install.sh
# Przy aktualizacji podmienia tylko kod – dane z serwera (konta, wyceny, cennik z panelu Dane) zostają.
set -euo pipefail

ZRODLO="$(cd "$(dirname "$0")/.." && pwd)"
CEL=/opt/konfigurator
UZYTKOWNIK=konfigurator

[ "$(id -u)" = 0 ] || { echo "Uruchom jako root."; exit 1; }

echo "== 1/6 Pakiety systemowe"
apt-get update -qq
apt-get install -y -qq curl ca-certificates rsync jq >/dev/null

echo "== 2/6 Node.js 24"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

echo "== 3/6 Użytkownik usługi i pliki aplikacji"
id "$UZYTKOWNIK" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$UZYTKOWNIK --shell /bin/bash $UZYTKOWNIK
mkdir -p "$CEL/data"
rsync -a --delete --exclude data --exclude node_modules "$ZRODLO"/ "$CEL"/
# dane wspólne kopiujemy tylko, jeśli jeszcze ich nie ma (nie nadpisujemy cennika wgranego w panelu Dane)
for p in produkty.json reguly.json katalogi.json; do
  [ -f "$CEL/data/$p" ] || [ ! -f "$ZRODLO/data/$p" ] || cp "$ZRODLO/data/$p" "$CEL/data/"
done
# reguły: jeśli administrator wgrał własne w panelu Dane, mają pierwszeństwo – nowsze z paczki
# czekają w panelu na zatwierdzenie (data/reguly-z-aktualizacji.json); w przeciwnym razie podmieniamy
if [ -f "$ZRODLO/data/reguly.json" ]; then
  STAN_REGUL=$(node -e '
    const fs = require("fs"), [serwer, paczka] = process.argv.slice(1).map(p => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } });
    if (!serwer || !serwer._wgrano) console.log("podmien");
    else console.log(serwer._wersja === paczka._wersja ? "bez-zmian" : "czeka");
  ' "$CEL/data/reguly.json" "$ZRODLO/data/reguly.json")
  case "$STAN_REGUL" in
    podmien) cp "$ZRODLO/data/reguly.json" "$CEL/data/reguly.json" ;;
    czeka) cp "$ZRODLO/data/reguly.json" "$CEL/data/reguly-z-aktualizacji.json"
           echo "   Uwaga: działają reguły wgrane w panelu Dane. Nowa wersja reguł czeka tam na zatwierdzenie." ;;
  esac
fi
[ -d "$ZRODLO/data/katalogi" ] && rsync -a --ignore-existing "$ZRODLO/data/katalogi/" "$CEL/data/katalogi/"
chown -R $UZYTKOWNIK:$UZYTKOWNIK "$CEL"

echo "== 4/6 Biblioteki (bez narzędzi do filmów)"
su - $UZYTKOWNIK -c "cd $CEL && npm ci --omit=dev --no-audit --no-fund --loglevel=error"

echo "== 5/6 Usługa systemd i ustawienia"
[ -f /etc/konfigurator.env ] || cp "$CEL/deploy/konfigurator.env.przyklad" /etc/konfigurator.env
cp "$CEL/deploy/konfigurator.service" /etc/systemd/system/konfigurator.service
systemctl daemon-reload
systemctl enable --now konfigurator >/dev/null 2>&1
systemctl restart konfigurator

echo "== 6/6 Codzienna kopia danych (03:30, ostatnie 14 dni w /var/backups/konfigurator)"
mkdir -p /var/backups/konfigurator
cat > /etc/cron.d/konfigurator-kopia <<'EOF'
30 3 * * * root tar -czf /var/backups/konfigurator/data-$(date +\%F).tar.gz -C /opt/konfigurator data && find /var/backups/konfigurator -name 'data-*.tar.gz' -mtime +14 -delete
EOF

# Tailscale (tunel HTTPS do internetu) – instalacja tylko przy pierwszym razie
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh

sleep 2
if curl -fsS http://127.0.0.1:3480/api/konto >/dev/null; then
  echo
  echo "Konfigurator działa lokalnie w kontenerze (http://127.0.0.1:3480)."
  echo "Następny krok (tylko za pierwszym razem):  bash $CEL/deploy/wlacz-funnel.sh"
else
  echo "Usługa nie odpowiada – sprawdź: journalctl -u konfigurator -n 50"; exit 1
fi
