# Boop Online

Eine Online-Multiplayer-Version des Brettspiels "Boop" für zwei Spieler, spielbar im Webbrowser.

## Spielregeln (Kurzübersicht)

- Spieler platzieren abwechselnd Kätzchen ihrer Farbe auf einem 6x6 Feld.
- Das Platzieren eines Kätzchens oder einer Katze "boopt" (verschiebt) alle angrenzenden Figuren (eigene und gegnerische) um ein Feld in die entsprechende Richtung. Figuren können vom Brett gestoßen werden.
- Drei eigene Kätzchen in einer Reihe (horizontal, vertikal, diagonal) werden entfernt und durch eine eigene Katze an der Position des zuletzt platzierten Kätzchens ersetzt. Auch dies löst einen "Boop" aus.
- Wer zuerst drei eigene Katzen in eine Reihe bekommt, gewinnt.
- Kätzchen dürfen nicht auf Felder direkt neben (auch diagonal) anderen Kätzchen platziert werden (Ausnahme: keine anderen Züge möglich).
- Katzen dürfen überall platziert werden.

## Technologien

- **Backend:** Node.js, Express.js, Socket.IO
- **Frontend:** HTML, CSS, JavaScript

## Projektstatus und Ziele

**Ziel des Projekts:**
Ziel ist die vollständige Implementierung des Brettspiels "Boop" als Online-Multiplayer-Spiel für zwei Personen, inklusive aller Grundregeln und der Spezialaufwertung (8 Kätzchen-Regel).

**Was bereits funktioniert:**
- Grundlegendes Spiel-Setup für zwei Spieler über das Netzwerk.
- Abwechselndes Platzieren von Kätzchen.
- "Boop"-Mechanik beim Platzieren von Figuren.
- Automatische Promotion von drei Kätzchen in einer Reihe zu einer Katze, inklusive des dadurch ausgelösten "Boops".
- Erkennung der Gewinnbedingung (drei Katzen in einer Reihe).
- Zählung der Figuren auf dem Brett und im Vorrat.
- Begrenzung der platzierbaren Figuren auf 8 pro Spieler.

**Was noch nicht funktioniert / In Arbeit:**
- **Spezialaufwertung:** Die Regel, dass ein Spieler ein Kätzchen zu einer Katze aufwerten darf, wenn er 8 eigene Kätzchen auf dem Brett hat, ist implementiert, aber es gibt noch einen Fehler, der verhindert, dass Spieler diese Aktion korrekt ausführen können. Der Client sendet das falsche Signal an den Server.
- Die Regel, dass Kätzchen nicht direkt neben andere Kätzchen platziert werden dürfen (außer es gibt keine anderen Züge), ist noch nicht implementiert.

## Setup und Start

1.  Stelle sicher, dass Node.js und npm installiert sind.
2.  Klone das Repository (oder lade die Dateien herunter).
3.  Navigiere in das Projektverzeichnis: `cd boop-online`
4.  Installiere die Abhängigkeiten: `npm install`
5.  Starte den Server: `npm start` (für Produktion) oder `npm run dev` (für Entwicklung mit automatischem Neustart bei Änderungen via Nodemon).
6.  Öffne deinen Webbrowser und gehe zu `http://localhost:3000`.

## Entwicklung

Die Spiellogik ist serverseitig in `server.js` implementiert. Das Frontend befindet sich im `public` Ordner.

- `public/index.html`: Struktur der Webseite.
- `public/style.css`: Aussehen der Webseite und des Spielfelds.
- `public/script.js`: Clientseitige Logik zur Kommunikation mit dem Server und Darstellung des Spiels.
