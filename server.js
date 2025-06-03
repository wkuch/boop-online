const express = require('express');
const BOARD_SIZE = 6;
const http = require('http');
const socketIo = require('socket.io');

const port = process.env.PORT || 3000;
const TURN_TIMEOUT = 30000; // 30 seconds in milliseconds

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
        gameActive: false,
        turnTimer: null,
        remainingTime: TURN_TIMEOUT
    };
    console.log(`Session created: ${sessionId}`);
    return sessionId;
}

function joinSession(sessionId, socket) {
    if (!sessions[sessionId]) {
        console.log(`Session ${sessionId} does not exist`);
        socket.emit('error', { message: 'Sitzung existiert nicht' });
        return false;
    }
    const session = sessions[sessionId];
    if (Object.keys(session.players).length >= 2) {
        console.log(`Session ${sessionId} is full`);
        socket.emit('error', { message: 'Sitzung ist voll' });
        return false;
    }
    const playerId = socket.id;
    const playerSymbol = Object.keys(session.players).length === 0 ? 'Spieler 1' : 'Spieler 2';
    const playerColors = { 'Spieler 1': 'Spieler 1 (Rot)', 'Spieler 2': 'Spieler 2 (Grau)' };
    session.players[playerId] = {
        id: playerId,
        name: playerColors[playerSymbol],
        symbol: playerSymbol,
        kittensOnBoard: 0,
        catsOnBoard: 0,
        kittensInSupply: 8, // initial kitten supply
        catsInSupply: 0,    // initial cat supply
        totalPiecesAllowed: 8,
        specialPromotionOffered: false
    };
    socket.join(sessionId);
    console.log(`Player ${playerId} joined session ${sessionId} as ${playerSymbol}`);
    socket.emit('playerAssignment', { playerId, symbol: playerSymbol, name: playerColors[playerSymbol] });
    io.to(sessionId).emit('playerJoined', { playerId, name: playerColors[playerSymbol] });
    if (Object.keys(session.players).length === 2) {
        session.gameActive = true;
        session.currentPlayer = 'Spieler 1';
        console.log(`Game started in session ${sessionId}`);
        io.to(sessionId).emit('gameStart', {
            board: session.gameBoard,
            currentPlayer: session.currentPlayer,
            supplies: Object.values(session.players).reduce((acc, p) => {
                acc[p.symbol] = { kittensInSupply: p.kittensInSupply, catsInSupply: p.catsInSupply };
                return acc;
            }, {}),
            remainingTime: TURN_TIMEOUT / 1000 // Send remaining time in seconds
        });
        
        // Start the timer for the first player
        startTurnTimer(sessionId);
    }
    return true;
}

// Helper function to perform the booping
function boopPieces(board, placedRow, placedCol, playersMap) {
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
                    // Return removed piece to supply
                    const playerEntry = Object.values(playersMap).find(p => p.symbol === pieceToBoop.player);
                    if (pieceToBoop.type === 'kitten') {
                        playerEntry.kittensInSupply++;
                    } else if (pieceToBoop.type === 'cat') {
                        playerEntry.catsInSupply++;
                    }
                    console.log(`[DEBUG] ${pieceToBoop.type} booped off board for player ${playerEntry.symbol}. Supplies now kittens:${playerEntry.kittensInSupply}, cats:${playerEntry.catsInSupply}`);
                    board[neighborRow][neighborCol] = null;
                    boopedPieces.push({from: [neighborRow, neighborCol], to: null});
                }
            }
        }
    }
    return boopedPieces;
}

