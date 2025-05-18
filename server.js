const express = require('express');
const BOARD_SIZE = 6;
const http = require('http');
const socketIo = require('socket.io');

const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let sessions = {};

function createSession() {
    const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    sessions[sessionId] = {
        players: {},
        currentPlayer: null,
        gameBoard: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
        gameActive: false
    };
    console.log(`Session created: ${sessionId}`);
    return sessionId;
}

function joinSession(sessionId, socket) {
    if (!sessions[sessionId]) {
        console.log(`Session ${sessionId} does not exist`);
        socket.emit('error', { message: 'Session does not exist' });
        return false;
    }
    const session = sessions[sessionId];
    if (Object.keys(session.players).length >= 2) {
        console.log(`Session ${sessionId} is full`);
        socket.emit('error', { message: 'Session is full' });
        return false;
    }
    const playerId = socket.id;
    const playerSymbol = Object.keys(session.players).length === 0 ? 'P1' : 'P2';
    const playerColors = { P1: 'Player 1 (Red)', P2: 'Player 2 (Blue)' };
    session.players[playerId] = {
        id: playerId,
        name: playerColors[playerSymbol],
        symbol: playerSymbol,
        kittensOnBoard: 0,
        catsOnBoard: 0,
        catsInSupply: 8, // Max 8 cats per player
        totalPiecesAllowed: 8,
        specialPromotionOffered: false
    };
    socket.join(sessionId);
    console.log(`Player ${playerId} joined session ${sessionId} as ${playerSymbol}`);
    socket.emit('playerAssignment', { playerId, symbol: playerSymbol, name: playerColors[playerSymbol] });
    io.to(sessionId).emit('playerJoined', { playerId, name: playerColors[playerSymbol] });
    if (Object.keys(session.players).length === 2) {
        session.gameActive = true;
        session.currentPlayer = 'P1';
        console.log(`Game started in session ${sessionId}`);
        io.to(sessionId).emit('gameStart', { board: session.gameBoard, currentPlayer: session.currentPlayer });
    }
    return true;
}

// Helper function to perform the booping
function boopPieces(board, placedRow, placedCol) {
    console.log(`[DEBUG] boopPieces called for piece at [${placedRow}, ${placedCol}]`);
    const boopedPieces = [];
    const boopingPiece = board[placedRow][placedCol];
    if (!boopingPiece) return boopedPieces; // Should not happen

    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    for (const [dr, dc] of directions) {
        const neighborRow = placedRow + dr;
        const neighborCol = placedCol + dc;

        if (neighborRow >= 0 && neighborRow < BOARD_SIZE && neighborCol >= 0 && neighborCol < BOARD_SIZE) {
            const pieceToBoop = board[neighborRow][neighborCol];
            if (pieceToBoop) {
                // Rule: A kitten cannot boop a cat. (For now, only kittens exist)
                if (boopingPiece.type === 'kitten' && pieceToBoop.type === 'cat') {
                    continue;
                }

                const targetRow = neighborRow + dr;
                const targetCol = neighborCol + dc;

                if (targetRow >= 0 && targetRow < BOARD_SIZE && targetCol >= 0 && targetCol < BOARD_SIZE) {
                    // Target is on the board
                    if (board[targetRow][targetCol] === null) { // Target is empty, move the piece
                        console.log(`[DEBUG] Booping piece from [${neighborRow}, ${neighborCol}] to [${targetRow}, ${targetCol}]`);
                        board[targetRow][targetCol] = pieceToBoop;
                        board[neighborRow][neighborCol] = null;
                        boopedPieces.push({from: [neighborRow, neighborCol], to: [targetRow, targetCol]});
                    } else {
                        // Target is occupied, pieceToBoop does not move.
                    }
                } else {
                    // Target is off the board, remove the piece
                    console.log(`[DEBUG] Booping piece from [${neighborRow}, ${neighborCol}] off board.`);
                    board[neighborRow][neighborCol] = null;
                    boopedPieces.push({from: [neighborRow, neighborCol], to: null});
                }
            }
        }
    }
    return boopedPieces;
}

