const socket = io();

const gameBoardElement = document.getElementById('game-board');
const statusMessageElement = document.getElementById('status-message');
const currentPlayerDisplayElement = document.getElementById('current-player-display');
const playerIdDisplayElement = document.getElementById('player-id-display');
const inviteLinkElement = document.getElementById('invite-link');
const supplyDisplayElement = document.getElementById('supply-display');

let myPlayerId = null;
let mySymbol = null;
let myName = '';
let currentSessionId = null;

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
                    ? (piece.player === 'P1' ? '/images/kitten-orange.png' : '/images/kitten-grey.png')
                    : (piece.player === 'P1' ? '/images/cat-orange.png' : '/images/cat-grey.png');
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
            if (mySymbol === 'P1' && pieceElement.src.includes('kitten-orange.png')) {
                isMyKitten = true;
            } else if (mySymbol === 'P2' && pieceElement.src.includes('kitten-grey.png')) {
                isMyKitten = true;
            }

            if (isMyKitten) {
                console.log(`Attempting special promotion for cell [${row},${col}] as ${myName}`);
                socket.emit('executeSpecialPromotion', { row, col, sessionId: currentSessionId });
                specialPromotionActive = false; // Consume the offer
                console.log('[CLIENT DEBUG] specialPromotionActive set to false in handleCellClick after emitting executeSpecialPromotion.');
                if (specialPromotionOfferArea) specialPromotionOfferArea.style.display = 'none'; // Use correct variable name
                if (specialPromotionMessageElement) specialPromotionMessageElement.textContent = '';
            } else {
                alert('Please click on one of YOUR KITTENS to perform the special upgrade.');
                console.log(`[CLIENT DEBUG] Clicked on a kitten, but not player's own, during special promo. My Symbol: ${mySymbol}, Clicked piece src: ${pieceElement.src}`);
            }
        } else {
            // Clicked on an empty cell or a cat during special promotion mode
            alert('Special Promotion: Please click on one of your KITTENS to upgrade. Clicking on an empty cell or a cat is not valid for this action.');
            console.log('[CLIENT DEBUG] Clicked on empty cell or cat during special promo mode.');
        }
    } else { // Not special promotion active: normal move
        if (pieceElement) { // Cell is already occupied
            console.log('Cell already occupied. Cannot place new piece here.');
            // alert('Cell is already occupied.'); // Optional user feedback
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
    playerIdDisplayElement.textContent = `Player ID: ${myPlayerId} (${myName})`;
    console.log(`Assigned Player ID: ${myPlayerId}, Symbol: ${mySymbol}, Name: ${myName}`);
});

socket.on('playerJoined', (data) => {
    console.log(`Player joined: ${data.playerId} (${data.name})`);
    statusMessageElement.textContent = `Player ${data.name} has joined the game.`;
});

socket.on('gameStart', (data) => {
    console.log('Game started!');
    createBoard(data.board);
    statusMessageElement.textContent = 'Game started!';
    currentPlayerDisplayElement.textContent = `Current Player: ${data.currentPlayer}`;
    gameBoardElement.style.pointerEvents = 'auto'; // Enable interaction
    // Update supply display
    if (supplyDisplayElement && data.supplies && mySymbol) {
        const mySupply = data.supplies[mySymbol];
        supplyDisplayElement.textContent = `Vorrat - Kätzchen: ${mySupply.kittensInSupply}, Katzen: ${mySupply.catsInSupply}`;
    }
});

socket.on('moveMade', (data) => {
    console.log('Move made:', data);
    createBoard(data.board);
    currentPlayerDisplayElement.textContent = `Current Player: ${data.currentPlayer}`;
    // Update supply display
    if (supplyDisplayElement && data.supplies && mySymbol) {
        const mySupply = data.supplies[mySymbol];
        supplyDisplayElement.textContent = `Vorrat - Kätzchen: ${mySupply.kittensInSupply}, Katzen: ${mySupply.catsInSupply}`;
    }
    if (data.win) {
        statusMessageElement.textContent = `Player ${data.playerId} wins!`;
        gameBoardElement.style.pointerEvents = 'none'; // Disable interaction
        socket.emit('gameEnd', { reason: 'Win condition met' });
    } else {
        statusMessageElement.textContent = '';
    }
});

