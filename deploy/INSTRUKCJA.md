# Konfigurator na Proxmoxie – udostępnienie znajomym (Tailscale Funnel)

Efekt: stały adres `https://konfigurator.<twoja-sieć>.ts.net` z HTTPS, **bez otwierania portów na routerze**.
Dane testowe z Twojego komputera nie trafiają na serwer – startujesz z czystą bazą kont.

---

## 0. Na Twoim komputerze – zbuduj paczkę

W folderze konfiguratora:

```
npm run paczka
```

Powstanie `deploy\konfigurator.tar.gz` (kod + cennik + reguły, bez kont, wycen i kluczy).

## 1. Proxmox – utwórz kontener

1. **local → CT Templates → Templates** → pobierz `debian-12-standard`.
2. **Create CT**:
   - Hostname: `konfigurator`, hasło root, zaznaczone **Unprivileged container**
   - Template: debian-12-standard
   - Disk: 8 GB · CPU: 1 rdzeń · Memory: 1024 MB, Swap 512 MB
   - Network: IPv4 **DHCP**
3. Po utworzeniu: **Options → Start at boot = Yes**. Nie uruchamiaj jeszcze kontenera.

## 2. Proxmox – pozwól kontenerowi na tunel (jednorazowo)

Tailscale potrzebuje urządzenia `/dev/net/tun`. W Proxmoxie: **węzeł (np. pve) → Shell** i wpisz
(zamień `105` na numer swojego kontenera):

```
cat >> /etc/pve/lxc/105.conf <<'EOF'
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
EOF
```

Teraz uruchom kontener (**Start**).

## 3. Wgraj paczkę do kontenera

W **konsoli kontenera** (zaloguj się jako `root`) włącz tymczasowo logowanie SSH na hasło i sprawdź adres IP:

```
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config && systemctl restart ssh
ip -4 -br a
```

Na Windowsie (PowerShell, w folderze konfiguratora), podając IP kontenera:

```
scp deploy\konfigurator.tar.gz root@192.168.1.50:/root/
```

## 4. Instalacja (w konsoli kontenera)

```
cd /root && tar -xzf konfigurator.tar.gz && bash konfigurator/deploy/install.sh
```

Skrypt instaluje Node.js 24, aplikację (`/opt/konfigurator`), usługę z autostartem, codzienną kopię danych
i program Tailscale. Na końcu napisze „Konfigurator działa lokalnie”.

Możesz już wyłączyć logowanie roota przez SSH:

```
sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config && systemctl restart ssh
```

## 5. Udostępnij w internecie

1. Załóż darmowe konto na **tailscale.com** (np. logowanie przez Google).
2. W kontenerze:

   ```
   bash /opt/konfigurator/deploy/wlacz-funnel.sh
   ```

   - pokaże link – otwórz go w przeglądarce i zatwierdź dodanie urządzenia,
   - jeśli pojawi się drugi link „Funnel is not enabled” – otwórz go, zatwierdź i **uruchom skrypt jeszcze raz**.
3. Skrypt wypisze adres, np. `https://konfigurator.tail1234.ts.net`. Pierwsze uruchomienie certyfikatu HTTPS może potrwać ok. minuty.

## 6. Pierwsze uruchomienie

1. Wejdź na adres i **od razu załóż swoje konto** – pierwsze konto zostaje administratorem.
2. **Dane → Poczta**: wpisz Gmail + hasło aplikacji (bez tego znajomi nie dostaną linku potwierdzającego;
   awaryjnie możesz potwierdzić ich e-mail ręcznie w **Konta → Potwierdź e-mail**).
## Aktualizacja do nowej wersji

Na komputerze `npm run paczka`, `scp` jak w kroku 3, a w kontenerze:

```
cd /root && rm -rf konfigurator && tar -xzf konfigurator.tar.gz && bash konfigurator/deploy/install.sh
```

Konta, wyceny, ustawienia i cennik wgrany przez panel Dane zostają bez zmian.
Reguły doboru wgrane w panelu Dane też zostają – jeśli nowa wersja aplikacji ma nowsze reguły,
w **Dane → Reguły doboru** pojawi się informacja z podglądem zmian i wyborem: zastosować nowe czy zostawić swoje.

## Przydatne polecenia (w kontenerze)

| Co | Polecenie |
|---|---|
| Stan aplikacji | `systemctl status konfigurator` |
| Logi | `journalctl -u konfigurator -n 100` |
| Restart | `systemctl restart konfigurator` |
| Wyłącz dostęp z internetu | `tailscale funnel reset` |
| Włącz ponownie | `bash /opt/konfigurator/deploy/wlacz-funnel.sh` |
| Kopie danych | `ls /var/backups/konfigurator` |