// Helper function to check for kitten promotion
function checkForKittenPromotion(board, playerSymbol, sessionId, outCatCoordinate) {
    console.log(`[DEBUG] checkForKittenPromotion loop called for player ${playerSymbol}`);
    // Check for three kittens in a row for the given player
    const lines = [
        // Horizontal
        ...Array.from({ length: BOARD_SIZE }, (_, row) => ({
            type: 'H',
            coords: Array.from({ length: BOARD_SIZE - 2 }, (_, col) => [
                [row, col], [row, col + 1], [row, col + 2]
            ])
        })),
        // Vertical
        ...Array.from({ length: BOARD_SIZE - 2 }, (_, row) => ({
            type: 'V',
            coords: Array.from({ length: BOARD_SIZE }, (_, col) => [
                [row, col], [row + 1, col], [row + 2, col]
            ])
        })),
        // Diagonal /
        ...Array.from({ length: BOARD_SIZE - 2 }, (_, row) => ({
            type: 'D1',
            coords: Array.from({ length: BOARD_SIZE - 2 }, (_, col) => [
                [row, col], [row + 1, col + 1], [row + 2, col + 2]
            ])
        })),
        // Diagonal \
        ...Array.from({ length: BOARD_SIZE - 2 }, (_, row) => ({
            type: 'D2',
            coords: Array.from({ length: BOARD_SIZE - 2 }, (_, col) => [
                [row, col + 2], [row + 1, col + 1], [row + 2, col]
            ])
        }))
    ];

    for (const line of lines) {
        for (const coordSet of line.coords) {
            const [k1_pos, k2_pos, k3_pos] = coordSet;
            const k1 = board[k1_pos[0]][k1_pos[1]];
            const k2 = board[k2_pos[0]][k2_pos[1]];
            const k3 = board[k3_pos[0]][k3_pos[1]];

            if (k1 && k2 && k3 &&
                k1.type === 'kitten' && k2.type === 'kitten' && k3.type === 'kitten' &&
                k1.player === playerSymbol && k2.player === playerSymbol && k3.player === playerSymbol) {

                console.log(`[DEBUG] Promoting kitten to cat for ${playerSymbol}. Line type ${line.type}: [${k1_pos}], [${k2_pos}], [${k3_pos}]`);

                const promotingPlayerSocketId = Object.keys(sessions[sessionId].players).find(id => sessions[sessionId].players[id].symbol === playerSymbol);
                if (promotingPlayerSocketId && sessions[sessionId].players[promotingPlayerSocketId].catsInSupply > 0) {
                    board[k1_pos[0]][k1_pos[1]] = null;
                    board[k3_pos[0]][k3_pos[1]] = null;
                    board[k2_pos[0]][k2_pos[1]] = { type: 'cat', player: playerSymbol }; // Place cat in middle
                    sessions[sessionId].players[promotingPlayerSocketId].catsInSupply--; // Decrement supply
                    // Counts will be updated globally later in makeMove

                    outCatCoordinate.row = k2_pos[0];
                    outCatCoordinate.col = k2_pos[1];
                    
                    console.log(`[DEBUG] Normal promotion for ${playerSymbol}. Cats left: ${sessions[sessionId].players[promotingPlayerSocketId].catsInSupply}`);
                    return true; // Promoted one line, exit for re-scan from makeMove
                } else {
                    console.log(`[DEBUG] Promotion for ${playerSymbol} skipped, no cats in supply.`);
                }
            }
        }
    }
    return false;
}