// Helper function to check for kitten promotion
function checkForKittenPromotion(board, playerSymbol, sessionId, outCatCoordinate, playersMap) {
    const session = sessions[sessionId];
    if (!session) {
        console.log(`Session ${sessionId} does not exist for promotion check`);
        return false;
    }
    const player = Object.values(session.players).find(p => p.symbol === playerSymbol);
    if (!player) {
        console.log(`Player with symbol ${playerSymbol} not found in session ${sessionId}`);
        return false;
    }

    const directions = [
        [0, 1], [1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [0, -1], [-1, 0]
    ];

    let promotionOccurred = false;
    const checked = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (checked[row][col]) continue;
            const piece = board[row][col];
            if (piece && piece.player === playerSymbol && piece.type === 'kitten') {
                checked[row][col] = true;
                for (const [dx, dy] of directions) {
                    let count = 1;
                    let lineKittens = [[row, col]];
                    for (let i = 1; i < 3; i++) {
                        const newRow = row + i * dx;
                        const newCol = col + i * dy;
                        if (newRow < 0 || newRow >= BOARD_SIZE || newCol < 0 || newCol >= BOARD_SIZE) break;
                        const nextPiece = board[newRow][newCol];
                        if (nextPiece && nextPiece.player === playerSymbol && nextPiece.type === 'kitten') {
                            count++;
                            lineKittens.push([newRow, newCol]);
                            checked[newRow][newCol] = true;
                        } else {
                            break;
                        }
                    }
                    if (count === 3) {
                        // Always upgrade: remove kittens except pivot, return them to supply, and promote pivot to cat
                        promotionOccurred = true;
                        // Remove non-pivot kittens and return to supply
                        lineKittens.forEach(([r, c]) => {
                            if (!(r === row && c === col)) {
                                board[r][c] = null;
                                player.kittensOnBoard--;
                                player.kittensInSupply++;
                            }
                        });
                        // Promote pivot kitten to cat
                        board[row][col] = { player: playerSymbol, type: 'cat' };
                        player.catsOnBoard++;
                        outCatCoordinate.row = row;
                        outCatCoordinate.col = col;
                        console.log(`Promotion at [${row}, ${col}] for player ${playerSymbol} in session ${sessionId}`);
                        const booped = boopPieces(board, row, col, playersMap);
                        console.log(`Booped pieces after promotion: ${booped.length}`);
                        updatePlayerPieceCounts(board, session.players);
                        if (player.catsOnBoard === player.totalPiecesAllowed) {
                            session.gameActive = false;
                            const message = `${player.name} GEWINNT, indem alle ${player.totalPiecesAllowed} Katzen platziert wurden! Spiel beendet.`;
                            io.to(sessionId).emit('gameOver', { winnerName: player.name, board: session.gameBoard });
                            io.to(sessionId).emit('gameState', { board: session.gameBoard, currentPlayer: null, message: message });
                            console.log(message);
                        }
                        break;
                    }
                }
            }
        }
    }
    return promotionOccurred;
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
    console.log(`[DEBUG] Piece counts updated: Spieler 1 Kittens: ${Object.values(playersMap)[0]?.kittensOnBoard}, Cats: ${Object.values(playersMap)[0]?.catsOnBoard}, Supply: ${Object.values(playersMap)[0]?.catsInSupply} | Spieler 2 Kittens: ${Object.values(playersMap)[1]?.kittensOnBoard}, Cats: ${Object.values(playersMap)[1]?.catsOnBoard}, Supply: ${Object.values(playersMap)[1]?.catsInSupply}`);
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
        // Diagonal TL-BR
        [[0,0],[1,1],[2,2]], [[1,1],[2,2],[3,3]], [[2,2],[3,3],[4,4]], [[3,3],[4,4],[5,5]],
        [[0,1],[1,2],[2,3]], [[1,2],[2,3],[3,4]], [[2,3],[3,4],[4,5]],
        [[0,2],[1,3],[2,4]], [[1,3],[2,4],[3,5]],
        [[0,3],[1,4],[2,5]],
        [[1,0],[2,1],[3,2]], [[2,1],[3,2],[4,3]], [[3,2],[4,3],[5,4]],
        [[2,0],[3,1],[4,2]], [[3,1],[4,2],[5,3]],
        [[3,0],[4,1],[5,2]],
        // Diagonal BL-TR
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

