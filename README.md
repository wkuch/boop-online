# Boop Online

Eine Online-Multiplayer-Version des Brettspiels "Boop" für zwei Spieler, spielbar im Webbrowser.

## Spielregeln

- Leeres 6×6-Brett; jedes Feld fasst maximal eine Figur.
- Jeder Spieler hat immer 8 Spielfiguren im Vorrat.
- Zu Beginn des Spiels haben beide Spieler 8 Kätzchen im Vorrat.
- Spieler wechseln sich ab. In deinem Zug platzierst du eine Figur aus deinem Vorrat auf ein freies Feld.
- Jeder Spieler kann nur Spielfiguren aus seinem Vorrat auf dem Brett platzieren. Dabei kann er aber wählen falls er Katzen und Kätzchen im vorrat hat.
- Boop: Beim Platzieren werden alle benachbarten Figuren (8 Richtungen, auch diagonal) um ein Feld vom neuen Stein weggeschoben. Figuren, die vom Brett gestoßen werden, werden entfernt.
- Wer-booped-was: Kätzchen können nur andere Kätzchen wegboopen. Katzen hingegen können andere Katzen sowie Kätzchen boopen.
- Aufwertung: Nach dem Boop entfernst du jede ununterbrochene Linie von drei Spielfiguren (Katzen UND Kätzchen) deiner Farbe (horizontal, vertikal oder diagonal). Alle Kätzchen von diesen drei Spielfiguren werden aus dem Spiel entfernt und der Spieler erhält stattdessen genauso viele Katzen im Vorrat.
- Kitten Madness: Hast du alle deine 8 Kätzchen platziert (dein Vorrat ist leer), musst du sofort eines deiner Kätzchen auf dem Brett in eine Katze aufwerten. Auch diese Aufwertung boopt angrenzende Figuren.
- Sieg: Wer zuerst drei Katzen in einer ununterbrochenen Reihe (horizontal, vertikal oder diagonal) hat, gewinnt das Spiel sofort. Alternativ gewinnt auch der Spieler der es schafft 8 Katzen auf dem Brett zu haben.

## Technologien

- **Backend:** Node.js, Express.js, Socket.IO
- **Frontend:** HTML, CSS, JavaScript

## Projektstatus und Ziele

**Ziel des Projekts:**
Ziel ist die vollständige Implementierung des Brettspiels "Boop" als Online-Multiplayer-Spiel für zwei Personen, inklusive aller Grundregeln und der Spezialaufwertung (8 Kätzchen-Regel).

**Was bereits funktioniert:**

- ✅ Automatische Session-Generierung
- ✅ Einladen von Spielern durch Link
- ✅ Vollständige Spielregeln und Spiellogik
- ✅ Spielerwechsel
- ✅ Brett-Initialisierung und Spielzüge
- ✅ Boop-Mechanik (Figuren wegdrücken)
- ✅ Aufwertungssystem (3er-Linien entfernen, Kätzchen zu Katzen)
- ✅ Kitten Madness Regel
- ✅ Alle Gewinnbedingungen (3 Katzen in Reihe + 8 Katzen auf Brett)
- ✅ Turn-Timer System (30 Sekunden pro Zug)
- ✅ Real-time Multiplayer über Socket.IO
- ✅ Optionaler Timer (einstellbar von Spieler 1 vor dem ersten Zug)
- ✅ Neues Spiel Feature - Spiel zurücksetzen ohne Session zu verlassen
- ✅ Emoji-Kommunikation zwischen Spielern
    - ✅ 10 verschiedene Emojis zur Auswahl (👍, 👎, 😊, 😮, 🤔, 😤, 🎉, 😅, 🤦, ⚡)
    - ✅ Emojis erscheinen als große, schwebende Animation vom Bildschirmrand
    - ✅ Sanfte Bewegung mit natürlicher Physik und Ausblendeffekt
    - ✅ Keine Wartezeit - unbegrenzte Emoji-Kommunikation

**Was noch in Arbeit ist:**
- Weitere Features nach Bedarf
    


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
