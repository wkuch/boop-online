const socket = io();

const gameBoardElement = document.getElementById('game-board');
const statusMessageElement = document.getElementById('status-message');
const currentPlayerDisplayElement = document.getElementById('current-player-display');
const playerIdDisplayElement = document.getElementById('player-id-display');
const inviteLinkElement = document.getElementById('invite-link');
const supplyDisplayElement = document.getElementById('supply-display');
const timerDisplayElement = document.getElementById('timer-display');

let myPlayerId = null;
let mySymbol = null;
let myName = '';
let currentSessionId = null;
let currentTimer = null;
let timerEnabled = false;
let currentPlayer = null;

function clearStatusMessage() {
    statusMessageElement.textContent = '';
    statusMessageElement.setAttribute('data-empty', 'true');
}

function setStatusMessage(message) {
    statusMessageElement.textContent = message;
    statusMessageElement.removeAttribute('data-empty');
}

function updateTimerControls() {
    const toggleButton = document.getElementById('timer-toggle');
    const timerHelp = document.getElementById('timer-help');
    const timerStatus = document.getElementById('timer-status');
    const timerStatusText = document.getElementById('timer-status-text');
    
    if (mySymbol === 'Spieler 1') {
        // Show button and help text for player 1
        if (toggleButton) {
            toggleButton.textContent = timerEnabled ? '⏱️ Timer: AN' : '⏱️ Timer: AUS';
            toggleButton.style.backgroundColor = timerEnabled ? '#4CAF50' : '#f44336';
            toggleButton.style.display = 'block';
        }
        if (timerHelp) timerHelp.style.display = 'block';
        if (timerStatus) timerStatus.style.display = 'none';
    } else {
        // Show status message for player 2
        if (toggleButton) toggleButton.style.display = 'none';
        if (timerHelp) timerHelp.style.display = 'none';
        if (timerStatus && timerStatusText) {
            timerStatusText.textContent = timerEnabled ? 'Timer ist aktiviert' : 'Timer ist deaktiviert';
            timerStatus.style.display = 'block';
        }
    }
}

function createBoard(boardData) {
    gameBoardElement.innerHTML = ''; // Clear previous board
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.addEventListener('click', () => handleCellClick(i, j));

            const piece = boardData[i][j];
            if (piece) {
                // Display image for piece
                const img = document.createElement('img');
                const imgName = piece.type === 'kitten'
                    ? (piece.player === 'Spieler 1' ? '/images/kitten-orange.png' : '/images/kitten-grey.png')
                    : (piece.player === 'Spieler 1' ? '/images/cat-orange.png' : '/images/cat-grey.png');
                img.src = imgName;
                // Fill the entire cell
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.objectPosition = 'center';
                cell.appendChild(img);
            }
            gameBoardElement.appendChild(cell);
        }
    }
}

function handleCellClick(row, col) {
    console.log(`[CLIENT DEBUG] handleCellClick invoked for [${row},${col}]. specialPromotionActive is currently: ${specialPromotionActive}`);
    const cell = gameBoardElement.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
    const pieceElement = cell.firstChild;

    if (specialPromotionActive) {
        if (pieceElement && pieceElement.tagName === 'IMG' && pieceElement.src.includes('kitten')) {
            // Check if it's the current player's kitten
            console.log('[CLIENT DEBUG] Clicked pieceElement src:', pieceElement.src);
            let isMyKitten = false;
            if (mySymbol === 'Spieler 1' && pieceElement.src.includes('kitten-orange.png')) {
                isMyKitten = true;
            } else if (mySymbol === 'Spieler 2' && pieceElement.src.includes('kitten-grey.png')) {
                isMyKitten = true;
            }

            if (isMyKitten) {
                console.log(`Attempting special promotion for cell [${row},${col}] as ${myName}`);
                socket.emit('executeSpecialPromotion', { row, col, sessionId: currentSessionId });
                specialPromotionActive = false; // Consume the offer
                console.log('[CLIENT DEBUG] specialPromotionActive set to false in handleCellClick after emitting executeSpecialPromotion.');
                if (specialPromotionOfferArea) specialPromotionOfferArea.style.display = 'none';
                console.log(`[CLIENT DEBUG] Clicked on a kitten, but not player's own, during special promo. My Symbol: ${mySymbol}, Clicked piece src: ${pieceElement.src}`);
            } else {
                showNotification('Bitte klicke auf eines DEINER KÄTZCHEN für die Beförderung.');
                console.log(`[CLIENT DEBUG] Clicked on a kitten, but not player's own, during special promo. My Symbol: ${mySymbol}, Clicked piece src: ${pieceElement.src}`);
            }
        } else {
            // Clicked on an empty cell or a cat during special promotion mode
            showNotification('Besondere Beförderung: Bitte klicke auf eines deiner KÄTZCHEN.');
            console.log('[CLIENT DEBUG] Clicked on empty cell or cat during special promo mode.');
        }
    } else { // Not special promotion active: normal move
        if (pieceElement) { // Cell is already occupied
            console.log('Cell already occupied. Cannot place new piece here.');
            return;
        }
        // If cell is empty, proceed to make a move
        console.log(`Making a normal move for cell [${row},${col}] as ${myName}`);
        // Get selected piece type from UI
        const pieceType = document.querySelector('input[name="pieceType"]:checked').value;
        socket.emit('makeMove', { row, col, sessionId: currentSessionId, pieceType });
    }
}

function getSessionIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('session');
}

function updateInviteLink(sessionId) {
    const inviteLink = `${window.location.origin}?session=${sessionId}`;
    const inviteLinkElement = document.getElementById('invite-link');
    if (inviteLinkElement) {
        inviteLinkElement.href = inviteLink;
        inviteLinkElement.textContent = inviteLink;
    }
}

function updatePlayerDisplay() {
    if (mySymbol && myName) {
        const playerColor = mySymbol === 'Spieler 1' ? '🧡' : '🩶';
        playerIdDisplayElement.textContent = `${playerColor} Du bist ${myName}`;
    }
}

function updateTurnDisplay(currentPlayerParam) {
    currentPlayer = currentPlayerParam; // Track current player globally
    const isMyTurn = currentPlayerParam === mySymbol;
    const turnElement = currentPlayerDisplayElement;
    
    if (currentPlayerParam) {
        if (isMyTurn) {
            turnElement.textContent = `🎯 Du bist dran!`;
            turnElement.className = 'turn-display your-turn';
        } else {
            turnElement.textContent = `⏳ ${currentPlayerParam} ist dran`;
            turnElement.className = 'turn-display opponent-turn';
        }
    } else {
        turnElement.textContent = 'Warten auf Spieler...';
        turnElement.className = 'turn-display';
    }
    
    // Note: low-time indicator is managed by the timer, not by turn display
}

function updateTimerDisplay(seconds) {
    if (!timerDisplayElement) return;
    
    // Clear any existing timer
    if (currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
    }
    
    // If timer is disabled, hide the timer display completely
    if (!timerEnabled) {
        timerDisplayElement.textContent = '';
        gameBoardElement.classList.remove('low-time');
        return;
    }
    
    // Store the end time (current time + seconds)
    const endTime = Date.now() + (seconds * 1000);
    
    // Update the timer display
    const updateTimer = () => {
        // Check if timer is still enabled
        if (!timerEnabled) {
            clearInterval(currentTimer);
            currentTimer = null;
            timerDisplayElement.textContent = '';
            gameBoardElement.classList.remove('low-time');
            return;
        }
        
        // Calculate remaining time in seconds
        const remainingMs = endTime - Date.now();
        const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        
        if (remainingSeconds <= 0) {
            clearInterval(currentTimer);
            currentTimer = null;
            timerDisplayElement.textContent = 'Zeit abgelaufen!';
            timerDisplayElement.className = 'timer-expired';
            gameBoardElement.classList.remove('low-time');
            return;
        }
        
        // Format the time as MM:SS
        const minutes = Math.floor(remainingSeconds / 60);
        const secs = remainingSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        // Update the display - always show timer when enabled
        // Determine if it's my turn (use mySymbol, not myName)
        const isMyTurn = (currentPlayer === mySymbol);
        
        if (isMyTurn) {
            timerDisplayElement.textContent = `⏱️ ${formattedTime}`;
        } else {
            timerDisplayElement.textContent = `⏱️ ${formattedTime} (Gegner)`;
        }
        
        // Add warning class and board indicator when time is running low AND it's my turn
        if (remainingSeconds <= 10 && isMyTurn) {
            timerDisplayElement.className = 'timer-warning';
            gameBoardElement.classList.add('low-time');
        } else {
            timerDisplayElement.className = 'timer-normal';
            gameBoardElement.classList.remove('low-time');
        }
    };
    
    // Initial update
    updateTimer();
    
    // Start the timer - update every 100ms for smoother countdown
    currentTimer = setInterval(updateTimer, 100);
}

