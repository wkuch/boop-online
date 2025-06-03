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

function updateTurnDisplay(currentPlayer) {
    const isMyTurn = currentPlayer === myName;
    const turnElement = currentPlayerDisplayElement;
    
    if (currentPlayer) {
        if (isMyTurn) {
            turnElement.textContent = `🎯 Du bist dran!`;
            turnElement.className = 'turn-display your-turn';
        } else {
            turnElement.textContent = `⏳ ${currentPlayer} ist dran`;
            turnElement.className = 'turn-display opponent-turn';
        }
    } else {
        turnElement.textContent = 'Warten auf Spieler...';
        turnElement.className = 'turn-display';
    }
}

function updateTimerDisplay(seconds) {
    if (!timerDisplayElement) return;
    
    // Clear any existing timer
    if (currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
    }
    
    // Update the timer display
    const updateTimer = () => {
        if (seconds <= 0) {
            clearInterval(currentTimer);
            timerDisplayElement.textContent = 'Zeit abgelaufen!';
            timerDisplayElement.className = 'timer-expired';
            return;
        }
        
        // Format the time as MM:SS
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        
        // Update the display
        timerDisplayElement.textContent = `⏱️ ${formattedTime}`;
        
        // Add warning class when time is running low
        if (seconds <= 10) {
            timerDisplayElement.className = 'timer-warning';
        } else {
            timerDisplayElement.className = 'timer-normal';
        }
        
        seconds--;
    };
    
    // Initial update
    updateTimer();
    
    // Start the timer
    currentTimer = setInterval(updateTimer, 1000);
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
    updatePlayerDisplay();
    console.log(`Assigned Player ID: ${myPlayerId}, Symbol: ${mySymbol}, Name: ${myName}`);
});

socket.on('playerJoined', (data) => {
    console.log(`Player joined: ${data.playerId} (${data.name})`);
    statusMessageElement.textContent = `🎉 ${data.name} ist dem Spiel beigetreten!`;
});

socket.on('gameStart', (data) => {
    console.log('Game started!');
    createBoard(data.board);
    statusMessageElement.textContent = '🚀 Spiel gestartet!';
    updateTurnDisplay(data.currentPlayer);
    gameBoardElement.style.pointerEvents = 'auto'; // Enable interaction
    // Update supply display
    if (supplyDisplayElement && data.supplies && mySymbol) {
        const mySupply = data.supplies[mySymbol];
        supplyDisplayElement.textContent = `🐱 Kätzchen: ${mySupply.kittensInSupply} | 🐈 Katzen: ${mySupply.catsInSupply}`;
    }
    
    // Initialize timer if provided
    if (data.remainingTime) {
        updateTimerDisplay(data.remainingTime);
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
        statusMessageElement.textContent = `🎊 ${data.playerId} gewinnt!`;
        gameBoardElement.style.pointerEvents = 'none'; // Disable interaction
        socket.emit('gameEnd', { reason: 'Win condition met' });
    } else {
        statusMessageElement.textContent = '';
    }
    
    // Reset timer if provided
    if (data.remainingTime) {
        updateTimerDisplay(data.remainingTime);
    }
});

socket.on('playerLeft', (data) => {
    console.log(`Player left: ${data.playerId}`);
    statusMessageElement.textContent = `👋 ${data.playerId} hat das Spiel verlassen.`;
});

socket.on('gameEnd', (data) => {
    console.log('Game ended:', data.reason);
    statusMessageElement.textContent = `🏁 Spiel beendet: ${data.reason}`;
    gameBoardElement.style.pointerEvents = 'none'; // Disable interaction
    
    // Clear the timer
    if (currentTimer) {
        clearInterval(currentTimer);
        currentTimer = null;
    }
    if (timerDisplayElement) {
        timerDisplayElement.textContent = '';
    }
});

socket.on('error', (data) => {
    console.error('Error:', data.message);
    statusMessageElement.textContent = `❌ Fehler: ${data.message}`;
});

socket.on('invalidMove', (message) => {
    console.warn('Invalid move:', message);
    showNotification(`Ungültiger Zug: ${message}`);
});

socket.on('gameFull', (message) => {
    showNotification(message);
    statusMessageElement.textContent = message;
    playerIdDisplayElement.textContent = '👁️ Zuschauer-Modus (Spiel voll)';
    // Disable board interaction if game is full and client is not a player
    gameBoardElement.style.pointerEvents = 'none'; 
});

socket.on('playerDisconnected', (message) => {
    showNotification(message);
    statusMessageElement.textContent = message;
    currentPlayerDisplayElement.textContent = 'Warten auf Spieler...';
    // Potentially clear board or show a reset state
    createBoard(Array(6).fill(null).map(() => Array(6).fill(null))); // Reset to empty board
    gameBoardElement.style.pointerEvents = 'auto'; // Re-enable board on reset
});

socket.on('gameOver', (data) => {
    console.log('Game Over:', data);
    statusMessageElement.textContent = `🎊 ${data.winnerName} GEWINNT! Spiel beendet.`;
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
    statusMessageElement.textContent = data.message || '';
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
