# Konfigurator puszek podłogowych Kontakt-Simon (prototyp)

Dobór **puszek podłogowych** KGT, KGH, FB, KFP, KFR – z kasetą, pokrywą i gniazdami K45, z cenami, dostępnością
na magazynie, dokumentacją i ofertą PDF / Excel / Salesforce.

Na stronie startowej:
- **Dobierz puszkę do potrzeb** – 5 pytań od razu na stronie (rodzaj podłogi, wykończenie, gniazda, wysokość, zamek);
  obok lista serii – każda odpowiedź ją zawęża i wskazuje rekomendowaną puszkę,
- **wybór serii od razu** – przycisk „Wybierz” przy serii (bez odpowiedzi – zwykła konfiguracja, z odpowiedziami – gniazda
  i wielkość z pytań), dalej krok po kroku: wariant → osprzęt K45 → podsumowanie → oferta,
- **Otwórz wycenę po kodzie** – zapisana wycena `KS-XXXX-XXXX`.

## Uruchomienie

Wymagania: [Node.js](https://nodejs.org) 24 lub nowszy.

```bash
npm install
npm start
```

Aplikacja działa pod adresem http://localhost:3490 (okno terminala musi pozostać otwarte).
Na Windows można też dwukrotnie kliknąć **`Uruchom konfigurator.bat`**.

## Konta i wyceny

- Logowanie adresem e-mail. **Wszystkie konta są takie same** – rejestracja: e-mail, hasło, opcjonalnie imię, firma i telefon.
- **Pierwsze założone konto zostaje jedynym administratorem** – dodatkowo widzi *Dane* (cennik, katalogi, reguły doboru, poczta), *Konta* i *Uwagi*.
- **Rabat** każdy wpisuje sam w ofercie – dowolny, od 0 do 100%, bez limitu i bez akceptacji; trafia do PDF i Excela (w Excelu można go nadpisać dla pojedynczej pozycji).
- Wycena zapisuje się przyciskiem **Zapisz** i dostaje kod `KS-XXXX-XXXX` (otwieranie po kodzie po zalogowaniu; cudza wycena – tylko odczyt). Wyjście z oferty pyta: wróć / zapisz i wyjdź / wyjdź bez zapisywania.
- Brak produktu na magazynie → link „Pokaż podobne dostępne” (podobne produkty z cennika ze stanem na żywo).
- **Potwierdzenie e-maila:** po rejestracji wysyłany jest link (ważny 48 h); bez potwierdzenia nie da się zalogować. Pierwsze konto (administrator) nie wymaga potwierdzenia; administrator może potwierdzić adres ręcznie w *Konta*. Bez skonfigurowanej poczty nowe konta akceptuje administrator (dostaje powiadomienie 🔔).
- **Poczta:** *Dane → Poczta e-mail* – ustawienia SMTP (nodemailer) i test wysyłki. Bez SMTP wiadomości trafiają do *skrzynki testowej* (`data/poczta/`), widocznej tylko dla administratora.
- Powiadomienia (🔔) działają w aplikacji. Przycisk **Zgłoś uwagę** zbiera uwagi testerów (lista w zakładce *Uwagi*).
- Dane kont i wycen: `data/konta.json`, `data/wyceny.json`, `data/sesje.json`, `data/powiadomienia.json` (hasła szyfrowane scrypt) – **poza repozytorium** (`.gitignore`).
- Zapomniane hasło administratora: `node scripts/ustaw-haslo.js adres@e-mail`.

## Aktualizacja danych

- **Nowy cennik** – w aplikacji: *Dane → Nowy cennik* (plik `.xls` „Cennik i arkusz wycen”). Albo: `npm run import -- ścieżka/do/cennika.xls`.
- **Nowy katalog PDF** – *Dane → Nowy katalog PDF*, przypisany do serii.
- **Reguły doboru** (wysokości, wielkości, kasety, nakładki, lista modułów) – `data/reguly.json` albo *Dane → Reguły doboru*.
  Po zmianie: `npm run sprawdz` (czy wszystkie symbole są w cenniku).

## Struktura

| Ścieżka | Zawartość |
|---|---|
| `server.js` | serwer: dane, konta, wyceny, stany magazynowe, strony produktów, import, Excel |
| `lib/cennik.js` | parser cennika xls → `data/produkty.json` |
| `lib/kontakt-simon.js` | monitor stanów, zdjęcia, karty katalogowe, pliki produktu |
| `lib/podobne.js` | produkty podobne do brakującego na magazynie |
| `lib/oferta-xlsx.js` | oferta Excel z formułą rabatu |
| `lib/konta.js`, `lib/poczta.js`, `lib/uwagi.js`, `lib/reguly.js` | konta i wyceny, e-mail, uwagi testerów, reguły doboru |
| `public/` | aplikacja w przeglądarce (HTML/CSS/JS) |
| `data/` | cennik (`produkty.json`), reguły doboru, lista katalogów |
| `deploy/` | instalacja na serwerze Linux (LXC/Debian, systemd, Tailscale Funnel) – `deploy/INSTRUKCJA.md` |