// Helper to detect lines of three contiguous pieces and return them to supply
function handleTripleRemoval(board, playersMap, playerSymbol) {
    const playerEntry = Object.values(playersMap).find(p => p.symbol === playerSymbol);
    if (!playerEntry) return 0;
    const directions = [[0,1], [1,0], [1,1], [1,-1]];
    let tripleCount = 0;
    const removedSet = new Set();
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            for (const [dr, dc] of directions) {
                const coords = [[r, c], [r + dr, c + dc], [r + 2*dr, c + 2*dc]];
                // Detect and remove triples of contiguous pieces (excluding pure cat triples)
                if (coords.every(([rr, cc]) =>
                    rr >= 0 && rr < BOARD_SIZE &&
                    cc >= 0 && cc < BOARD_SIZE &&
                    board[rr][cc] &&
                    board[rr][cc].player === playerSymbol
                ) &&
                !coords.every(([rr, cc]) => board[rr][cc].type === 'cat')) {
                    if (coords.some(([rr, cc]) => removedSet.has(`${rr},${cc}`))) continue;
                    // Remove the triple and add cats to supply
                    coords.forEach(([rr, cc]) => {
                        board[rr][cc] = null;
                        removedSet.add(`${rr},${cc}`);
                    });
                    playerEntry.catsInSupply += 3;
                    tripleCount++;
                }
            }
        }
    }
    return tripleCount;
}

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('joinSession', (data) => {
        if (!data || !data.sessionId) {
            console.log(`Invalid joinSession request from ${socket.id}`);
            socket.emit('error', { message: 'Ungültige Sitzungs-ID' });
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
            socket.emit('error', { message: 'Ungültige Sitzungs-ID' });
            return;
        }
        const { row, col, sessionId, pieceType } = data;
        // Determine piece type: default to kitten
        const type = pieceType === 'cat' ? 'cat' : 'kitten';
        console.log(`Move requested by ${socket.id} in session ${sessionId} at [${row}, ${col}]`);
        const session = sessions[sessionId];
        if (!session) {
            console.log(`Session ${sessionId} does not exist for move by ${socket.id}`);
            socket.emit('error', { message: 'Sitzung existiert nicht' });
            return;
        }
        if (!session.gameActive) {
            console.log(`Game not active in session ${sessionId} for move by ${socket.id}`);
            socket.emit('error', { message: 'Spiel ist nicht aktiv' });
            return;
        }
        const playerId = socket.id;
        const player = session.players[playerId];
        if (!player) {
            console.log(`Player ${playerId} not in session ${sessionId}`);
            socket.emit('error', { message: 'Du bist nicht in diesem Spiel' });
            return;
        }
        if (player.symbol !== session.currentPlayer) {
            console.log(`Not ${playerId}'s turn in session ${sessionId}`);
            socket.emit('error', { message: 'Du bist nicht am Zug' });
            return;
        }
        if (session.gameBoard[row][col] !== null) {
            console.log(`Cell [${row}, ${col}] already occupied in session ${sessionId}`);
            socket.emit('error', { message: 'Feld ist bereits besetzt' });
            return;
        }

        // Offer special promotion if board is full (all pieces on board)
        if (!player.specialPromotionOffered && player.kittensOnBoard + player.catsOnBoard === player.totalPiecesAllowed) {
            player.specialPromotionOffered = true;
            socket.emit('offerSpecialPromotion', { message: 'Du hast alle deine Figuren auf dem Spielfeld und kannst ein Kätzchen verbessern.' });
            io.to(sessionId).emit('gameState', {
                board: session.gameBoard,
                currentPlayer: session.currentPlayer,
                message: `${player.name} hat alle Figuren auf dem Spielfeld und kann ein Kätzchen verbessern.`,
                supplies: Object.values(session.players).reduce((acc, p) => { acc[p.symbol] = { kittensInSupply: p.kittensInSupply, catsInSupply: p.catsInSupply }; return acc; }, {})
            });
            return;
        }
        // Check supply for selected piece
        if (type === 'kitten' && player.kittensInSupply <= 0) {
            console.log(`Player ${playerId} has no kittens in supply in session ${sessionId}`);
            socket.emit('error', { message: 'Du hast keine Kätzchen im Vorrat' });
            return;
        }
        if (type === 'cat' && player.catsInSupply <= 0) {
            console.log(`Player ${playerId} has no cats in supply in session ${sessionId}`);
            socket.emit('error', { message: 'Du hast keine Katzen im Vorrat' });
            return;
        }

        // Place the selected piece
        const placedPiece = { player: player.symbol, type };
        session.gameBoard[row][col] = placedPiece;
        if (type === 'kitten') {
            player.kittensInSupply--;
            player.kittensOnBoard++;
        } else {
            player.catsInSupply--;
            player.catsOnBoard++;
        }
        console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} placed by ${playerId} at [${row}, ${col}] in session ${sessionId}`);

        // Process booping
        const booped = boopPieces(session.gameBoard, row, col, session.players);

        // Handle triple-line promotion: remove all three pieces to supply
        let removedTriples = handleTripleRemoval(session.gameBoard, session.players, player.symbol);
        let promotedToCats = removedTriples > 0;
        let outCatCoordinate = { row: null, col: null };

        // Update counts
        updatePlayerPieceCounts(session.gameBoard, session.players);

        // Global detection: three cats in a row for any player
        for (const pid in session.players) {
            const sym2 = session.players[pid].symbol;
            if (checkForWin(session.gameBoard, sym2)) {
                session.gameActive = false;
                const winnerName = session.players[pid].name;
                const winMsg = `${winnerName} GEWINNT mit drei Katzen in einer Reihe! Spiel beendet.`;
                io.to(sessionId).emit('gameOver', { winnerName, board: session.gameBoard });
                io.to(sessionId).emit('gameState', {
                    board: session.gameBoard,
                    currentPlayer: null,
                    message: winMsg,
                    supplies: Object.values(session.players).reduce((acc, p) => { acc[p.symbol] = { kittensInSupply: p.kittensInSupply, catsInSupply: p.catsInSupply }; return acc; }, {})
                });
                return;
            }
        }

        
        // log how many cats are on board
        console.log(`Player ${playerId} has ${player.catsOnBoard} cats on board in session ${sessionId}`);
        // Check if player has won by placing all 8 cats
        if (player.catsOnBoard === player.totalPiecesAllowed) {
            session.gameActive = false;
            const message = `${player.name} GEWINNT, indem alle ${player.totalPiecesAllowed} Katzen platziert wurden! Spiel beendet.`;
            io.to(sessionId).emit('gameOver', { winnerName: player.name, board: session.gameBoard });
            io.to(sessionId).emit('gameState', { board: session.gameBoard, currentPlayer: null, message: message });
            console.log(message);
            return;
        }

        // Offer special promotion if player has all pieces on board
        if (player.kittensOnBoard + player.catsOnBoard === player.totalPiecesAllowed && !player.specialPromotionOffered) {
            player.specialPromotionOffered = true;
            socket.emit('offerSpecialPromotion', { message: 'Du hast alle deine Figuren auf dem Spielfeld und kannst ein Kätzchen verbessern.' });
            io.to(sessionId).emit('gameState', {
                board: session.gameBoard,
                currentPlayer: session.currentPlayer,
                message: `${player.name} hat alle Figuren auf dem Spielfeld und kann ein Kätzchen verbessern.`,
                supplies: Object.values(session.players).reduce((acc, p) => { acc[p.symbol] = { kittensInSupply: p.kittensInSupply, catsInSupply: p.catsInSupply }; return acc; }, {})
            });
            return;
        }

        // Global detection: remove triple lines of contiguous pieces (excluding pure cat triples) and add cats to supply
        for (const pid of Object.keys(session.players)) {
            const sym2 = session.players[pid].symbol;
            const removedTriples = handleTripleRemoval(session.gameBoard, session.players, sym2);
            if (removedTriples > 0) {
                updatePlayerPieceCounts(session.gameBoard, session.players);
                io.to(sessionId).emit('gameState', {
                    board: session.gameBoard,
                    currentPlayer: session.currentPlayer,
                    message: `${session.players[pid].name} hat ${removedTriples * 3} Figuren entfernt und ${removedTriples * 3} Katzen erhalten.`,
                    supplies: Object.values(session.players).reduce((acc, p) => { acc[p.symbol] = { kittensInSupply: p.kittensInSupply, catsInSupply: p.catsInSupply }; return acc; }, {})
                });
            }
        }

        const win = checkForWin(session.gameBoard, player.symbol);

        // Switch player and start timer
        switchTurnAndStartTimer(sessionId);

        // Emit update to all in session
        io.to(sessionId).emit('moveMade', {
            board: session.gameBoard,
            currentPlayer: session.currentPlayer,
            booped,
            promotedToCats,
            outCatCoordinate,
            win,
            playerId,
            supplies: Object.values(session.players).reduce((acc, p) => {
                acc[p.symbol] = { kittensInSupply: p.kittensInSupply, catsInSupply: p.catsInSupply };
                return acc;
            }, {}),
            remainingTime: TURN_TIMEOUT / 1000 // Send remaining time in seconds
        });
        console.log(`Move update emitted to session ${sessionId}`);

        // Offer special promotion to next player if they have all pieces on board
        const nextPlayerId = Object.keys(session.players).find(pid => session.players[pid].symbol === session.currentPlayer);
        const nextPlayer = session.players[nextPlayerId];
        if (nextPlayer.kittensOnBoard + nextPlayer.catsOnBoard === nextPlayer.totalPiecesAllowed && !nextPlayer.specialPromotionOffered) {
            nextPlayer.specialPromotionOffered = true;
            io.to(nextPlayerId).emit('offerSpecialPromotion', { message: 'Du hast alle deine Figuren auf dem Spielfeld und kannst ein Kätzchen verbessern.' });
        }
    });

    socket.on('executeSpecialPromotion', (data) => {
        const { row, col, sessionId } = data;
        const session = sessions[sessionId];
        if (!session) {
            socket.emit('error', { message: 'Sitzung existiert nicht' });
            return;
        }
        if (!session.gameActive) {
            socket.emit('error', { message: 'Spiel ist nicht aktiv' });
            return;
        }
        const playerId = socket.id;
        const player = session.players[playerId];
        if (!player) {
            socket.emit('error', { message: 'Du bist nicht in diesem Spiel' });
            return;
        }
        if (!player.specialPromotionOffered) {
            socket.emit('actionError', { message: 'Spezialbeförderung jetzt nicht möglich.' });
            return;
        }
        if (row === undefined || col === undefined || row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
            socket.emit('actionError', { message: 'Ungültige Koordinaten für Spezialbeförderung.' });
            console.log(`[ERROR] Invalid coordinates for special promotion by ${player.name}: [${row},${col}]`);
            return;
        }

        const playerRecord = session.players[playerId]; // Player data for the current player
        const piece = session.gameBoard[row][col];

        // Validate: Must have all pieces on board for special promotion rule
        if (playerRecord.kittensOnBoard + playerRecord.catsOnBoard !== playerRecord.totalPiecesAllowed) {
            socket.emit('actionError', { message: 'Du musst alle deine Figuren auf dem Spielfeld haben, um sie zu verbessern.' });
            console.log(`[ERROR] Special promotion by ${player.name} failed: does not have all pieces on board (has ${playerRecord.kittensOnBoard + playerRecord.catsOnBoard}).`);
            return;
        }

        // Validate: Clicked piece must be player's own kitten
        if (!piece || piece.type !== 'kitten' || piece.player !== player.symbol) {
            socket.emit('actionError', { message: 'Du kannst nur dein eigenes Kätzchen verbessern.' });
            console.log(`[ERROR] Special promotion by ${player.name} failed: piece at [${row},${col}] is not their kitten.`);
            return;
        }

        let message = `${player.name} hat eine Spezialbeförderung bei [${row},${col}] durchgeführt.`;

        // Perform special promotion: remove a kitten and add a cat to supply
        session.gameBoard[row][col] = null;
        playerRecord.catsInSupply++;
        console.log(`[DEBUG] Special promotion for ${player.symbol}. Cats in supply: ${playerRecord.catsInSupply}`);

        // After special promotion: update counts and switch turn
        updatePlayerPieceCounts(session.gameBoard, session.players);
        switchTurnAndStartTimer(sessionId);
        message += ` ${session.currentPlayer} ist am Zug.`;
        io.to(sessionId).emit('gameState', {
            board: session.gameBoard,
            currentPlayer: session.currentPlayer,
            message: message,
            supplies: Object.values(session.players).reduce((acc, p) => { acc[p.symbol] = { kittensInSupply: p.kittensInSupply, catsInSupply: p.catsInSupply }; return acc; }, {})
        });
        console.log(`Current player: ${session.currentPlayer}`);
        playerRecord.specialPromotionOffered = false;
        socket.emit('hideSpecialPromotion');
        return;
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
                    // Clear any existing timer
                    if (session.turnTimer) {
                        clearTimeout(session.turnTimer);
                        session.turnTimer = null;
                    }
                    console.log(`Game ended in session ${sessionId} due to player disconnect`);
                    io.to(sessionId).emit('gameEnd', { reason: 'Ein Spieler hat die Verbindung getrennt' });
                }
            }
        }
    });
});

// Function to start the turn timer for a session
function startTurnTimer(sessionId) {
    const session = sessions[sessionId];
    if (!session || !session.gameActive) return;
    
    // Clear any existing timer
    if (session.turnTimer) {
        clearTimeout(session.turnTimer);
    }
    
    // Reset the remaining time
    session.remainingTime = TURN_TIMEOUT;
    
    // Emit the initial timer value
    io.to(sessionId).emit('timerUpdate', { remainingTime: session.remainingTime / 1000 });
    
    // Start a new timer
    session.turnTimer = setTimeout(() => {
        if (session && session.gameActive) {
            console.log(`Timer expired for player ${session.currentPlayer} in session ${sessionId}`);
            
            // Switch to the next player
            switchTurnAndStartTimer(sessionId);
            
            // Notify players that the turn was skipped due to timeout
            io.to(sessionId).emit('turnSkipped', {
                message: `${session.currentPlayer === 'Spieler 1' ? 'Spieler 2' : 'Spieler 1'} hat nicht innerhalb von 30 Sekunden gespielt. Der Zug wurde übersprungen.`,
                currentPlayer: session.currentPlayer
            });
        }
    }, TURN_TIMEOUT);
    
    // Update the timer every second
    const timerInterval = setInterval(() => {
        if (session && session.gameActive && session.remainingTime > 0) {
            session.remainingTime -= 1000;
            io.to(sessionId).emit('timerUpdate', { remainingTime: session.remainingTime / 1000 });
        } else {
            clearInterval(timerInterval);
        }
    }, 1000);
}

// Function to switch turns and start a new timer
function switchTurnAndStartTimer(sessionId) {
    const session = sessions[sessionId];
    if (!session || !session.gameActive) return;
    
    // Switch player
    session.currentPlayer = session.currentPlayer === 'Spieler 1' ? 'Spieler 2' : 'Spieler 1';
    console.log(`Turn switched to ${session.currentPlayer} in session ${sessionId}`);
    
    // Start a new timer for the next player
    startTurnTimer(sessionId);
}

server.listen(port, () => console.log(`Listening on port ${port}`));
