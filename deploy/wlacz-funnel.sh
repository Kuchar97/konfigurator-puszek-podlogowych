#!/usr/bin/env bash
# Udostępnia konfigurator w internecie przez Tailscale Funnel (darmowe HTTPS, bez otwierania portów).
# Uruchom jako root po install.sh. Przy pierwszym razie wyświetli link do zalogowania w Tailscale.
set -euo pipefail

if ! tailscale status >/dev/null 2>&1; then
  echo "Zaloguj ten kontener do Tailscale – otwórz link poniżej w przeglądarce:"
  tailscale up --hostname=konfigurator
fi

# Funnel: https://konfigurator.<twoja-sieć>.ts.net  →  127.0.0.1:3480
# Jeśli Funnel nie jest jeszcze włączony w Twojej sieci, Tailscale wyświetli link, żeby go włączyć – kliknij i uruchom skrypt ponownie.
tailscale funnel --bg 3480

ADRES="https://$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')"
sed -i "s#^ADRES_APLIKACJI=.*#ADRES_APLIKACJI=$ADRES#" /etc/konfigurator.env
systemctl restart konfigurator

echo
echo "Gotowe! Adres dla znajomych:  $ADRES"
echo "Pierwsze konto założone pod tym adresem zostanie administratorem – załóż je od razu sam."