// Helper function to check for a win condition (three cats in a row)
function updatePlayerPieceCounts(board, playersMap) {
    // Reset counts
    for (const id in playersMap) {
        playersMap[id].kittensOnBoard = 0;
        playersMap[id].catsOnBoard = 0;
    }
    // Recalculate
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r][c];
            if (piece) {
                const playerSocketId = Object.keys(playersMap).find(id => playersMap[id].symbol === piece.player);
                if (playerSocketId) {
                    if (piece.type === 'kitten') {
                        playersMap[playerSocketId].kittensOnBoard++;
                    } else if (piece.type === 'cat') {
                        playersMap[playerSocketId].catsOnBoard++;
                    }
                }
            }
        }
    }
    console.log(`[DEBUG] Piece counts updated: P1 Kittens: ${Object.values(playersMap)[0]?.kittensOnBoard}, Cats: ${Object.values(playersMap)[0]?.catsOnBoard}, Supply: ${Object.values(playersMap)[0]?.catsInSupply} | P2 Kittens: ${Object.values(playersMap)[1]?.kittensOnBoard}, Cats: ${Object.values(playersMap)[1]?.catsOnBoard}, Supply: ${Object.values(playersMap)[1]?.catsInSupply}`);
}

function checkForWin(board, playerSymbol) {
    const lines = [
        // Horizontal
        [[0,0],[0,1],[0,2]], [[0,1],[0,2],[0,3]], [[0,2],[0,3],[0,4]], [[0,3],[0,4],[0,5]],
        [[1,0],[1,1],[1,2]], [[1,1],[1,2],[1,3]], [[1,2],[1,3],[1,4]], [[1,3],[1,4],[1,5]],
        [[2,0],[2,1],[2,2]], [[2,1],[2,2],[2,3]], [[2,2],[2,3],[2,4]], [[2,3],[2,4],[2,5]],
        [[3,0],[3,1],[3,2]], [[3,1],[3,2],[3,3]], [[3,2],[3,3],[3,4]], [[3,3],[3,4],[3,5]],
        [[4,0],[4,1],[4,2]], [[4,1],[4,2],[4,3]], [[4,2],[4,3],[4,4]], [[4,3],[4,4],[4,5]],
        [[5,0],[5,1],[5,2]], [[5,1],[5,2],[5,3]], [[5,2],[5,3],[5,4]], [[5,3],[5,4],[5,5]],
        // Vertical
        [[0,0],[1,0],[2,0]], [[1,0],[2,0],[3,0]], [[2,0],[3,0],[4,0]], [[3,0],[4,0],[5,0]],
        [[0,1],[1,1],[2,1]], [[1,1],[2,1],[3,1]], [[2,1],[3,1],[4,1]], [[3,1],[4,1],[5,1]],
        [[0,2],[1,2],[2,2]], [[1,2],[2,2],[3,2]], [[2,2],[3,2],[4,2]], [[3,2],[4,2],[5,2]],
        [[0,3],[1,3],[2,3]], [[1,3],[2,3],[3,3]], [[2,3],[3,3],[4,3]], [[3,3],[4,3],[5,3]],
        [[0,4],[1,4],[2,4]], [[1,4],[2,4],[3,4]], [[2,4],[3,4],[4,4]], [[3,4],[4,4],[5,4]],
        [[0,5],[1,5],[2,5]], [[1,5],[2,5],[3,5]], [[2,5],[3,5],[4,5]], [[3,5],[4,5],[5,5]],
        // Diagonal (top-left to bottom-right)
        [[0,0],[1,1],[2,2]], [[1,1],[2,2],[3,3]], [[2,2],[3,3],[4,4]], [[3,3],[4,4],[5,5]],
        [[0,1],[1,2],[2,3]], [[1,2],[2,3],[3,4]], [[2,3],[3,4],[4,5]],
        [[0,2],[1,3],[2,4]], [[1,3],[2,4],[3,5]],
        [[0,3],[1,4],[2,5]],
        [[1,0],[2,1],[3,2]], [[2,1],[3,2],[4,3]], [[3,2],[4,3],[5,4]],
        [[2,0],[3,1],[4,2]], [[3,1],[4,2],[5,3]],
        [[3,0],[4,1],[5,2]],
        // Diagonal (bottom-left to top-right)
        [[5,0],[4,1],[3,2]], [[4,1],[3,2],[2,3]], [[3,2],[2,3],[1,4]], [[2,3],[1,4],[0,5]],
        [[5,1],[4,2],[3,3]], [[4,2],[3,3],[2,4]], [[3,3],[2,4],[1,5]],
        [[5,2],[4,3],[3,4]], [[4,3],[3,4],[2,5]],
        [[5,3],[4,4],[3,5]],
        [[4,0],[3,1],[2,2]], [[3,1],[2,2],[1,3]], [[2,2],[1,3],[0,4]],
        [[3,0],[2,1],[1,2]], [[2,1],[1,2],[0,3]],
        [[2,0],[1,1],[0,2]]
    ];

    for (const line of lines) {
        const [p1, p2, p3] = line;
        const piece1 = board[p1[0]][p1[1]];
        const piece2 = board[p2[0]][p2[1]];
        const piece3 = board[p3[0]][p3[1]];

        if (piece1 && piece1.type === 'cat' && piece1.player === playerSymbol &&
            piece2 && piece2.type === 'cat' && piece2.player === playerSymbol &&
            piece3 && piece3.type === 'cat' && piece3.player === playerSymbol) {
            return true; // Win detected
        }
    }
    return false; // No win
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('joinSession', (data) => {
        if (!data || !data.sessionId) {
            console.log(`Invalid joinSession request from ${socket.id}`);
            socket.emit('error', { message: 'Invalid session ID' });
            return;
        }
        const { sessionId } = data;
        console.log(`Attempting to join session ${sessionId} for client ${socket.id}`);
        joinSession(sessionId, socket);
    });

    socket.on('createSession', () => {
        const sessionId = createSession();
        console.log(`Session ${sessionId} created for client ${socket.id}`);
        socket.emit('sessionCreated', { sessionId });
        joinSession(sessionId, socket);
    });

    socket.on('makeMove', (data) => {
        if (!data || !data.sessionId) {
            console.log(`Invalid makeMove request from ${socket.id}`);
            socket.emit('error', { message: 'Invalid session ID' });
            return;
        }
        const { row, col, sessionId } = data;
        console.log(`Move requested by ${socket.id} in session ${sessionId} at [${row}, ${col}]`);
        const session = sessions[sessionId];
        if (!session) {
            console.log(`Session ${sessionId} does not exist for move by ${socket.id}`);
            socket.emit('error', { message: 'Session does not exist' });
            return;
        }
        if (!session.gameActive) {
            console.log(`Game not active in session ${sessionId} for move by ${socket.id}`);
            socket.emit('error', { message: 'Game is not active' });
            return;
        }
        const playerId = socket.id;
        const player = session.players[playerId];
        if (!player) {
            console.log(`Player ${playerId} not in session ${sessionId}`);
            socket.emit('error', { message: 'You are not in this game' });
            return;
        }
        if (player.symbol !== session.currentPlayer) {
            console.log(`Not ${playerId}'s turn in session ${sessionId}`);
            socket.emit('error', { message: 'It is not your turn' });
            return;
        }
        if (session.gameBoard[row][col] !== null) {
            console.log(`Cell [${row}, ${col}] already occupied in session ${sessionId}`);
            socket.emit('error', { message: 'Cell is already occupied' });
            return;
        }
        if (player.kittensOnBoard >= player.totalPiecesAllowed && !player.specialPromotionOffered) {
            console.log(`Player ${playerId} has no more kittens to place in session ${sessionId}`);
            socket.emit('error', { message: 'You have no more kittens to place' });
            return;
        }

        // Place a kitten
        const placedPiece = { player: player.symbol, type: 'kitten' };
        session.gameBoard[row][col] = placedPiece;
        player.kittensOnBoard++;
        console.log(`Kitten placed by ${playerId} at [${row}, ${col}] in session ${sessionId}`);

        // Process booping
        const booped = boopPieces(session.gameBoard, row, col);

        // Check for promotion
        let outCatCoordinate = { row: null, col: null };
        const promotion = checkForKittenPromotion(session.gameBoard, player.symbol, sessionId, outCatCoordinate);
        let promotedToCats = promotion;

        // Update counts
        updatePlayerPieceCounts(session.gameBoard, session.players);

        // Check for win
        const win = checkForWin(session.gameBoard, player.symbol);

        // Check for special promotion
        if (player.kittensOnBoard === player.totalPiecesAllowed && player.catsInSupply > 0 && !player.specialPromotionOffered) {
            player.specialPromotionOffered = true;
            console.log(`[DEBUG] Special promotion offered to ${player.name} after placing 8th kitten.`);
            socket.emit('offerSpecialPromotion', { message: 'You have placed 8 kittens and can upgrade one of them now.' });
            io.to(sessionId).emit('gameState', { board: session.gameBoard, currentPlayer: session.currentPlayer, message: `${player.name} has placed 8 kittens and can upgrade one.` });
            return;
        }

        // Switch player
        session.currentPlayer = session.currentPlayer === 'P1' ? 'P2' : 'P1';
        console.log(`Turn switched to ${session.currentPlayer} in session ${sessionId}`);

        // Emit update to all in session
        io.to(sessionId).emit('moveMade', {
            board: session.gameBoard,
            currentPlayer: session.currentPlayer,
            booped,
            promotedToCats,
            outCatCoordinate,
            win,
            playerId
        });
        console.log(`Move update emitted to session ${sessionId}`);
    });

    socket.on('executeSpecialPromotion', (data) => {
        const { row, col, sessionId } = data;
        const session = sessions[sessionId];
        if (!session) {
            socket.emit('error', { message: 'Session does not exist' });
            return;
        }
        if (!session.gameActive) {
            socket.emit('error', { message: 'Game is not active' });
            return;
        }
        const playerId = socket.id;
        const player = session.players[playerId];
        if (!player) {
            socket.emit('error', { message: 'You are not in this game' });
            return;
        }
        if (!player.specialPromotionOffered) {
            socket.emit('actionError', { message: 'Cannot perform special promotion now.' });
            return;
        }
        if (row === undefined || col === undefined || row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            socket.emit('actionError', { message: 'Invalid coordinates for special promotion.' });
            console.log(`[ERROR] Invalid coordinates for special promotion by ${player.name}: [${row},${col}]`);
            return;
        }

        const playerRecord = session.players[playerId]; // Player data for the current player
        const piece = session.gameBoard[row][col];

        // Validate: Must have 8 KITTENS on board for THIS special promotion rule
        if (playerRecord.kittensOnBoard !== 8) { 
            socket.emit('actionError', { message: 'You must have exactly 8 kittens on the board for special promotion.' });
            console.log(`[ERROR] Special promotion by ${player.name} failed: does not have 8 kittens on board. Has ${playerRecord.kittensOnBoard}.`);
            return;
        }

        // Validate: Clicked piece must be player's own kitten
        if (!piece || piece.type !== 'kitten' || piece.player !== player.symbol) {
            socket.emit('actionError', { message: 'You can only upgrade your own kitten.' });
            console.log(`[ERROR] Special promotion by ${player.name} failed: piece at [${row},${col}] is not their kitten.`);
            return;
        }

        let message = `${player.name} performed a special upgrade at [${row},${col}].`;

        // Perform upgrade
        session.gameBoard[row][col] = { type: 'cat', player: player.symbol };
        playerRecord.catsInSupply--;
        playerRecord.kittensOnBoard--;
        playerRecord.catsOnBoard++;
        console.log(`[DEBUG] Special promotion for ${player.symbol}. Cats left in supply: ${playerRecord.catsInSupply}`);

        // Boop pieces around the newly formed CAT
        const boopedPiecesFromSpecial = boopPieces(session.gameBoard, row, col);
        if (boopedPiecesFromSpecial.length > 0) {
            message += ` The new cat booped ${boopedPiecesFromSpecial.length} piece(s).`;
            console.log(`[DEBUG] New cat from special promotion booped ${boopedPiecesFromSpecial.length} piece(s).`);
        }

        updatePlayerPieceCounts(session.gameBoard, session.players); // Update counts after booping

        // Check for cascading KITTEN promotions caused by the booping
        let promotionOccurredAgain;
        do {
            promotionOccurredAgain = false;
            const outCatCoordinateAgain = { row: null, col: null };
            if (checkForKittenPromotion(session.gameBoard, player.symbol, sessionId, outCatCoordinateAgain)) {
                promotionOccurredAgain = true;
                message += ` ${player.name} got another promotion!`;
                console.log(`[DEBUG] Cascading kitten promotion for ${player.name} at [${outCatCoordinateAgain.row},${outCatCoordinateAgain.col}] after special upgrade.`);
                
                const boopedPiecesFromPromotion = boopPieces(session.gameBoard, outCatCoordinateAgain.row, outCatCoordinateAgain.col);
                if (boopedPiecesFromPromotion.length > 0) {
                    message += ` That new cat booped ${boopedPiecesFromPromotion.length} piece(s).`;
                    console.log(`[DEBUG] Cat from cascading promotion booped ${boopedPiecesFromPromotion.length} piece(s).`);
                }
                updatePlayerPieceCounts(session.gameBoard, session.players); // Update counts after each promotion and subsequent boop
            }
        } while (promotionOccurredAgain);
        // Final count update before win check / turn switch.
        updatePlayerPieceCounts(session.gameBoard, session.players);

        // Check for win condition: full cat board or three cats in a row
        const fullCatsAfterSpecial = playerRecord.catsOnBoard === playerRecord.totalPiecesAllowed;
        if (fullCatsAfterSpecial) {
            session.gameActive = false;
            message = `${player.name} WINS by placing all ${playerRecord.totalPiecesAllowed} cats on the board (after special upgrade)! Game Over.`;
            io.to(sessionId).emit('gameOver', { winnerName: player.name, board: session.gameBoard });
            io.to(sessionId).emit('gameState', { board: session.gameBoard, currentPlayer: null, message: message });
            console.log(message);
            updatePlayerPieceCounts(session.gameBoard, session.players);
        } else if (checkForWin(session.gameBoard, player.symbol)) {
            session.gameActive = false;
            message = `${player.name} WINS with three cats in a row (after special upgrade)! Game Over.`;
            io.to(sessionId).emit('gameOver', { winnerName: player.name, board: session.gameBoard });
            io.to(sessionId).emit('gameState', { board: session.gameBoard, currentPlayer: null, message: message });
            console.log(message);
            updatePlayerPieceCounts(session.gameBoard, session.players); // Final counts update on game end
        } else {
            // Switch player
            session.currentPlayer = session.currentPlayer === 'P1' ? 'P2' : 'P1';
            message += ` ${session.currentPlayer}'s turn.`;
            io.to(sessionId).emit('gameState', { board: session.gameBoard, currentPlayer: session.currentPlayer, message: message });
            console.log(`Current player: ${session.currentPlayer}`);
        }
        playerRecord.specialPromotionOffered = false;
        socket.emit('hideSpecialPromotion');
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        for (const sessionId in sessions) {
            const session = sessions[sessionId];
            if (session.players[socket.id]) {
                console.log(`Player ${socket.id} left session ${sessionId}`);
                delete session.players[socket.id];
                io.to(sessionId).emit('playerLeft', { playerId: socket.id });
                if (Object.keys(session.players).length < 2) {
                    session.gameActive = false;
                    console.log(`Game ended in session ${sessionId} due to player disconnect`);
                    io.to(sessionId).emit('gameEnd', { reason: 'A player disconnected' });
                }
            }
        }
    });
});

server.listen(port, () => console.log(`Listening on port ${port}`));