function showNotification(message) {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff6b6b;
        color: white;
        padding: 1rem 2rem;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: slideDown 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease-out forwards';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Copy invite link function
function copyInviteLink() {
    const inviteLink = document.getElementById('invite-link');
    if (inviteLink && inviteLink.href !== '#') {
        navigator.clipboard.writeText(inviteLink.href).then(() => {
            const copyButton = document.querySelector('.copy-button');
            const originalText = copyButton.textContent;
            copyButton.textContent = '✅ Kopiert!';
            copyButton.style.background = '#4CAF50';
            
            setTimeout(() => {
                copyButton.textContent = originalText;
                copyButton.style.background = '';
            }, 2000);
        }).catch(() => {
            showNotification('Kopieren fehlgeschlagen. Bitte manuell kopieren.');
        });
    }
}

// Make copyInviteLink globally available
window.copyInviteLink = copyInviteLink;

socket.on('sessionCreated', (data) => {
    const { sessionId } = data;
    currentSessionId = sessionId;
    updateInviteLink(sessionId);
    history.pushState({}, '', `?session=${sessionId}`);
    console.log(`Session created: ${sessionId}`);
});

socket.on('playerAssignment', (data) => {
    myPlayerId = data.playerId;
    mySymbol = data.symbol;
    myName = data.name;
    
    // Initialize timer state from server
    if (data.timerEnabled !== undefined) {
        timerEnabled = data.timerEnabled;
        updateTimerControls();
    }
    
    updatePlayerDisplay();
    updateNewGameButton();
    console.log(`Assigned Player ID: ${myPlayerId}, Symbol: ${mySymbol}, Name: ${myName}`);
});

socket.on('playerJoined', (data) => {
    console.log(`Player joined: ${data.playerId} (${data.name})`);
    setStatusMessage(`🎉 ${data.name} ist dem Spiel beigetreten!`);
});

socket.on('gameStart', (data) => {
    console.log('Game started!');
    createBoard(data.board);
    setStatusMessage('🚀 Spiel gestartet!');
    updateTurnDisplay(data.currentPlayer);
    gameBoardElement.style.pointerEvents = 'auto'; // Enable interaction
    // Update supply display
    if (supplyDisplayElement && data.supplies && mySymbol) {
        const mySupply = data.supplies[mySymbol];
        supplyDisplayElement.textContent = `🐱 Kätzchen: ${mySupply.kittensInSupply} | 🐈 Katzen: ${mySupply.catsInSupply}`;
    }
    
    // Initialize timer state
    timerEnabled = data.timerEnabled !== undefined ? data.timerEnabled : false;
    updateTimerControls();
    
    // Initialize timer if enabled and provided
    if (timerEnabled && data.remainingTime) {
        updateTimerDisplay(data.remainingTime);
    } else if (!timerEnabled) {
        timerDisplayElement.textContent = '';
        gameBoardElement.classList.remove('low-time');
    }
});

socket.on('moveMade', (data) => {
    console.log('Move made:', data);
    createBoard(data.board);
    updateTurnDisplay(data.currentPlayer);
    // Update supply display
    if (supplyDisplayElement && data.supplies && mySymbol) {
        const mySupply = data.supplies[mySymbol];
        supplyDisplayElement.textContent = `🐱 Kätzchen: ${mySupply.kittensInSupply} | 🐈 Katzen: ${mySupply.catsInSupply}`;
    }
    if (data.win) {
        setStatusMessage(`🎊 ${data.playerId} gewinnt!`);
        gameBoardElement.style.pointerEvents = 'none'; // Disable interaction
        socket.emit('gameEnd', { reason: 'Win condition met' });
    } else {
        clearStatusMessage();
    }
    
    // Reset timer if provided
    if (data.remainingTime) {
        updateTimerDisplay(data.remainingTime);
    }
});

socket.on('playerLeft', (data) => {
    console.log(`Player left: ${data.playerId}`);
    setStatusMessage(`👋 ${data.playerId} hat das Spiel verlassen.`);
});

socket.on('gameEnd', (data) => {
    console.log('Game ended:', data.reason);
    setStatusMessage(`🏁 Spiel beendet: ${data.reason}`);
    gameBoardElement.style.pointerEvents = 'none'; // Disable interaction
    
    // Clear the timer
    if (currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
    }
    if (timerDisplayElement) {
        timerDisplayElement.textContent = '';
    }
    gameBoardElement.classList.remove('low-time');
});

socket.on('error', (data) => {
    console.error('Error:', data.message);
    setStatusMessage(`❌ Fehler: ${data.message}`);
});

socket.on('invalidMove', (message) => {
    console.warn('Invalid move:', message);
    showNotification(`Ungültiger Zug: ${message}`);
});

socket.on('gameFull', (message) => {
    showNotification(message);
    setStatusMessage(message);
    playerIdDisplayElement.textContent = '👁️ Zuschauer-Modus (Spiel voll)';
    // Disable board interaction if game is full and client is not a player
    gameBoardElement.style.pointerEvents = 'none'; 
});

socket.on('playerDisconnected', (message) => {
    showNotification(message);
    setStatusMessage(message);
    currentPlayerDisplayElement.textContent = 'Warten auf Spieler...';
    // Potentially clear board or show a reset state
    createBoard(Array(6).fill(null).map(() => Array(6).fill(null))); // Reset to empty board
    gameBoardElement.style.pointerEvents = 'auto'; // Re-enable board on reset
});

socket.on('gameOver', (data) => {
    console.log('Game Over:', data);
    setStatusMessage(`🎊 ${data.winnerName} GEWINNT! Spiel beendet.`);
    updateTurnDisplay(null);
    showNotification(`${data.winnerName} GEWINNT! 🎉`);
    // Disable further moves by making the board non-interactive
    gameBoardElement.style.pointerEvents = 'none';
    
    // Clear the timer
    if (currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
    }
    if (timerDisplayElement) {
        timerDisplayElement.textContent = '';
    }
    gameBoardElement.classList.remove('low-time');
});

let specialPromotionActive = false;
const specialPromotionButton = document.getElementById('specialPromotionButton');
const specialPromotionMessageElement = document.getElementById('specialPromotionMessage');
const specialPromotionOfferArea = document.getElementById('specialPromotionOfferArea');

if (specialPromotionButton) {
    specialPromotionButton.style.display = 'none'; // Hide by default
    specialPromotionButton.addEventListener('click', () => {
        // The message is now static in index.html; data.message is used for the toast notification.
    });
}

socket.on('offerSpecialPromotion', (data) => {
    console.log('Special promotion offered:', data.message);
    statusMessageElement.textContent = data.message;
    specialPromotionActive = true;
    if (specialPromotionOfferArea) {
        specialPromotionOfferArea.style.display = 'block';
    }
});

socket.on('hideSpecialPromotion', () => {
    console.log('Hiding special promotion offer');
    specialPromotionActive = false;
    if (specialPromotionOfferArea) {
        specialPromotionOfferArea.style.display = 'none';
    }
});

socket.on('gameState', (data) => {
    console.log('GameState received:', data);
    createBoard(data.board);
    updateTurnDisplay(data.currentPlayer);
    if (data.message) {
        setStatusMessage(data.message);
    } else {
        clearStatusMessage();
    }
    // Update supply display
    if (supplyDisplayElement && data.supplies && mySymbol) {
        const mySupply = data.supplies[mySymbol];
        supplyDisplayElement.textContent = `🐱 Kätzchen: ${mySupply.kittensInSupply} | 🐈 Katzen: ${mySupply.catsInSupply}`;
    }
    
    // Reset timer if provided
    if (data.remainingTime) {
        updateTimerDisplay(data.remainingTime);
    }

    // If game is over or currentPlayer is null (e.g. before game starts), 
    // any pending special promotion offer is implicitly void.
    if (!data.currentPlayer || data.message.includes('Game Over')) {
        if (specialPromotionActive) {
            console.log('[CLIENT DEBUG] specialPromotionActive set to false due to game state change (game over or player reset).');
            specialPromotionActive = false;
            if (specialPromotionButton) specialPromotionButton.style.display = 'none';
            // The special promotion message is static in index.html and should not be cleared here.
        }
    }
});

// Add event listeners for timer updates
socket.on('timerUpdate', (data) => {
    if (data.remainingTime !== undefined) {
        updateTimerDisplay(data.remainingTime);
    }
});

// Add event listener for turn skipped due to timeout
socket.on('turnSkipped', (data) => {
    console.log('Turn skipped:', data);
    showNotification(data.message);
    statusMessageElement.textContent = data.message;
    updateTurnDisplay(data.currentPlayer);
});

socket.on('timerToggled', (data) => {
    timerEnabled = data.enabled;
    updateTimerControls();
    
    if (!timerEnabled && currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
        timerDisplayElement.textContent = '';
        gameBoardElement.classList.remove('low-time');
    }
    
    showNotification(`Timer ${timerEnabled ? 'aktiviert' : 'deaktiviert'}`);
});

socket.on('newGameStarted', (data) => {
    console.log('New game started');
    showNotification('🔄 Neues Spiel gestartet!');
    
    // Reset UI elements
    clearStatusMessage();
    specialPromotionActive = false;
    hideSpecialPromotionOffer();
    
    // Clear timer if running
    if (currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
        timerDisplayElement.textContent = '';
        gameBoardElement.classList.remove('low-time');
    }
});

socket.on('emojiReceived', (data) => {
    console.log('Emoji received:', data);
    showEmojiPopup(data.emoji, data.senderName);
});

socket.on('error', (data) => {
    console.log('Server error:', data);
    showNotification(data.message);
});

// Initialize
createBoard(Array(6).fill(null).map(() => Array(6).fill(null))); // Initial empty board
gameBoardElement.style.pointerEvents = 'auto'; // Ensure board is interactive at start

console.log('Initializing connection...');
const sessionId = getSessionIdFromUrl();
if (sessionId) {
    console.log(`Joining session from URL: ${sessionId}`);
    currentSessionId = sessionId;
    socket.emit('joinSession', { sessionId });
} else {
    console.log('Creating new session');
    socket.emit('createSession');
}

function requestNewGame() {
    if (mySymbol !== 'Spieler 1') {
        showNotification('Nur Spieler 1 kann ein neues Spiel starten');
        return;
    }
    
    // Show confirmation dialog
    const modal = document.getElementById('new-game-modal');
    modal.style.display = 'flex';
}

function cancelNewGame() {
    const modal = document.getElementById('new-game-modal');
    modal.style.display = 'none';
}

function confirmNewGame() {
    const modal = document.getElementById('new-game-modal');
    modal.style.display = 'none';
    
    // Emit new game request to server
    socket.emit('newGame', { sessionId: currentSessionId });
}

function updateNewGameButton() {
    const newGameBtn = document.getElementById('new-game-btn');
    if (newGameBtn) {
        if (mySymbol === 'Spieler 1') {
            newGameBtn.style.display = 'block';
        } else {
            newGameBtn.style.display = 'none';
        }
    }
}

function sendEmoji(emoji) {
    if (!currentSessionId || !mySymbol) {
        showNotification('Verbindung nicht bereit');
        return;
    }
    
    // No rate limiting - removed cooldown
    socket.emit('sendEmoji', { 
        sessionId: currentSessionId, 
        emoji: emoji,
        senderName: myName 
    });
}

function showEmojiPopup(emoji, senderName) {
    const container = document.getElementById('emoji-popup-container');
    
    // Create simple emoji element
    const popup = document.createElement('div');
    popup.className = 'emoji-popup-simple';
    popup.textContent = emoji;
    
    // Add random horizontal offset
    const offsetX = (Math.random() - 0.5) * 200;
    popup.style.left = `calc(50% + ${offsetX}px)`;
    
    container.appendChild(popup);
    
    // Remove popup after animation completes
    setTimeout(() => {
        if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
    }, 3000);
}

function toggleTimer() {
    if (mySymbol !== 'Spieler 1') {
        showNotification('Nur Spieler 1 kann den Timer ändern');
        return;
    }
    
    // Check if any moves have been made
    const boardEmpty = document.querySelectorAll('.cell img').length === 0;
    if (!boardEmpty) {
        showNotification('Timer kann nur vor dem ersten Zug geändert werden');
        return;
    }
    
    timerEnabled = !timerEnabled;
    socket.emit('toggleTimer', { sessionId: currentSessionId, enabled: timerEnabled });
}
