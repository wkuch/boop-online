const socket = io();

const gameBoardElement = document.getElementById('game-board');
const statusMessageElement = document.getElementById('status-message');
const currentPlayerDisplayElement = document.getElementById('current-player-display');
const playerIdDisplayElement = document.getElementById('player-id-display');

let myPlayerId = null;
let mySymbol = null;
let myName = '';

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
                const pieceElement = document.createElement('div');
                pieceElement.classList.add(piece.type); // 'kitten' or 'cat'
                // Add player-specific class, e.g., 'player1-kitten', 'player2-cat'
                const playerClass = piece.player === 'P1' ? 'player1' : 'player2';
                pieceElement.classList.add(`${playerClass}-${piece.type}`);
                // pieceElement.textContent = piece.type === 'kitten' ? 'K' : 'C'; // Simple text, or use CSS for images/icons
                cell.appendChild(pieceElement);
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
        if (pieceElement && pieceElement.classList.contains('kitten')) {
            // Check if it's the current player's kitten
            console.log('[CLIENT DEBUG] Clicked pieceElement classList:', pieceElement.classList);
            let isMyKitten = false;
            if (mySymbol === 'P1' && pieceElement.classList.contains('player1-kitten')) {
                isMyKitten = true;
            } else if (mySymbol === 'P2' && pieceElement.classList.contains('player2-kitten')) {
                isMyKitten = true;
            }

            if (isMyKitten) {
                console.log(`Attempting special promotion for cell [${row},${col}] as ${myName}`);
                socket.emit('executeSpecialPromotion', { row, col });
                specialPromotionActive = false; // Consume the offer
                console.log('[CLIENT DEBUG] specialPromotionActive set to false in handleCellClick after emitting executeSpecialPromotion.');
                if (specialPromotionOfferArea) specialPromotionOfferArea.style.display = 'none'; // Use correct variable name
                if (specialPromotionMessageElement) specialPromotionMessageElement.textContent = '';
            } else {
                alert('Please click on one of YOUR KITTENS to perform the special upgrade.');
                console.log(`[CLIENT DEBUG] Clicked on a kitten, but not player's own, during special promo. My Symbol: ${mySymbol}, Clicked piece classList: ${JSON.stringify(Array.from(pieceElement.classList))}`);
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
        socket.emit('makeMove', { row, col });
    }
}

socket.on('playerAssignment', (data) => {
    myPlayerId = data.playerId;
    mySymbol = data.symbol;
    myName = data.name;
    playerIdDisplayElement.textContent = `You are: ${myName}`;
    console.log('Player assignment:', data);
});

socket.on('gameState', (data) => {
    console.log('GameState received:', data);
    createBoard(data.board);
    statusMessageElement.textContent = data.message || '';
    currentPlayerDisplayElement.textContent = data.currentPlayer ? `Current Turn: ${data.currentPlayer}` : '';
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

if (specialPromotionButton) {
    specialPromotionButton.style.display = 'none'; // Hide by default
    specialPromotionButton.addEventListener('click', () => {
        // This button might not be needed if clicking a kitten directly is preferred after message
        if (specialPromotionMessageElement) specialPromotionMessageElement.textContent = 'Click one of your kittens to upgrade it to a cat!';
        // The actual logic will be in cell click when specialPromotionActive is true
    });
}

socket.on('offerSpecialPromotion', (data) => {
    console.log('[CLIENT DEBUG] Received offerSpecialPromotion. Message:', data.message);
    console.log('[CLIENT DEBUG] specialPromotionActive set to true.');
    specialPromotionActive = true;
    if (specialPromotionButton) specialPromotionButton.style.display = 'block';
    if (specialPromotionMessageElement) {
        specialPromotionMessageElement.textContent = data.message || 'Special promotion available: Click a kitten to upgrade!';
    } else {
        alert(data.message || 'Special promotion available: Click a kitten to upgrade!');
    }
    // No automatic timeout, player needs to act or make a normal move (which server should handle by cancelling offer implicitly)
});

socket.on('hideSpecialPromotion', () => {
    console.log('[CLIENT DEBUG] Received hideSpecialPromotion.');
    console.log('[CLIENT DEBUG] specialPromotionActive set to false by hideSpecialPromotion.');
    specialPromotionActive = false;
    if (specialPromotionButton) specialPromotionButton.style.display = 'none';
    if (specialPromotionMessageElement) specialPromotionMessageElement.textContent = '';
});

// Modify gameState listener to hide special promotion if it's no longer offered implicitly by turn change
socket.on('gameState', (data) => {
    console.log('GameState received:', data);
    createBoard(data.board);
    statusMessageElement.textContent = data.message || '';
    currentPlayerDisplayElement.textContent = data.currentPlayer ? `Current Turn: ${data.currentPlayer}` : '';

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

// Initial setup
statusMessageElement.textContent = 'Connecting to server...';
createBoard(Array(6).fill(null).map(() => Array(6).fill(null))); // Initial empty board
gameBoardElement.style.pointerEvents = 'auto'; // Ensure board is interactive at start