socket.on('playerLeft', (data) => {
    console.log(`Player left: ${data.playerId}`);
    statusMessageElement.textContent = `Player ${data.playerId} has left the game.`;
});

socket.on('gameEnd', (data) => {
    console.log('Game ended:', data.reason);
    statusMessageElement.textContent = `Game ended: ${data.reason}`;
    gameBoardElement.style.pointerEvents = 'none'; // Disable interaction
});

socket.on('error', (data) => {
    console.error('Error:', data.message);
    statusMessageElement.textContent = `Error: ${data.message}`;
});

socket.on('invalidMove', (message) => {
    console.warn('Invalid move:', message);
    alert(`Invalid Move: ${message}`); // Simple feedback for now
});

socket.on('gameFull', (message) => {
    alert(message);
    statusMessageElement.textContent = message;
    playerIdDisplayElement.textContent = 'Spectator Mode (Game Full)';
    // Disable board interaction if game is full and client is not a player
    gameBoardElement.style.pointerEvents = 'none'; 
});

socket.on('playerDisconnected', (message) => {
    alert(message);
    statusMessageElement.textContent = message;
    currentPlayerDisplayElement.textContent = 'Waiting for players...';
    // Potentially clear board or show a reset state
    createBoard(Array(6).fill(null).map(() => Array(6).fill(null))); // Reset to empty board
    gameBoardElement.style.pointerEvents = 'auto'; // Re-enable board on reset
});

socket.on('gameOver', (data) => {
    console.log('Game Over:', data);
    statusMessageElement.textContent = `${data.winnerName} WINS! Game Over.`;
    currentPlayerDisplayElement.textContent = 'Game Ended';
    alert(`${data.winnerName} WINS! Game Over.`);
    // Disable further moves by making the board non-interactive
    gameBoardElement.style.pointerEvents = 'none'; 
    // Optionally, you could add a 'New Game' button visibility here.
});

let specialPromotionActive = false;
const specialPromotionButton = document.getElementById('specialPromotionButton'); // Assuming you add a button with this ID
const specialPromotionMessageElement = document.getElementById('specialPromotionMessage'); // Optional message element
const specialPromotionOfferArea = document.getElementById('specialPromotionOfferArea'); // Optional offer area element

if (specialPromotionButton) {
    specialPromotionButton.style.display = 'none'; // Hide by default
    specialPromotionButton.addEventListener('click', () => {
        // This button might not be needed if clicking a kitten directly is preferred after message
        if (specialPromotionMessageElement) specialPromotionMessageElement.textContent = 'Click one of your kittens to upgrade it to a cat!';
        // The actual logic will be in cell click when specialPromotionActive is true
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
    currentPlayerDisplayElement.textContent = data.currentPlayer ? `Current Player: ${data.currentPlayer}` : '';
    statusMessageElement.textContent = data.message || '';
    // Update supply display
    if (supplyDisplayElement && data.supplies && mySymbol) {
        const mySupply = data.supplies[mySymbol];
        supplyDisplayElement.textContent = `Vorrat - Kätzchen: ${mySupply.kittensInSupply}, Katzen: ${mySupply.catsInSupply}`;
    }
});

// Modify gameState listener to hide special promotion if it's no longer offered implicitly by turn change
socket.on('gameState', (data) => {
    console.log('GameState received:', data);
    createBoard(data.board);
    statusMessageElement.textContent = data.message || '';
    currentPlayerDisplayElement.textContent = data.currentPlayer ? `Current Turn: ${data.currentPlayer}` : '';
    // Update supply display
    if (supplyDisplayElement && data.supplies && mySymbol) {
        const mySupply = data.supplies[mySymbol];
        supplyDisplayElement.textContent = `Vorrat - Kätzchen: ${mySupply.kittensInSupply}, Katzen: ${mySupply.catsInSupply}`;
    }

    // If game is over or currentPlayer is null (e.g. before game starts), 
    // any pending special promotion offer is implicitly void.
    if (!data.currentPlayer || data.message.includes('Game Over')) {
        if (specialPromotionActive) { // Only log and hide if it was active
            console.log('[CLIENT DEBUG] specialPromotionActive set to false due to game state change (game over or player reset).');
            specialPromotionActive = false;
            if (specialPromotionButton) specialPromotionButton.style.display = 'none';
            if (specialPromotionMessageElement) specialPromotionMessageElement.textContent = '';
        }
    }
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
